/**
 * v1.5.0 回归测试：直接读会话接口，不再靠滚动加载
 *
 * 现场（见 mock-api.html）：一段 30 条消息（15 问 15 答）的对话，
 * DOM 里只挂了最后 4 条（跟 ChatGPT 的虚拟列表一样），滚一下就卸载。
 *
 * 检查项：
 *   1. 不滚动页面就能拿到全部 15 问（靠 /backend-api/conversation）
 *   2. 页面几乎没被滚过（补扫要滚十几趟，这里应该 ≤ 2 次）
 *   3. 顺序、编号与接口一致，没有重复条目
 *   4. 日期按接口的 create_time 分成 前天 / 昨天 / 今天
 *   5. 页面上已经渲染的那几条能被配上，点一下就能直接跳
 *   6. 接口失败（401）时自动退回原来的滚动补扫，功能不残
 *   7. 无未捕获异常
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

// —— 造一段 30 条消息的对话：前天 8 条、昨天 8 条、今天 14 条 ——
const NOW = Math.floor(Date.now() / 1000);
const MSGS = [];
for (let i = 0; i < 30; i += 1) {
  const isUser = i % 2 === 0;
  const n = Math.floor(i / 2) + 1;
  const dayAgo = i < 8 ? 2 : i < 16 ? 1 : 0;
  MSGS.push({
    id: 'msg-' + i,
    role: isUser ? 'user' : 'assistant',
    text: isUser
      ? `第 ${n} 个问题：这是一段很长很长的问题，用来验证目录能不能不滚动就收全`
      : `第 ${n} 条回答：内容填充，说明一下解题思路和关键步骤。`,
    ts: NOW - dayAgo * 86400 - (30 - i) * 60
  });
}

function conversationJson() {
  const mapping = {};
  MSGS.forEach((m, i) => {
    mapping['node-' + i] = {
      id: 'node-' + i,
      parent: i ? 'node-' + (i - 1) : null,
      children: i < MSGS.length - 1 ? ['node-' + (i + 1)] : [],
      message: {
        id: m.id,
        author: { role: m.role },
        create_time: m.ts,
        content: { content_type: 'text', parts: [m.text] }
      }
    };
  });
  // 插一条 system 消息，验证会被过滤掉
  mapping['node-sys'] = {
    id: 'node-sys',
    parent: null,
    message: { id: 'sys', author: { role: 'system' }, create_time: NOW, content: { parts: ['系统提示，不该出现在目录里'] } }
  };
  mapping['node-0'].parent = 'node-sys';
  return { title: 'test', current_node: 'node-' + (MSGS.length - 1), mapping };
}

const STATE = (page) =>
  page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host');
    if (!sr || !sr.shadowRoot) return { users: [], days: [], total: 0, scrolls: window.__scrolls };
    const items = Array.from(sr.shadowRoot.querySelectorAll('.item'));
    return {
      users: items.filter((li) => li.classList.contains('user')).map((li) => li.querySelector('.txt').textContent.trim()),
      days: Array.from(sr.shadowRoot.querySelectorAll('.grp')).map((g) => g.dataset.day),
      total: items.length,
      scrolls: window.__scrolls,
      clipped: window.__scrolls,
      groupText: Array.from(sr.shadowRoot.querySelectorAll('.grphead .gmeta')).map((x) => x.textContent)
    };
  });

async function boot({ apiStatus, waitMs }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  const html = fs.readFileSync(path.join(__dirname, 'mock-api.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) => {
    const u = r.request().url();
    if (u.indexOf('/backend-api/conversation/') >= 0) {
      if (apiStatus !== 200) return r.fulfill({ status: apiStatus, body: '{"detail":"unauthorized"}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversationJson()) });
    }
    if (u.indexOf('/api/auth/session') >= 0) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"accessToken":"tok-123"}' });
    }
    if (u.indexOf('.js') > 0 || u.indexOf('.png') > 0) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.addInitScript({ content: 'window.__MSGS__ = ' + JSON.stringify(MSGS) + ';' });
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/6a1b2c3d-1111-2222-3333-444455556666', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(waitMs || 2500);
  return page;
}

const errors = [];
let browser;

(async () => {
  browser = await chromium.launch({ ...launchOptions(), headless: true });

  // ---------- 正常路径 ----------
  let page = await boot({ apiStatus: 200 });
  let st = await STATE(page);

  check('目录里拿到 15 问 15 答', st.users.length === 15 && st.total === 30, `${st.users.length} 问 / ${st.total} 条`);
  check('页面几乎没被滚动（不靠滚动加载）', st.scrolls <= 2, `${st.scrolls} 次`);
  check('顺序与接口一致：第一条是第 1 问', /^第 1 个问题/.test(st.users[0] || ''), st.users[0]);
  check('最后一条是第 15 问', /^第 15 个问题/.test(st.users[14] || ''), st.users[14]);
  check('没有重复条目', new Set(st.users).size === st.users.length, String(new Set(st.users).size));
  check('没有把 system 消息收进目录', !st.users.some((t) => /系统提示/.test(t)), '');
  check('日期按接口时间分 3 组', st.days.length === 3, st.days.join(' / '));
  check('分组是 前天 / 昨天 / 今天', st.days.join(',') === '前天,昨天,今天', st.days.join(','));

  // 点一条「页面上没渲染」的（第 3 问）：应该能自己找过去并高亮
  await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const items = Array.from(sr.querySelectorAll('.item.user'));
    items[2].click();
  });
  await page.waitForTimeout(1200);
  const jumped = await page.evaluate(() => {
    const arts = Array.from(document.querySelectorAll('article'));
    return arts.some((a) => !!(a.style.outline && a.style.outline !== ''));
  });
  check('点目录里没渲染的条目也能跳过去并高亮', jumped === true, String(jumped));

  // ---------- 接口失败：退回滚动补扫 ----------
  const page2 = await boot({ apiStatus: 401, waitMs: 2600 });
  const st2 = await STATE(page2);
  check('接口 401 时不报错，仍有条目', st2.total > 0, String(st2.total));
  check('接口 401 时退回滚动补扫（条目数会慢慢涨）', st2.users.length >= 2, `${st2.users.length} 问`);
  check('接口 401 时页面确实被滚动加载了', st2.scrolls > 1, `${st2.scrolls} 次`);

  check('无未捕获异常', errors.length === 0, errors.join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})();
