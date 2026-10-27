/**
 * v1.2.3 回归测试：虚拟列表下的「全量目录」
 *   1. 仿真页面确实是虚拟列表（DOM 里只留一小部分消息）
 *   2. 目录最终还是能把整段对话收全（30 条提问，不是点开那几条）
 *   3. 编号 1..30 连续，不因卸载重挂错位
 *   4. 手动滚动到底部后条目数不减少、也不重复
 *   5. 点第 1 条（当前已被卸载）能滚回顶部并高亮
 *   6. 点第 30 条（当前已滚到顶部）能滚到底部并高亮
 *   7. 全程无未捕获异常
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

async function waitFor(page, fn, timeout = 15000, interval = 200) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) return v;
    await page.waitForTimeout(interval);
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
  await page.goto('https://chatgpt.com/c/virtual-test', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // 页面自身确认是虚拟列表
  const mounted = await page.evaluate(() => window.__mountedCount());
  const totalMsgs = await page.evaluate(() => window.__msgTotal);
  check('仿真页面是虚拟列表（DOM 只留一部分）', mounted > 0 && mounted < totalMsgs / 2, `${mounted}/${totalMsgs}`);

  const items = () =>
    page.evaluate(() => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      return Array.from(sr.querySelectorAll('.item')).map((li) => ({
        idx: (li.querySelector('.idx') || {}).textContent,
        txt: (li.querySelector('.txt') || {}).textContent
      }));
    });

  const full = await waitFor(page, async () => {
    const l = await items();
    return l.length >= 30 ? l : null;
  });
  const list = full || (await items());
  check('目录收全 30 条提问', list.length === 30, `实际 ${list.length} 条`);
  const idxs = list.map((x) => parseInt(x.idx, 10));
  const seqOk = idxs.every((n, i) => n === i + 1);
  check('编号 1..30 连续', seqOk && idxs.length === 30, idxs.slice(0, 5).join(',') + '…' + idxs.slice(-2).join(','));
  check('没有重复条目', new Set(list.map((x) => x.txt)).size === list.length, `${new Set(list.map((x) => x.txt)).size}/${list.length}`);

  // 手动滚到底：条目数不能缩水
  await page.evaluate(() => {
    const sc = document.getElementById('scroller');
    sc.scrollTop = sc.scrollHeight;
  });
  await page.waitForTimeout(900);
  const afterScroll = await items();
  check('滚到底部后仍是 30 条', afterScroll.length === 30, `实际 ${afterScroll.length} 条`);

  // 点第 1 条（此时已在视口外、被卸载）
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelectorAll('.item')[0].click();
  });
  await page.waitForTimeout(150);
  const topState = await page.evaluate(async () => {
    const sc = document.getElementById('scroller');
    const t0 = Date.now();
    let best = { scrollTop: sc.scrollTop, outline: '' };
    while (Date.now() - t0 < 4000) {
      const a = document.querySelector('[data-testid="conversation-turn-0"]');
      const o = a ? a.style.outline || '' : '';
      best = { scrollTop: sc.scrollTop, outline: o };
      if (/solid/.test(o)) return best;
      await new Promise((r) => setTimeout(r, 100));
    }
    return best;
  });
  check('点第 1 条能滚回顶部', topState.scrollTop < 240, String(topState.scrollTop));
  check('第 1 条被高亮', /solid/.test(topState.outline), topState.outline);

  // 点第 30 条（需要滚到底部，那条当时也未渲染）
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const all = sr.querySelectorAll('.item');
    all[all.length - 1].click();
  });
  await page.waitForTimeout(150);
  const bottomState = await page.evaluate(async () => {
    const sc = document.getElementById('scroller');
    const t0 = Date.now();
    const snap = () => {
      const a =
        document.querySelector('[data-testid="conversation-turn-58"]') ||
        document.querySelector('[data-testid="conversation-turn-59"]');
      return {
        scrollTop: sc.scrollTop,
        max: sc.scrollHeight - sc.clientHeight,
        outline: a ? a.style.outline || '' : 'missing'
      };
    };
    let best = snap();
    while (Date.now() - t0 < 4000) {
      best = snap();
      if (/solid/.test(best.outline)) return best;
      await new Promise((r) => setTimeout(r, 100));
    }
    return best;
  });
  check(
    '点第 30 条能滚到对话末尾',
    bottomState.max - bottomState.scrollTop < 500,
    `${Math.round(bottomState.scrollTop)}/${Math.round(bottomState.max)}`
  );
  check('最后一条被高亮', /solid/.test(bottomState.outline), bottomState.outline);

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('TEST CRASHED:', e.message);
  process.exit(1);
});
