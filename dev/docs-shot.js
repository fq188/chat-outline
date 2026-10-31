// 生成 README 用的演示图：3 个时间分组 + 提问编号 + 回答一行预览
const fs = require('fs');
const path = require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();
const CONTENT = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

(async () => {
  const b = await chromium.launch({ ...launchOptions(), headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const html = fs.readFileSync(path.join(__dirname, 'mock-timeline.html'), 'utf8');
  await p.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await p.addInitScript({ content: CONTENT });
  await p.goto('https://chatgpt.com/c/timeline?start=bottom', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3200);
  await p.screenshot({ path: path.join(__dirname, '..', 'docs', 'demo-timeline.png') });
  await b.close();
  console.log('docs/demo-timeline.png 已更新');
})();
