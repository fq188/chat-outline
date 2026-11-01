/**
 * v1.5.3 回归测试：点「答」条目不能满页乱滚、不能反复闪
 *
 * 现场（v1.5.2 用户反馈）：点目录里的回答条目，页面来回跳、一直闪。
 * 根因：v1.5.2 把所有条目的跳转都改成「按文本指纹找真身」，
 * 但回答是 Markdown 渲染的 —— 接口给 `## 结论` / `**加粗**` / 代码块原文，
 * 页面里是渲染后的纯文本，两边指纹永远不相等 → 严格匹配失败 →
 * 退化成整页探测滚动（几十次 scrollTop）→ 看起来就是「来回跳转 + 一闪一闪」。
 *
 * 修法：只有「双胞胎提问」（同文本多条）才按接口序号找真身；
 * 普通条目信配对给的 el（配对已经把唯一的全文对上了）。
 *
 * 检查项：
 *   1. 点未挂载的回答条目 → 高亮的是那一轮的回答（不是别的消息）
 *   2. 只闪一次（不是反复闪）
 *   3. 滚动次数受控（不是满页扫）
 *   4. 点提问条目仍然准
 *   5. 没有「找不到」提示
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

const TURNS = 12;

// 回答：接口给 Markdown 原文，页面渲染成纯文本 —— 两边指纹对不上（真实情况）
function md(i) {
  return {
    api: [
      `## 第 ${i} 问的结论`,
      '',
      `**核心**：矩阵 $A$ 可逆，且 $A^{-1}$ 存在。`,
      '',
      '```python',
      `x = solve(${i})`,
      '```',
      '',
      `| 步骤 | 说明 |`,
      `| --- | --- |`,
      `| 1 | 验证行列式非零（第 ${i} 步） |`
    ].join('\n'),
    dom: `第 ${i} 问的结论\n核心：矩阵 A 可逆，且 A⁻¹ 存在。\nx = solve(${i})\n步骤 说明\n1 验证行列式非零（第 ${i} 步）`
  };
}

const MSGS = [];
for (let i = 0; i < TURNS; i += 1) {
  MSGS.push({
    id: 'u' + i,
    role: 'user',
    text: `第 ${i + 1} 问：这个矩阵可逆吗？请给出推导与结论`,
    ts: Math.floor(Date.now() / 1000) - (TURNS - i) * 60
  });
  const m = md(i + 1);
  MSGS.push({
    id: 'a' + i,
    role: 'assistant',
    text: m.dom,
    api: m.api,
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
        content: { content_type: 'text', parts: [m.api || m.text] }
      }
    };
  });
  return { title: 'md', current_node: 'n' + (MSGS.length - 1), mapping };
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
  // mock-newui 按 text 渲染，接口那条用 api（Markdown 原文）
  await page.addInitScript({ content: 'window.__MSGS__ = ' + JSON.stringify(MSGS.map((m) => ({ role: m.role, text: m.text, files: m.files }))) + ';' });
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/8c3d4e5f-1111-2222-3333-444455556666', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  return page;
}

// 点第 idx 个某类条目（.item.user / .item.asst），读落点
async function clickAndInspect(page, sel, idx) {
  await page.evaluate(() => {
    window.__hits = [];
    if (window.__mo) window.__mo.disconnect();
    window.__mo = new MutationObserver((ms) => {
      for (const m of ms) {
        const el = m.target;
        if (!el || el.tagName !== 'ARTICLE') continue;
        if (el.style.outline && el.style.outline !== '') {
          // 一次 flash 会连着写 outline / outlineOffset / borderRadius 三条 style，
          // 只记「连续相同的同一条」，否则一次闪会被数成三下
          const tag = el.getAttribute('data-role') + ':' + el.getAttribute('data-q');
          if (window.__hits[window.__hits.length - 1] !== tag) window.__hits.push(tag);
        }
      }
    });
    window.__mo.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });
  });
  const before = await page.evaluate(() => window.__scrolls);
  await page.evaluate(
    (o) => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      const items = Array.from(sr.querySelectorAll(o.sel));
      items[o.idx].click();
    },
    { sel, idx }
  );
  await page.waitForTimeout(2400);
  const res = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const toast = sr.querySelector('.toast') ? sr.querySelector('.toast').textContent : '';
    const last = window.__hits[window.__hits.length - 1];
    const el = last ? document.querySelector('article[data-role="' + last.split(':')[0] + '"][data-q="' + last.split(':')[1] + '"]') : null;
    const mid = window.innerHeight / 2;
    let dist = -1;
    if (el) {
      const r = el.getBoundingClientRect();
      dist = Math.round(Math.abs(r.top + r.height / 2 - mid));
    }
    return { hits: window.__hits.slice(), last, dist, toast, scrolls: window.__scrolls };
  });
  return { ...res, delta: res.scrolls - before };
}

(async () => {
  browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await boot();
  await page.waitForTimeout(2500);

  const st = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    return {
      users: sr.querySelectorAll('.item.user').length,
      asst: sr.querySelectorAll('.item.asst').length,
      // 「答」预览默认打开？
      asstVisible: (() => {
        const a = sr.querySelector('.item.asst');
        return !!a && a.offsetHeight > 0;
      })()
    };
  });
  check('拿到 12 问 12 答', st.users === TURNS && st.asst === TURNS, `${st.users} 问 / ${st.asst} 答`);

  // 回答条目：初始停在底部，第 3 答（idx 2）没挂着
  let r = await clickAndInspect(page, '.item.asst', 2);
  check('点第 3 答 → 高亮第 3 答', r.last === 'assistant:2', `last=${r.last}`);
  check('  只闪一次（没有反复闪）', r.hits.length === 1, `闪 ${r.hits.length} 次: ${r.hits.join(',')}`);
  check('  落在视口中间附近', r.dist >= 0 && r.dist < 320, `偏离中心 ${r.dist}px`);
  check('  滚动次数受控（没有满页扫）', r.delta <= 6, `${r.delta} 次`);
  check('  没有「找不到」提示', !/找不到/.test(r.toast), r.toast || '无提示');

  // 再点一个更早的回答
  r = await clickAndInspect(page, '.item.asst', 0);
  check('点第 1 答 → 高亮第 1 答', r.last === 'assistant:0', `last=${r.last}`);
  check('  只闪一次', r.hits.length === 1, `闪 ${r.hits.length} 次: ${r.hits.join(',')}`);
  check('  滚动次数受控', r.delta <= 8, `${r.delta} 次`);

  // 提问条目不受影响
  r = await clickAndInspect(page, '.item.user', 5);
  check('点第 6 问 → 高亮第 6 问', r.last === 'user:5', `last=${r.last}`);
  check('  只闪一次', r.hits.length === 1, `闪 ${r.hits.length} 次: ${r.hits.join(',')}`);
  check('  滚动次数受控', r.delta <= 6, `${r.delta} 次`);

  check('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('测试崩溃:', e.message);
  process.exit(1);
});
