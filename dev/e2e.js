const fs = require('fs'), path = require('path'), os = require('os');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();
const EXT = path.resolve(__dirname, '..');
const UDD = path.join(os.tmpdir(), 'co-udd-' + Date.now());

(async () => {
  const ctx = await chromium.launchPersistentContext(UDD, {
    ...launchOptions(),
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run']
  });
  const html = fs.readFileSync(path.join(__dirname, 'mock.html'), 'utf8');
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('https://chatgpt.com/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
  await page.goto('https://chatgpt.com/c/e2e', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const res = await page.evaluate(() => {
    const h = document.getElementById('chat-outline-host');
    if (!h) return { injected: false };
    const sr = h.shadowRoot;
    return {
      injected: true,
      open: sr.querySelector('.app').dataset.open,
      count: sr.querySelector('.count').textContent,
      items: sr.querySelectorAll('.item.user').length
    };
  });
  console.log('content script 注入:', res);
  console.log('service workers:', ctx.serviceWorkers().length);
  console.log('页面错误:', errs.length ? errs : '无');
  await page.screenshot({ path: path.join(__dirname, 'shots', '20-e2e.png') });
  await ctx.close();
})().catch(e => { console.log('E2E FAILED:', e.message); process.exit(1); });
