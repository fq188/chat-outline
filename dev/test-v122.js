/**
 * v1.2.2 回归测试：图片消息
 *   1. 纯图片提问也要进目录（此前无文字被 `if (!raw) continue` 丢掉）
 *   2. 通用 alt（"已上传的图片"）归一成 [图片]
 *   3. 有意义的 alt（"error-dialog.png"）显示成 [图片：error-dialog.png]
 *   4. 文字 + 图片时只显示文字，不叠加 [图片]，避免噪声
 *   5. 24px 小图标不计入图片数量（不能出现 [图片 ×2]）
 *   6. 图片条目可以点击跳转并高亮
 *   7. 搜索「图片」能筛出两条图片消息
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
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return Array.from(sr.querySelectorAll('.item.user .txt')).map((n) => (n.innerText || '').trim());
  });

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const html = fs.readFileSync(path.join(__dirname, 'mock-image.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/image-test', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const t = await textsOf(page);

  check('目录里有 4 条提问', t.length === 4, JSON.stringify(t));
  check('纯图片消息显示为 [图片]', t[1] === '[图片]', t[1]);
  check(
    '通用 alt 不重复显示成 [图片 ×2]（小图标被忽略）',
    t[1] === '[图片]',
    t[1]
  );
  check('有意义的 alt 显示文件名', t[3] === '[图片：error-dialog.png]', t[3]);
  check('文字 + 图片只显示文字', (t[2] || '').startsWith('这个配色你觉得怎么样'), t[2]);
  check('文字 + 图片不叠加 [图片]', !(t[2] || '').includes('[图片'), t[2]);

  // 点击纯图片条目应能跳到对应消息并高亮
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelectorAll('.item.user')[1].click();
  });
  await page.waitForTimeout(400);
  const outline = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="conversation-turn-3"]');
    return a ? a.style.outline || '' : 'missing';
  });
  check('图片条目可跳转并高亮', /solid/.test(outline), outline);

  // 搜索「图片」应命中两条（纯图片 + 带文件名的那条）
  const hits = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const input = sr.querySelector('.search input');
    input.value = '图片';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return new Promise((res) =>
      setTimeout(() => res(Array.from(sr.querySelectorAll('.item.user .txt')).map((n) => (n.innerText || '').trim())), 300)
    );
  });
  check('搜索「图片」命中 2 条', hits.length === 2, JSON.stringify(hits));

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('TEST CRASHED:', e.message);
  process.exit(1);
});
