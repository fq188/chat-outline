/**
 * v1.2.1 回归测试
 *   1. 同一条消息连续跳转两次，高亮必须在 1.5s 后消失（不能残留描边）
 *   2. 跳到新消息时，上一条的高亮立即清除（屏幕上只有一圈）
 *   3. 列表项支持键盘 Enter / 空格跳转
 *   4. 搜索命中关键词以 <mark> 高亮，大小写不敏感且不改变原文
 *   5. 下载失败 + 无 clipboard：只提示，不抛未捕获异常
 *   6. 下载失败 + clipboard 可用：退回复制并给出提示
 *   7. 图标按钮与搜索框带 aria-label
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

const clickItem = (page, i) =>
  page.evaluate((i) => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelectorAll('.item')[i].click();
  }, i);
const outlineOf = (page, testid) =>
  page.evaluate(
    (testid) => (document.querySelector(`[data-testid="${testid}"]`) || { style: {} }).style.outline || '',
    testid
  );

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const html = fs.readFileSync(path.join(__dirname, 'mock.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/v121', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  // ---------- 1. 同一条连续跳转，高亮不残留 ----------
  await clickItem(page, 2);
  await page.waitForTimeout(400);
  await clickItem(page, 2);
  const during = await outlineOf(page, 'conversation-turn-5');
  check('跳转后目标出现高亮', during.includes('solid'), during);
  await page.waitForTimeout(1800);
  const after = await outlineOf(page, 'conversation-turn-5');
  check('连续跳转后高亮按时消失（不残留）', after === '', JSON.stringify(after));

  // ---------- 2. 换一条跳转，旧高亮立即清除 ----------
  await clickItem(page, 0);
  await page.waitForTimeout(250);
  await clickItem(page, 2);
  const oldOne = await outlineOf(page, 'conversation-turn-1');
  const newOne = await outlineOf(page, 'conversation-turn-5');
  check('跳到新消息后旧高亮立即清除', oldOne === '', JSON.stringify(oldOne));
  check('新目标保持高亮', newOne.includes('solid'), newOne);
  await page.waitForTimeout(1700);

  // ---------- 3. 键盘 Enter / 空格 ----------
  const kb = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const items = sr.querySelectorAll('.item');
    const third = items[3];
    third.focus();
    third.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const enterKey = (sr.querySelector('.item.active') || {}).dataset?.key || null;
    const fourth = items[4];
    fourth.focus();
    fourth.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    const spaceKey = (sr.querySelector('.item.active') || {}).dataset?.key || null;
    return {
      expectedEnter: third.dataset.key,
      enterKey,
      expectedSpace: fourth.dataset.key,
      spaceKey,
      tabbable: [...items].every((li) => li.tabIndex === 0 && li.getAttribute('role') === 'button')
    };
  });
  check('Enter 触发跳转', kb.enterKey === kb.expectedEnter, JSON.stringify(kb));
  check('空格触发跳转', kb.spaceKey === kb.expectedSpace);
  check('列表项可聚焦且带 button 角色', kb.tabbable);
  await page.waitForTimeout(1700);

  // ---------- 4. 搜索高亮 ----------
  const hl = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const input = sr.querySelector('.search input');
    input.value = 'icoca';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const marks = [...sr.querySelectorAll('.item mark')];
    const first = sr.querySelector('.item .txt');
    return {
      count: sr.querySelector('.count').textContent,
      marks: marks.map((m) => m.textContent),
      allMatch: marks.length > 0 && marks.every((m) => m.textContent.toLowerCase() === 'icoca'),
      keepsCase: first ? first.textContent.includes('ICOCA') : false
    };
  });
  check('搜索过滤生效', hl.count === '1/6', hl.count);
  check('命中词被 <mark> 高亮（大小写不敏感）', hl.allMatch, JSON.stringify(hl.marks));
  check('高亮不改变原始大小写', hl.keepsCase);

  // ---------- 5. 无 clipboard 的降级 ----------
  const noClip = await page.evaluate(async () => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const input = sr.querySelector('.search input');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    window.URL.createObjectURL = () => {
      throw new Error('blocked');
    };
    Object.defineProperty(navigator, 'clipboard', { get: () => undefined, configurable: true });
    sr.querySelector('[data-act="export"]').click();
    await new Promise((r) => setTimeout(r, 250));
    return sr.querySelector('.toast').textContent;
  });
  check('无 clipboard 时导出失败只提示', noClip.includes('导出失败'), noClip);

  // ---------- 6. 有 clipboard 的降级 ----------
  const withClip = await page.evaluate(async () => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    Object.defineProperty(navigator, 'clipboard', {
      get: () => ({ writeText: () => Promise.resolve() }),
      configurable: true
    });
    sr.querySelector('[data-act="export"]').click();
    await new Promise((r) => setTimeout(r, 250));
    return sr.querySelector('.toast').textContent;
  });
  check('有 clipboard 时退回复制', withClip.includes('剪贴板'), withClip);

  // ---------- 7. aria 标签 ----------
  const aria = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return (
      ['asst', 'side', 'export', 'refresh', 'close'].every((a) =>
        sr.querySelector(`[data-act="${a}"]`).getAttribute('aria-label')
      ) && !!sr.querySelector('.search input').getAttribute('aria-label')
    );
  });
  check('按钮与搜索框带 aria-label', aria);

  check('全程无未捕获异常', errors.length === 0, errors.join('; ') || '无');

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('V1.2.1 TEST FAILED:', e.message);
  process.exit(1);
});
