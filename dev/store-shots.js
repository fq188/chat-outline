/**
 * 商店截图：1280×800（Edge Add-ons 要求的两种尺寸之一），输出到 ../store/screenshots/
 * 1-outline.png   面板打开 + 点击跳转高亮（核心价值一目了然）
 * 2-answers.png   开启「答」，目录含 AI 回答与时间戳
 * 3-search.png    搜索过滤
 * 4-auto.png      陌生站点自动识别（绿色「自动」徽标）
 */
const fs = require('fs');
const path = require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();

const EXT = path.resolve(__dirname, '..');
const OUT = path.join(EXT, 'store', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const CONTENT = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
const VP = { width: 1280, height: 800 };

async function openMock(browser, url, mockFile) {
  const page = await browser.newPage({ viewport: VP });
  const html = fs.readFileSync(path.join(__dirname, mockFile), 'utf8');
  await page.route(new URL(url).origin + '/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  return page;
}

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });

  // 1. 跳转高亮
  {
    const page = await openMock(browser, 'https://chatgpt.com/c/store1', 'mock.html');
    await page.evaluate(() => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      sr.querySelectorAll('.item')[2].click();
    });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, '1-outline.png') });
    await page.close();
  }

  // 2. 显示 AI 回答
  {
    const page = await openMock(browser, 'https://chatgpt.com/c/store2', 'mock.html');
    await page.evaluate(() => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      sr.querySelector('[data-act="asst"]').click();
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, '2-answers.png') });
    await page.close();
  }

  // 3. 搜索过滤
  {
    const page = await openMock(browser, 'https://chatgpt.com/c/store3', 'mock.html');
    await page.evaluate(() => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      const input = sr.querySelector('.search input');
      input.value = '拉曼';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, '3-search.png') });
    await page.close();
  }

  // 4. 陌生站自动识别
  {
    const page = await openMock(browser, 'https://kimi.com/chat/store4', 'mock-generic.html');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, '4-auto.png') });
    await page.close();
  }

  await browser.close();
  console.log('商店截图完成 ->', OUT);
})().catch((e) => {
  console.log('STORE SHOTS FAILED:', e.message);
  process.exit(1);
});
