/**
 * v1.5.1 回归测试：点目录里的旧条目，必须跳到「那一条」，不能停在别的回答上
 *
 * 现场（见 mock-same.html）：20 轮对话，每条提问的**前 60 个字完全一样**，
 * 只有后面才不同 —— 真实用户连续追问同一件事时就是这样。
 * 虚拟列表只挂视口附近 10 条，接口一次返回全部 40 条。
 *
 * 旧实现的 bug：
 *   apiKeyOf 每次从接口列表**开头**做「前 60 字前缀」匹配，页面上的第 16 问
 *   会被认成第 1 问（因为前 60 字一样，而前面的候选都还没被占用），
 *   于是点目录跳到了第 1 问，高亮也在第 1 问上。
 *
 * 检查项：
 *   1. 目录条目数正确（20 问 40 条），没有重复
 *   2. 点第 N 问 → 高亮的就是第 N 问，且落在视口中间
 *   3. 跳转过程中页面滚动次数很少（不再「一直跳」）
 *   4. 连续点多个不同位置都准
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
// 必须超过 60 个字：旧实现把文本截断到 60 字做前缀匹配，只有截断后完全一样才会认错人
const PREFIX =
  '帮我优化一下这份实验数据的处理流程，要求更稳定、每一步都能复现，并且把中间结果单独存一份方便回看，' +
  '另外把每一步的耗时也记下来，方便后面定位到底是哪一步慢，这段前缀故意写得比较长，这是第 ';

const MSGS = [];
for (let i = 0; i < TURNS; i += 1) {
  MSGS.push({
    id: 'u' + i,
    role: 'user',
    // 前 60 字完全一致，只有「第 N 问」这个尾巴不同
    text: `${PREFIX}${i + 1} 问`,
    ts: Math.floor(Date.now() / 1000) - (TURNS - i) * 60
  });
  MSGS.push({
    id: 'a' + i,
    role: 'assistant',
    text: `回答：先按第 ${i + 1} 问的步骤走一遍，再把中间结果落盘，最后核对第 ${i + 1} 问的产物。`,
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
  return { title: 'same', current_node: 'n' + (MSGS.length - 1), mapping };
}

const errors = [];
let browser;

async function boot() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  const html = fs.readFileSync(path.join(__dirname, 'mock-same.html'), 'utf8');
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
  await page.goto('https://chatgpt.com/c/6a1b2c3d-1111-2222-3333-444455556666', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return page;
}

// 点第 n 问（0 基），等落定后读「哪一条被高亮 + 它在哪」
// 高亮只闪 1.5 秒，直接等就拍不到了 —— 用 MutationObserver 记录所有闪现过的条目
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
  check('没有重复条目', new Set(st.users).size === st.users.length, String(new Set(st.users).size));
  check('顺序正确：第 1 条是第 1 问', /第 1 问$/.test(st.users[0] || ''), st.users[0].slice(-8));
  check('顺序正确：第 20 条是第 20 问', /第 20 问$/.test(st.users[TURNS - 1] || ''), st.users[TURNS - 1].slice(-8));

  // 逐个点「页面上没挂着」的位置，看是不是跳到对的那一条
  const targets = [2, 9, 15, 5, 18];
  for (const n of targets) {
    const r = await clickAndInspect(page, n);
    const okOne = r.hits.length === 1;
    const rightQ = okOne && r.last === String(n);
    check(
      `点第 ${n + 1} 问 → 高亮的是第 ${n + 1} 问`,
      rightQ,
      okOne ? `高亮在第 ${Number(r.last) + 1} 问` : `高亮过 ${r.hits.length} 条：${r.hits.map((q) => Number(q) + 1).join(',')}`
    );
    check(`  且落在视口中间附近`, okOne && r.dist >= 0 && r.dist < 320, okOne ? `偏离中心 ${r.dist}px` : '-');
    check(`  跳转没把页面来回扫（滚动次数）`, r.delta <= 8, `${r.delta} 次`);
  }

  check('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('测试崩溃:', e.message);
  process.exit(1);
});
