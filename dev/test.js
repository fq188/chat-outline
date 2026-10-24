const fs = require('fs');
const path = require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });

  const html = fs.readFileSync(path.join(__dirname, 'mock.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: fs.readFileSync(path.join(ROOT, 'content.js'), 'utf8') });
  await page.goto('https://chatgpt.com/c/abc123', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const snap = async () =>
    page.evaluate(() => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      return {
        open: sr.querySelector('.app').dataset.open,
        theme: sr.querySelector('.app').dataset.theme,
        count: sr.querySelector('.count').textContent,
        items: [...sr.querySelectorAll('.item')].map(
          (li) => li.querySelector('.idx').textContent + '|' + li.querySelector('.txt').textContent.slice(0, 16)
        ),
        active: (sr.querySelector('.item.active') || {}).dataset?.key || null,
        scrollY: window.scrollY,
        panelBox: (() => {
          const b = sr.querySelector('.panel').getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
        })()
      };
    });

  const s1 = await snap();
  log('1) 初次加载:', JSON.stringify(s1, null, 1));
  await page.screenshot({ path: path.join(SHOTS, '01-loaded.png') });

  // 点击第 3 个提问
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelectorAll('.item')[2].click();
  });
  await page.waitForTimeout(900);
  const s2 = await snap();
  log('2) 点击第3个提问 ->', JSON.stringify({ active: s2.active, scrollY: s2.scrollY }, null, 1));
  const outlined = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="conversation-turn-5"] .msg') || document.querySelector('[data-testid="conversation-turn-5"]');
    return el ? el.style.outline : 'no-target';
  });
  log('   目标高亮 outline =', outlined);
  await page.screenshot({ path: path.join(SHOTS, '02-jumped.png') });

  // 打开「显示AI回答」
  await page.evaluate(() => {
    document.getElementById('chat-outline-host').shadowRoot.querySelector('[data-act="asst"]').click();
  });
  await page.waitForTimeout(300);
  const s3 = await snap();
  log('3) 显示回答后 count =', s3.count, ' 条目数 =', s3.items.length);
  log('   ', s3.items.join(' / '));
  await page.screenshot({ path: path.join(SHOTS, '03-with-answers.png') });

  // 搜索
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const inp = sr.querySelector('.search input');
    inp.value = '下雨';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const s4 = await snap();
  log('4) 搜索 "下雨" count =', s4.count, ' 命中 =', s4.items.length, s4.items.join(' / '));
  await page.screenshot({ path: path.join(SHOTS, '04-search.png') });

  // 导出
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelector('.search input').value = '';
    sr.querySelector('.search input').dispatchEvent(new Event('input', { bubbles: true }));
  });
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 5000 }).catch(() => null),
    page.evaluate(() => document.getElementById('chat-outline-host').shadowRoot.querySelector('[data-act="export"]').click())
  ]);
  if (dl) {
    const p = path.join(SHOTS, 'export.md');
    await dl.saveAs(p);
    const md = fs.readFileSync(p, 'utf8');
    log('5) 导出成功:', dl.suggestedFilename(), ' 长度 =', md.length);
    log('--- md 前 12 行 ---');
    log(md.split('\n').slice(0, 12).join('\n'));
  } else {
    log('5) 导出失败：没有触发下载');
  }

  // 收起 / 展开
  await page.evaluate(() => document.getElementById('chat-outline-host').shadowRoot.querySelector('[data-act="close"]').click());
  await page.waitForTimeout(300);
  const closed = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return {
      open: sr.querySelector('.app').dataset.open,
      launcherVisible: !!(sr.querySelector('.launcher').offsetParent || sr.querySelector('.launcher').getClientRects().length)
    };
  });
  log('6) 收起后:', JSON.stringify(closed));
  await page.screenshot({ path: path.join(SHOTS, '05-collapsed.png') });

  // 暗色模式检查
  await page.evaluate(() => {
    document.body.style.background = '#212121';
    document.body.style.color = '#ececec';
  });
  await page.evaluate(() => document.getElementById('chat-outline-host').shadowRoot.querySelector('.launcher').click());
  await page.waitForTimeout(400);
  const dark = await page.evaluate(() => document.getElementById('chat-outline-host').shadowRoot.querySelector('.app').dataset.theme);
  log('7) 暗色背景检测 theme =', dark);
  await page.screenshot({ path: path.join(SHOTS, '06-dark.png') });

  log('\n页面错误:', errors.length ? errors : '无');
  await browser.close();
})();
