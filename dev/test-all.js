const fs = require('fs');
const path = require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();

const EXT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const CONTENT = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');

async function runCase(browser, name, url, mockFile, shot) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const html = fs.readFileSync(path.join(__dirname, mockFile), 'utf8');
  const base = new URL(url).origin + '/**';
  await page.route(base, (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.addInitScript({ content: CONTENT });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const info = await page.evaluate(() => {
    const h = document.getElementById('chat-outline-host');
    if (!h) return { mounted: false };
    const sr = h.shadowRoot;
    return {
      mounted: true,
      open: sr.querySelector('.app').dataset.open,
      has: sr.querySelector('.app').dataset.has,
      auto: !sr.querySelector('.auto').hidden,
      count: sr.querySelector('.count').textContent,
      items: [...sr.querySelectorAll('.item.user')].map((li) => li.querySelector('.idx').textContent + '|' + li.querySelector('.txt').textContent.slice(0, 22))
    };
  });

  // 点第一条 + 开「答」
  let jump = null;
  if (info.mounted && info.items && info.items.length) {
    jump = await page.evaluate(async () => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      sr.querySelectorAll('.item.user')[0].click();
      await new Promise((r) => setTimeout(r, 700));
      sr.querySelector('[data-act="asst"]').click();
      await new Promise((r) => setTimeout(r, 200));
      return {
        active: (sr.querySelector('.item.active') || {}).dataset?.key || null,
        n: sr.querySelectorAll('.item.user').length
      };
    });
  }

  if (shot) await page.screenshot({ path: path.join(SHOTS, shot) });
  console.log(`\n=== ${name} (${url}) ===`);
  console.log(' mount:', info.mounted, '| 自动识别:', info.auto, '| 提问数:', info.count, '| launcher:', info.has);
  if (info.items) console.log(' items:', info.items.join(' / ') || '(空)');
  if (jump) console.log(' 点击首条后 active:', jump.active, '| 打开答后条目:', jump.n);
  console.log(' 错误:', errors.length ? errors : '无');
  await page.close();
  return { info, errors };
}

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });

  await runCase(browser, 'A. ChatGPT（站点硬适配）', 'https://chatgpt.com/c/abc123', 'mock.html', '10-chatgpt.png');
  await runCase(browser, 'B. 陌生站（靠「编辑」按钮启发式）', 'https://kimi.com/chat/xyz', 'mock-generic.html', '11-heuristic.png');
  await runCase(browser, 'C. 陌生站（靠 class 命名）', 'https://perplexity.ai/search/abc', 'mock-universal.html', '12-universal.png');
  await runCase(browser, 'D. 无对话页面（应完全不出现）', 'https://poe.com/', 'mock-empty.html', null);

  await browser.close();
})();
