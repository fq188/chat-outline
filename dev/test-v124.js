/**
 * v1.2.4 回归测试：补扫的稳与全
 *   1. 渲染比滚动慢 250ms 的虚拟列表，仍能把 30 条提问收全（旧版按固定 50ms 采会漏）
 *   2. 序号 1..30 连续，没有缺口
 *   3. 刷新页面后立即就是完整 30 条（sessionStorage 缓存，不必重扫）
 *   4. 缓存不会串到别的会话
 *   5. 全程无未捕获异常
 */
const fs = require('fs');
const path = require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();

const EXT = path.resolve(__dirname, '..');
const CONTENT = fs.readFileSync(process.env.CONTENT_FILE || path.join(EXT, 'content.js'), 'utf8');

let failed = 0;
function check(name, cond, extra) {
  console.log(` ${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? ' -> ' + extra : ''}`);
  if (!cond) failed++;
}

const readItems = (page) =>
  page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return Array.from(sr.querySelectorAll('.item')).map((li) => ({
      idx: (li.querySelector('.idx') || {}).textContent,
      txt: (li.querySelector('.txt') || {}).textContent
    }));
  });

async function waitCount(page, n, timeout = 20000) {
  const t0 = Date.now();
  for (;;) {
    const l = await readItems(page);
    if (l.length >= n) return l;
    if (Date.now() - t0 > timeout) return l;
    await page.waitForTimeout(200);
  }
}

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const html = fs.readFileSync(path.join(__dirname, 'mock-virtual.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });

  // 1) 慢渲染虚拟列表
  await page.goto('https://chatgpt.com/c/slow-render?delay=250', { waitUntil: 'domcontentloaded' });
  const slow = await waitCount(page, 30);
  check('慢渲染(250ms)下仍收全 30 条', slow.length === 30, `实际 ${slow.length} 条`);
  const idxs = slow.map((x) => parseInt(x.idx, 10));
  check('编号 1..30 连续无缺口', idxs.every((n, i) => n === i + 1) && idxs.length === 30, idxs.slice(0, 4).join(',') + '…');

  // 2) 刷新：缓存直接给出完整目录
  await page.reload({ waitUntil: 'domcontentloaded' });
  const quick = await waitCount(page, 30, 5000);
  const elapsed = await page.evaluate(() => {
    const t0 = performance.now();
    return new Promise((res) => {
      const tick = () => {
        const sr = document.getElementById('chat-outline-host');
        if (sr && sr.shadowRoot && sr.shadowRoot.querySelectorAll('.item').length >= 30) return res(performance.now() - t0);
        if (performance.now() - t0 > 3000) return res(-1);
        requestAnimationFrame(tick);
      };
      tick();
    });
  });
  check('刷新后目录仍是 30 条', quick.length === 30, `实际 ${quick.length} 条`);
  check('刷新后无需重新扫完全程（缓存命中）', elapsed >= 0 && elapsed < 2500, `${Math.round(elapsed)}ms`);

  // 3) 换会话：不能带出上一段的条目
  await page.goto('https://chatgpt.com/c/another?delay=0', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const other = await readItems(page);
  check('切换会话后目录重建，不串场', other.length === 30 && other[0].txt.includes('第 1 个问题'), `${other.length} 条`);

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('TEST CRASHED:', e.message);
  process.exit(1);
});
