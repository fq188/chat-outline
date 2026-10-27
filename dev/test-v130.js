/**
 * v1.3.0 回归测试：时间线分组 + 回答缩进 + 折叠
 *   1. 按页面上的日期分隔条分出 3 个一级分组（今天 / 昨天 / 10月24日）
 *   2. 每组下面提问 + 回答都在，回答紧跟在提问之后
 *   3. 回答的缩进比提问明显深（左侧留白 + 引导线），一眼能分开
 *   4. 点分组标题折叠 / 展开，折叠的条目不占位
 *   5. 刷新后折叠状态还在（sessionStorage）
 *   6. 搜索时自动展开命中的分组，清空搜索后恢复原来的折叠
 *   7. 点回答条目能跳转并高亮（回答也能当导航用）
 *   8. 无未捕获异常
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

const GROUPS = (page) =>
  page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return Array.from(sr.querySelectorAll('.grp')).map((g) => {
      const items = Array.from(g.querySelectorAll('.item'));
      return {
        day: g.dataset.day,
        folded: g.classList.contains('folded'),
        expanded: (g.querySelector('.grphead') || {}).getAttribute
          ? g.querySelector('.grphead').getAttribute('aria-expanded')
          : null,
        rounds: (g.querySelector('.gmeta') || {}).textContent || '',
        user: items.filter((li) => li.classList.contains('user')).length,
        asst: items.filter((li) => li.classList.contains('asst')).length,
        order: items.map((li) => (li.classList.contains('user') ? 'Q' : 'A')).join(''),
        visible: items.filter((li) => li.offsetParent !== null).length
      };
    });
  });

const SET_SEARCH = (page, text) =>
  page.evaluate((t) => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const input = sr.querySelector('.search input');
    input.value = t;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const html = fs.readFileSync(path.join(__dirname, 'mock-timeline.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/timeline?start=bottom', { waitUntil: 'domcontentloaded' });

  // 等面板出来
  for (let i = 0; i < 60; i += 1) {
    const n = await page.evaluate(() => {
      const host = document.getElementById('chat-outline-host');
      if (!host || !host.shadowRoot) return 0;
      return host.shadowRoot.querySelectorAll('.item').length;
    });
    if (n >= 12) break;
    await page.waitForTimeout(200);
  }

  // ---------- 1. 分组 ----------
  let gs = await GROUPS(page);
  check('分出 3 个时间分组', gs.length === 3, gs.map((g) => g.day).join(' / '));
  check(
    '分组标题是 今天 / 昨天 / 10月24日',
    gs.map((g) => g.day).join(',') === '今天,昨天,10月24日',
    gs.map((g) => g.day).join(',')
  );
  check('每组 2 轮', gs.every((g) => g.rounds.indexOf('2 轮') >= 0), gs.map((g) => g.rounds).join(' | '));

  // ---------- 2. 提问 + 回答都在，且一问答交替 ----------
  check('每组 2 问 2 答', gs.every((g) => g.user === 2 && g.asst === 2), JSON.stringify(gs[0]));
  check('提问后面紧跟回答', gs.every((g) => g.order === 'QAQA'), gs.map((g) => g.order).join(','));

  // ---------- 3. 回答缩进 ----------
  // 量「文字」的左边而不是盒子的左边：用户感受到的缩进是文字位置
  const indent = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const q = sr.querySelector('.item.user');
    const a = sr.querySelector('.item.asst');
    const qt = q.querySelector('.txt').getBoundingClientRect();
    const at = a.querySelector('.txt').getBoundingClientRect();
    const cs = getComputedStyle(a);
    return { diff: Math.round(at.left - qt.left), border: cs.borderLeftWidth };
  });
  check('回答文字比提问多缩进 ≥ 20px（约两个字）', indent.diff >= 20, `${indent.diff}px`);
  check('回答有左侧引导线', parseFloat(indent.border) >= 2, indent.border);

  // ---------- 4. 折叠 / 展开 ----------
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const head = Array.from(sr.querySelectorAll('.grphead')).find((h) => h.dataset.day === '昨天');
    head.click();
  });
  await page.waitForTimeout(200);
  gs = await GROUPS(page);
  const yest = gs.find((g) => g.day === '昨天');
  check('点标题后「昨天」收起', yest.folded === true && yest.expanded === 'false', JSON.stringify(yest));
  check('收起后该组条目不占位', yest.visible === 0, `${yest.visible} 条可见`);
  check('其它组不受影响', gs.filter((g) => g.day !== '昨天').every((g) => !g.folded && g.visible === 4));

  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const head = Array.from(sr.querySelectorAll('.grphead')).find((h) => h.dataset.day === '昨天');
    head.click();
  });
  await page.waitForTimeout(200);
  gs = await GROUPS(page);
  check('再点一下展开', gs.find((g) => g.day === '昨天').visible === 4);

  // ---------- 5. 折叠状态跨刷新保留 ----------
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    Array.from(sr.querySelectorAll('.grphead'))
      .find((h) => h.dataset.day === '昨天')
      .click();
  });
  await page.waitForTimeout(300);
  await page.reload({ waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 60; i += 1) {
    const ok = await page.evaluate(() => {
      const host = document.getElementById('chat-outline-host');
      return !!(host && host.shadowRoot && host.shadowRoot.querySelectorAll('.grp').length);
    });
    if (ok) break;
    await page.waitForTimeout(200);
  }
  gs = await GROUPS(page);
  check(
    '刷新后折叠状态还在',
    gs.length === 3 && gs.find((g) => g.day === '昨天').folded === true,
    gs.map((g) => `${g.day}:${g.folded ? 'folded' : 'open'}`).join(' ')
  );

  // ---------- 6. 搜索自动展开命中分组 ----------
  await SET_SEARCH(page, '退火');
  await page.waitForTimeout(250);
  gs = await GROUPS(page);
  const hit = gs.find((g) => g.day === '昨天');
  check('搜索时被折叠的分组自动展开', hit.folded === false && hit.visible >= 2, JSON.stringify(hit));
  const marked = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return Array.from(sr.querySelectorAll('.item')).filter((li) => li.querySelector('mark')).length;
  });
  check('命中项有高亮标记', marked >= 1, `${marked} 条`);

  await SET_SEARCH(page, '');
  await page.waitForTimeout(250);
  gs = await GROUPS(page);
  check('清空搜索后恢复原折叠', gs.find((g) => g.day === '昨天').folded === true);

  // ---------- 7. 点回答能跳转 ----------
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const a = Array.from(sr.querySelectorAll('.item.asst')).find((li) =>
      li.textContent.indexOf('碘化钾') >= 0
    );
    a.click();
  });
  await page.waitForTimeout(1200);
  const jumped = await page.evaluate(() => {
    const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn"]'));
    const hit = turns.find((t) => (t.textContent || '').indexOf('碘化钾') >= 0);
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return {
      outline: hit ? hit.style.outline || '' : 'missing',
      active: (sr.querySelector('.item.active') || {}).className || ''
    };
  });
  check('点回答能跳到对应消息并高亮', /solid/.test(jumped.outline), jumped.outline || 'none');
  check('回答条目自己也高亮', jumped.active.indexOf('asst') >= 0 && jumped.active.indexOf('active') >= 0, jumped.active);

  check('无未捕获异常', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('TEST CRASHED:', e.message);
  process.exit(1);
});
