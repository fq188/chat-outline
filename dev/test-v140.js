/**
 * v1.4.0 回归测试：目录的「结构」要一致、要能一眼读懂
 *
 * 现场（见 mock-mess.html，11 轮 / 3 天）：
 *   1. 最前面 4 条提问的日期分隔条没渲染出来 → 原来它们「散在组外面」，
 *      面板变成「几条散条目 + 几个组头」，一眼就是乱的
 *   2. 中间有「1/2」「2/3」这种长得像日期的文本（其实是题号 / 页码）
 *      → 原来被当成日期分隔条，把一段对话劈成三块
 *   3. 十几条的小对话被「组数 > 3」的自动折叠规则折成几个空壳组头
 *
 * 检查项：
 *   1. 每条提问都必须在某个分组里（不能再有散落在外面的 .item）
 *   2. 「1/2」「2/3」不再被当成日期分组
 *   3. 十一二条的小对话默认全部展开（不再自动折叠）
 *   4. 日期标签中文化：1/2 → 1月2日 这类
 *   5. 组内有连接脊线，层级看得出来
 *   6. 收起时 tooltip 补上「第 N–M 问」范围
 *   7. 工具条用「N 段 · M 轮」（有「更早」占位组时不说「天」）
 *   8. 编号 1..11 连续、无未捕获异常
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

const STATE = (page) =>
  page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const list = sr.querySelector('.list');
    const groups = Array.from(sr.querySelectorAll('.grp'));
    const items = Array.from(sr.querySelectorAll('.item'));
    // 直接挂在 .list 下面的 .item = 没有归属的「散条目」
    const loose = Array.from(list.children).filter((el) => el.classList.contains('item')).length;
    const rail = groups.length ? getComputedStyle(groups[0].querySelector('.grpbody'), '::before') : null;
    return {
      groups: groups.map((g) => ({
        day: g.dataset.day,
        folded: g.classList.contains('folded'),
        user: g.querySelectorAll('.item.user').length
      })),
      loose,
      total: items.length,
      qs: items.filter((i) => i.classList.contains('user')).map((i) => parseInt(i.querySelector('.idx').textContent, 10)),
      gsum: (sr.querySelector('.gbar .gsum') || {}).textContent || '',
      range: (sr.querySelector('.grphead') || {}).title || '',
      railW: rail ? rail.width : '',
      railBg: rail ? rail.backgroundColor : ''
    };
  });

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const html = fs.readFileSync(path.join(__dirname, 'mock-mess.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/mess', { waitUntil: 'domcontentloaded' });

  let st;
  for (let i = 0; i < 60; i += 1) {
    st = await STATE(page);
    if (st.qs.length >= 11) break;
    await page.waitForTimeout(200);
  }

  // ---------- 1. 结构一致：不允许散条目 ----------
  check('11 条提问全部进了目录', st.qs.length === 11, String(st.qs.length));
  check('没有散落在分组外面的条目', st.loose === 0, `${st.loose} 条散落`);
  check(
    '每条提问都有归属（各组问答数之和 = 11）',
    st.groups.reduce((n, g) => n + g.user, 0) === 11,
    st.groups.map((g) => `${g.day}:${g.user}`).join(' ')
  );

  // ---------- 2. 假日期不再被当成日期 ----------
  const days = st.groups.map((g) => g.day);
  check('没有「1/2」这种假日期分组', !days.includes('1/2'), days.join(' / '));
  check('没有「2/3」这种假日期分组', !days.includes('2/3'), days.join(' / '));
  check('真实日期「今天」还在', days.includes('今天'), days.join(' / '));
  check(
    '开头那几条归入「更早」',
    days[0] === '更早' && st.groups[0].user === 10,
    `${days[0]}:${st.groups[0] && st.groups[0].user}`
  );

  // ---------- 3. 小对话不自动折叠 ----------
  check('11 条的小对话默认全部展开', st.groups.every((g) => !g.folded), JSON.stringify(st.groups.map((g) => g.folded)));

  // ---------- 4. 编号连续 ----------
  check('编号 1..11 连续', st.qs.join(',') === '1,2,3,4,5,6,7,8,9,10,11', st.qs.join(','));

  // ---------- 5. 组内脊线 ----------
  check('组内有连接脊线（1px）', st.railW === '1px' && st.railBg !== 'rgba(0, 0, 0, 0)', `${st.railW} ${st.railBg}`);

  // ---------- 6. 工具条 ----------
  check('工具条用「N 段 · M 轮」', /2 段 · 11 轮/.test(st.gsum), st.gsum);

  // ---------- 7. 收起后补范围 ----------
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelector('.grphead').click();
  });
  await page.waitForTimeout(150);
  st = await STATE(page);
  check('收起后 tooltip 带上「第 1–10 问」范围', /第 1–10 问/.test(st.range), st.range);
  check('收起后组内条目不占位', st.groups[0].folded === true, String(st.groups[0].folded));

  check('无未捕获异常', errors.length === 0, errors.join(' | '));

  // ---------- 8. 216px 窄面板 ----------
  await page.setViewportSize({ width: 647, height: 352 });
  await page.waitForTimeout(500);
  const narrow = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const list = sr.querySelector('.list');
    const head = sr.querySelector('.grphead');
    return {
      overflow: list.scrollWidth - list.clientWidth,
      headH: head ? Math.round(head.getBoundingClientRect().height) : 0,
      panelW: Math.round(sr.querySelector('.panel, .app, body > div').getBoundingClientRect().width)
    };
  });
  check('窄面板不出现横向溢出', narrow.overflow <= 1, `${narrow.overflow}px`);
  check('窄面板组头不折行（高度 ≤ 30px）', narrow.headH > 0 && narrow.headH <= 30, `${narrow.headH}px`);

  // 截图存档（宽 / 窄各一张）
  await page.screenshot({ path: path.join(__dirname, 'shots', 'v140-narrow.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    sr.querySelector('.grphead').click();
  });
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(__dirname, 'shots', 'v140-panel.png'),
    clip: { x: 1000, y: 0, width: 440, height: 700 }
  });

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})();
