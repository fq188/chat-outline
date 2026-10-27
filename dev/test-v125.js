/**
 * v1.2.5 回归测试：真实症状复刻
 *   场景：对话停在底部，只有最后一条很长（900px）的回答在 DOM 里，
 *        上面几轮全被虚拟列表卸载。此时「已渲染高度」占容器比例够高，
 *        只看覆盖率判断就不会补扫 —— 用户看到的就是「只有几条」。
 *   1. 目录应把 3 个提问全部列出
 *   2. 编号 1..3 连续
 *   3. 手动点 ⟳ 后仍然完整
 *   4. 无未捕获异常
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
    return Array.from(sr.querySelectorAll('.item.user')).map((li) => ({
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

  await page.goto('https://chatgpt.com/c/mess?spec=mess&start=bottom', { waitUntil: 'domcontentloaded' });

  // 初始只挂了 1~2 条
  const mounted = await page.evaluate(() => window.__mountedCount());
  check('初始只挂载了少部分消息', mounted <= 3, `${mounted}/6`);

  const list = await waitCount(page, 3);
  check('目录收全 3 个提问', list.length === 3, `实际 ${list.length} 条`);
  const idxs = list.map((x) => parseInt(x.idx, 10));
  check('编号 1..3 连续', idxs.every((n, i) => n === i + 1) && idxs.length === 3, idxs.join(','));

  // 手动重扫不应把已有条目弄丢
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelector('[data-act="refresh"]').click();
  });
  await page.waitForTimeout(4000);
  const again = await readItems(page);
  check('点 ⟳ 重扫后仍是 3 条', again.length === 3, `实际 ${again.length} 条`);

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('TEST CRASHED:', e.message);
  process.exit(1);
});
