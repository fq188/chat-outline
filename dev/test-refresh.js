/**
 * 刷新 / 延迟渲染回归测试
 *   1. 首次加载能列出全部提问
 *   2. 刷新（真实 reload）后目录自动恢复，不需要任何交互
 *   3. 首屏是骨架、内容 1.8s 后才渲染时，目录能自动补上
 *   4. 连续刷新两次仍然稳定
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

const textsOf = (page) =>
  page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host')?.shadowRoot;
    return sr ? Array.from(sr.querySelectorAll('.item .txt')).map((n) => (n.innerText || '').trim()) : [];
  });

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const chatgpt = fs.readFileSync(path.join(__dirname, 'mock.html'), 'utf8');
  const late = fs.readFileSync(path.join(__dirname, 'mock-late.html'), 'utf8');
  let body = chatgpt;
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body })
  );
  await page.addInitScript({ content: CONTENT });

  await page.goto('https://chatgpt.com/c/refresh', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1400);
  check('首次加载列出 6 条', (await textsOf(page)).length === 6);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const afterReload = await textsOf(page);
  check('刷新后目录自动恢复 6 条', afterReload.length === 6, afterReload.length);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('连续刷新仍为 6 条', (await textsOf(page)).length === 6);

  // 骨架 → 延迟渲染
  body = late;
  await page.goto('https://chatgpt.com/c/late', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const early = await textsOf(page);
  await page.waitForTimeout(3200);
  const settled = await textsOf(page);
  check('骨架期目录为空', early.length === 0, JSON.stringify(early));
  check('内容到位后自动补全 2 条', settled.length === 2, JSON.stringify(settled));

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  // 扩展上下文失效 / 存储回调不返回时，目录也必须能出来
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p2.addInitScript({
    content: `window.chrome = {
      storage: { local: { get: function () {}, set: function () {} } },
      runtime: { lastError: null, onMessage: { addListener: function () {} } }
    };`
  });
  await p2.addInitScript({ content: CONTENT });
  await p2.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: chatgpt })
  );
  await p2.goto('https://chatgpt.com/c/hung-storage', { waitUntil: 'domcontentloaded' });
  await p2.waitForTimeout(2200);
  const hung = await textsOf(p2);
  check('存储回调卡住时目录仍能加载 6 条', hung.length === 6, hung.length);
  await p2.close();

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('TEST CRASHED:', e.message);
  process.exit(1);
});
