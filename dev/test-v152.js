/**
 * v1.5.2 回归测试：新版 ChatGPT UI 下的目录与跳转
 *
 * 现场（2026-11-01 真实页面确认，见 mock-newui.html）：
 *   1. 每条消息前有可见的「你说：」「ChatGPT 说：」标签
 *   2. 带附件的提问，附件卡片（文件名 + PDF 徽标）混进 innerText：
 *      「HW_07.pdfPDFLec 16 Sturm-Liouville problem(1).pdfPDF详细求解」
 *      —— 和接口给的干净文本「详细求解」配不上，目录里 api 条目和 DOM 条目并存重复
 *   3. 同一对话里真有一字不差的重复提问（第 8 问和第 15 问都是「详细求解」）
 *
 * 检查项：
 *   1. 目录条目数正确（20 问 40 条），附件提问显示为「详细求解」而不是混了文件名的串
 *   2. 目录条目不带「你说：」「ChatGPT 说：」前缀
 *   3. 双胞胎提问：点第 15 问 → 高亮第 15 问；点第 8 问（未挂载）→ 高亮第 8 问
 *   4. 点未挂载的旧条目跳转准、滚动次数少
 *   5. 无未捕获异常
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

const TURNS = 20;
const TWIN_A = 7; // 第 8 问（0 基）
const TWIN_B = 14; // 第 15 问（0 基）
const FILES = ['HW_07.pdf', 'Lec 16 Sturm-Liouville problem(1).pdf'];

const MSGS = [];
for (let i = 0; i < TURNS; i += 1) {
  const isTwin = i === TWIN_A || i === TWIN_B;
  MSGS.push({
    id: 'u' + i,
    role: 'user',
    text: isTwin ? '详细求解' : `第 ${i + 1} 问：帮我推导一下这个边界值问题的本征函数展开，并说明每一步的依据`,
    files: isTwin ? FILES : null,
    ts: Math.floor(Date.now() / 1000) - (TURNS - i) * 60
  });
  MSGS.push({
    id: 'a' + i,
    role: 'assistant',
    text: `回答 ${i + 1}：先分离变量，得到 Sturm-Liouville 形式，再求本征值与本征函数。`,
    ts: Math.floor(Date.now() / 1000) - (TURNS - i) * 60 + 5
  });
}

function conversationJson() {
  const mapping = {};
  MSGS.forEach((m, i) => {
    mapping['n' + i] = {
      id: 'n' + i,
      parent: i ? 'n' + (i - 1) : null,
      children: i < MSGS.length - 1 ? ['n' + (i + 1)] : [],
      message: {
        id: m.id,
        author: { role: m.role },
        create_time: m.ts,
        content: { content_type: 'text', parts: [m.text] }
      }
    };
  });
  return { title: 'newui', current_node: 'n' + (MSGS.length - 1), mapping };
}

const errors = [];
let browser;

async function boot() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  const html = fs.readFileSync(path.join(__dirname, 'mock-newui.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) => {
    const u = r.request().url();
    if (u.indexOf('/backend-api/conversation/') >= 0) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversationJson()) });
    }
    if (u.indexOf('/api/auth/session') >= 0) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"accessToken":"tok"}' });
    }
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.addInitScript({ content: 'window.__MSGS__ = ' + JSON.stringify(MSGS) + ';' });
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/7b2c3d4e-1111-2222-3333-444455556666', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return page;
}

async function clickAndInspect(page, n) {
  await page.evaluate(() => {
    window.__hits = [];
    if (window.__mo) window.__mo.disconnect();
    window.__mo = new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target;
        if (!el || el.tagName !== 'ARTICLE') continue;
        if (el.style.outline && el.style.outline !== '') {
          const q = el.getAttribute('data-q');
          if (window.__hits[window.__hits.length - 1] !== q) window.__hits.push(q);
        }
      }
    });
    window.__mo.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });
  });
  const before = await page.evaluate(() => window.__scrolls);
  await page.evaluate((i) => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const items = Array.from(sr.querySelectorAll('.item.user'));
    items[i].click();
  }, n);
  await page.waitForTimeout(2400);
  const res = await page.evaluate(() => {
    const mid = window.innerHeight / 2;
    const last = window.__hits[window.__hits.length - 1];
    const el = last != null ? document.querySelector('article[data-q="' + last + '"]') : null;
    let dist = -1;
    if (el) {
      const r = el.getBoundingClientRect();
      dist = Math.round(Math.abs(r.top + r.height / 2 - mid));
    }
    return { hits: window.__hits.slice(), last, dist, scrolls: window.__scrolls };
  });
  return { ...res, delta: res.scrolls - before };
}

(async () => {
  browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await boot();
  await page.waitForTimeout(2500);

  const st = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const users = Array.from(sr.querySelectorAll('.item.user')).map((li) => li.querySelector('.txt').textContent.trim());
    return { users, total: sr.querySelectorAll('.item').length };
  });

  check('目录里拿到 20 问 40 条', st.users.length === TURNS && st.total === TURNS * 2, `${st.users.length} 问 / ${st.total} 条`);

  const twins = st.users.filter((t) => t.indexOf('详细求解') >= 0);
  check('双胞胎提问恰好 2 条', twins.length === 2, `${twins.length} 条`);
  check(
    '附件提问显示为「详细求解」（没混文件名/PDF 徽标）',
    twins.length === 2 && twins.every((t) => t === '详细求解'),
    twins.map((t) => t.slice(0, 30)).join(' | ')
  );
  check(
    '目录条目不带「你说：」「ChatGPT 说：」前缀',
    st.users.every((t) => !/^(你说|您说|You said|ChatGPT)/i.test(t)),
    (st.users.find((t) => /^(你说|您说|You said|ChatGPT)/i.test(t)) || '无').slice(0, 30)
  );

  // 双胞胎消歧：第 15 问初始就挂在页面上（mock 停在底部）
  let r = await clickAndInspect(page, TWIN_B);
  check('点第 15 问（双胞胎·后）→ 高亮第 15 问', r.hits.length >= 1 && r.last === String(TWIN_B), `hits=${r.hits.join(',')}`);

  // 第 8 问没挂着：必须滚动去找，且找到的是第 8 问而不是它双胞胎
  r = await clickAndInspect(page, TWIN_A);
  check('点第 8 问（双胞胎·前，未挂载）→ 高亮第 8 问', r.hits.length >= 1 && r.last === String(TWIN_A), `hits=${r.hits.join(',')}`);
  check('  且落在视口中间附近', r.dist >= 0 && r.dist < 320, `偏离中心 ${r.dist}px`);
  check('  跳转没把页面来回扫（滚动次数）', r.delta <= 10, `${r.delta} 次`);

  // 普通条目：点第 3 问（未挂载）
  r = await clickAndInspect(page, 2);
  check('点第 3 问 → 高亮第 3 问', r.hits.length >= 1 && r.last === '2', `hits=${r.hits.join(',')}`);
  check('  滚动次数受控', r.delta <= 10, `${r.delta} 次`);

  check('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('测试崩溃:', e.message);
  process.exit(1);
});
