/**
 * v1.3.2 回归测试：「刚问出的问题必须落在目录末尾」
 *
 * 复刻现场（见 mock-append.html）：
 *   1. 对话已经有 9 轮，目录 1..9 排好；
 *   2. 用户回到第 6 轮改写 / 重发 —— ChatGPT 丢掉第 6 轮之后的，重新生成；
 *   3. 新消息复用了原来的 conversation-turn 编号，档案里那条就被「原地改字」，
 *      而旧分支的 7/8/9 还赖在它后面 —— 于是刚问的那句显示在目录中间。
 *
 * 检查项：
 *   1. 正常追加一轮：新问题在末尾，编号最大
 *   2. 连发三句：顺序对、都在末尾
 *   3. 切分支后重问（编号复用）：新问题在末尾，废弃分支的残留被清掉
 *   4. 消息正文里的「1/2」不会被当成日期分隔条（同一天不被切成两块）
 *   5. 面板原本贴在底部时，新增之后仍然贴在底部（能看见最新那条）
 *   6. 无未捕获异常
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

const READ = (page) =>
  page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const items = Array.from(sr.querySelectorAll('.item'));
    const list = sr.querySelector('.list');
    return {
      days: Array.from(sr.querySelectorAll('.grp')).map((g) => g.dataset.day),
      users: items
        .filter((li) => li.classList.contains('user'))
        .map((li) => ({
          q: parseInt(li.querySelector('.idx').textContent, 10),
          txt: li.querySelector('.txt').textContent.trim()
        })),
      all: items.map((li) => (li.classList.contains('user') ? 'Q' : 'A')).join(''),
      atBottom: list ? list.scrollHeight - list.scrollTop - list.clientHeight < 8 : null,
      count: (sr.querySelector('.count') || {}).textContent || ''
    };
  });

async function waitUsers(page, n, ms) {
  const until = Date.now() + (ms || 6000);
  while (Date.now() < until) {
    const st = await READ(page);
    if (st.users.length >= n) return st;
    await page.waitForTimeout(120);
  }
  return READ(page);
}

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const html = fs.readFileSync(path.join(__dirname, 'mock-append.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/append?n=9', { waitUntil: 'domcontentloaded' });

  // ---------- 0. 初始 9 轮 ----------
  let st = await waitUsers(page, 9);
  check('初始 9 问 9 答', st.users.length === 9 && st.all.length === 18, st.all);
  check('编号 1..9 连续', st.users.map((u) => u.q).join(',') === '1,2,3,4,5,6,7,8,9', st.users.map((u) => u.q).join(','));
  check('只有「今天」一个分组', st.days.length === 1 && st.days[0] === '今天', st.days.join(' / '));

  // ---------- 1. 正常追加一轮 ----------
  await page.evaluate(() => window.__demo.addTurn('这是刚问出的第十个问题，应该出现在目录最后'));
  st = await waitUsers(page, 10);
  const last1 = st.users[st.users.length - 1] || {};
  check('追加后是 10 问', st.users.length === 10, String(st.users.length));
  check('新问题排在最后一条', /刚问出的第十个问题/.test(last1.txt || ''), last1.txt);
  check('新问题编号最大（10）', last1.q === 10, String(last1.q));
  check(
    '追加后编号仍然 1..10 单调',
    st.users.every((u, i) => u.q === i + 1),
    st.users.map((u) => u.q).join(',')
  );

  // ---------- 2. 连发三句 ----------
  await page.evaluate(() => {
    window.__demo.addTurn('连发第一句：先问 MoS2 的峰位');
    window.__demo.addTurn('连发第二句：再问金膜的厚度');
    window.__demo.addTurn('连发第三句：最后问退火温度');
  });
  st = await waitUsers(page, 13);
  const tail3 = st.users.slice(-3).map((u) => u.txt);
  check('连发三句都进了目录', st.users.length === 13, String(st.users.length));
  check(
    '三句顺序与发送顺序一致',
    /连发第一句/.test(tail3[0] || '') && /连发第二句/.test(tail3[1] || '') && /连发第三句/.test(tail3[2] || ''),
    tail3.map((t) => t.slice(0, 6)).join('|')
  );
  check('编号仍然连续到 13', st.users[12] && st.users[12].q === 13, String(st.users[12] && st.users[12].q));

  // ---------- 3. 切分支后重问（站点复用 turn 编号） ----------
  // 回到第 5 轮之后改写：站点把 6/7/8/9 丢掉，新一轮复用原来的编号
  await page.evaluate(() => {
    window.__demo.truncate(5);
    window.__demo.addTurn('这是去年EXAM2的答题卡，根据答题卡内容给出原本的英文题目并详细求解');
  });
  await page.waitForTimeout(1200);
  st = await READ(page);
  const lastB = st.users[st.users.length - 1] || {};
  check('切分支后只留 6 问（废弃分支不再出现）', st.users.length === 6, String(st.users.length));
  check('重问的那句排在最后一条', /EXAM2的答题卡/.test(lastB.txt || ''), lastB.txt);
  check('重问的编号最大（6）', lastB.q === 6, String(lastB.q));
  check(
    '后面没有旧分支残留',
    st.users.every((u, i) => u.q === i + 1),
    st.users.map((u) => u.q).join(',')
  );
  check('仍然只有一个「今天」分组', st.days.length === 1 && st.days[0] === '今天', st.days.join(' / '));

  // ---------- 4. 正文里的「1/2」不当成日期分隔条 ----------
  await page.evaluate(() => window.__demo.fakeFrac());
  await page.waitForTimeout(700);
  st = await READ(page);
  check('正文出现「1/2」后仍只有一个分组', st.days.length === 1, st.days.join(' / '));
  check('分组标签还是「今天」', st.days[0] === '今天', String(st.days[0]));

  // ---------- 5. 面板贴底 ----------
  const stick = await page.evaluate(async () => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const list = sr.querySelector('.list');
    list.scrollTop = list.scrollHeight; // 用户在看最新几条
    await new Promise((r) => setTimeout(r, 60));
    window.__demo.addTurn('贴底测试：新加一句，列表应该跟着滚到底');
    await new Promise((r) => setTimeout(r, 900));
    const users = Array.from(sr.querySelectorAll('.list .item.user'));
    return {
      atBottom: list.scrollHeight - list.scrollTop - list.clientHeight < 8,
      last: users.length ? users[users.length - 1].querySelector('.txt').textContent : ''
    };
  });
  check('新增后目录列表仍贴在底部', stick.atBottom === true, String(stick.atBottom));
  check('底部那条就是刚问的', /贴底测试/.test(stick.last), stick.last.slice(0, 24));

  check('无未捕获异常', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})();
