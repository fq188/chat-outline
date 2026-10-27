/**
 * v1.2.6 回归测试：续扫（一趟扫不完就接着扫）
 *   场景：400 条消息（约 9.4 万 px 长）+ 每次滚动 300ms 才渲染完 ——
 *        一趟补扫的 14s 预算绝对不够走到底，必须「记住位置、下一趟接着走」，
 *        否则最后的 sweptOnce 会把补扫永久锁死，用户看到的就是「收到一半」。
 *   1. 初始只挂载少部分消息
 *   2. 目录最终收全 200 个提问（一趟 14s 预算走不完，必须续扫；不靠手动点 ⟳）
 *   3. 编号 1..200 连续、没有缺口、从头到尾都在（顶部最容易漏）
 *   4. 补扫结束后页面滚回原位（不把用户丢到别处）
 *   5. 无未捕获异常
 */
const fs = require('fs');
const path = require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();

const EXT = path.resolve(__dirname, '..');
const CONTENT = fs.readFileSync(process.env.CONTENT_FILE || path.join(EXT, 'content.js'), 'utf8');

const TOTAL_MSG = 400;
const TOTAL_Q = TOTAL_MSG / 2;

let failed = 0;
function check(name, cond, extra) {
  console.log(` ${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? ' -> ' + extra : ''}`);
  if (!cond) failed++;
}

const readState = (page) =>
  page.evaluate(() => {
    const host = document.getElementById('chat-outline-host');
    const sr = host && host.shadowRoot;
    const its = sr ? Array.from(sr.querySelectorAll('.item.user')) : [];
    const sc = document.getElementById('scroller');
    return {
      top: sc ? Math.round(sc.scrollTop) : 0,
      list: its.map((li) => ({
        idx: (li.querySelector('.idx') || {}).textContent,
        txt: (li.querySelector('.txt') || {}).textContent
      }))
    };
  });

// 等目录长到 n 条；只要补扫还在滚，就不算「卡住」（一轮 14s 走不完会续扫）
async function waitCount(page, n, timeout = 180000) {
  const t0 = Date.now();
  let stable = 0;
  let lastN = -1;
  let lastTop = -1;
  let list = [];
  for (;;) {
    const st = await readState(page);
    list = st.list;
    if (list.length >= n) return list;
    if (list.length === lastN && st.top === lastTop) stable += 1;
    else stable = 0;
    lastN = list.length;
    lastTop = st.top;
    if (Date.now() - t0 > timeout) return list;
    // 条数、滚动位置都 10s 没动 → 认为收敛（真卡住了），早点报错
    if (stable > 50 && list.length > 0) return list;
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

  const url = `https://chatgpt.com/c/huge?n=${TOTAL_MSG}&delay=300&start=bottom`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const totalH = await page.evaluate(() => window.__totalHeight);
  const mounted0 = await page.evaluate(() => window.__mountedCount());
  check('初始只挂载少部分消息', mounted0 <= 20, `${mounted0}/${TOTAL_MSG}，总高 ${totalH}px`);
  check('对话足够长（一趟 14s 走不完）', totalH > 80000, `${totalH}px`);

  const t0 = Date.now();
  const list = await waitCount(page, TOTAL_Q);
  const cost = Math.round((Date.now() - t0) / 1000);

  check(`目录收全 ${TOTAL_Q} 个提问`, list.length === TOTAL_Q, `实际 ${list.length} 条，用时 ${cost}s`);
  const idxs = list.map((x) => parseInt(x.idx, 10));
  const contiguous = idxs.length === TOTAL_Q && idxs.every((n, i) => n === i + 1);
  check('编号 1..N 连续无缺口', contiguous, `${idxs[0]}..${idxs[idxs.length - 1]}`);

  // 补扫会把页面滚来滚去，最后必须停回用户原本的位置。
  // 目录收全的那一刻滚动可能还在收尾，等它停下来再判断。
  let prevTop = -1;
  for (let i = 0; i < 40; i += 1) {
    const t = await page.evaluate(() => Math.round(document.getElementById('scroller').scrollTop));
    if (t === prevTop) break;
    prevTop = t;
    await page.waitForTimeout(300);
  }
  const pos = await page.evaluate(() => {
    const sc = document.getElementById('scroller');
    return { top: Math.round(sc.scrollTop), max: Math.round(sc.scrollHeight - sc.clientHeight) };
  });
  check('补扫后滚回原位（原本在底部）', Math.abs(pos.top - pos.max) < 300, `scrollTop ${pos.top}/${pos.max}`);

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('TEST CRASHED:', e.message);
  process.exit(1);
});
