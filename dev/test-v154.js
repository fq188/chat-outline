/**
 * v1.5.4 回归测试：进入对话不能先上下滚动加载；接口数据到了必须重绘（时间轴要回来）
 *
 * 现场（2026-11-01 用户反馈 + 诊断输出）：
 *   apiState=ok apiThread=160 archive=160 items=160 withDay=160
 *   但面板 rendered items=20 grp=0 badge=20 —— 数据到了，面板还停在「只扫到视口那几条」
 *   旧样式：没有日期分组（时间轴消失）、附件提问还是脏文本、进页面时还在滚。
 *
 * 两个成因：
 *   1) 补扫定时器在接口成功后照常触发，sweep() 一开始又把 abort 标记reset 成 false → 白滚一趟
 *   2) 接口应用后缺少「必须重绘」的兜底，收尾出错就停在旧列表
 *
 * 检查项：
 *   1. 面板条目数 / 提问数 = 全量（不是只有视口那几条）
 *   2. 有日期分组（时间轴在）
 *   3. 进入时页面几乎没被滚（没有「上下滑动加载」）
 *   4. 没有「找不到 / 正在补扫」之类的提示
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

const TURNS = 40;
const DAY = 86400;

// 三天：前 15 问在 3 天前、中间 15 问在 2 天前、最后 10 问在今天
function tsOf(i) {
  const base = Math.floor(Date.now() / 1000);
  if (i < 15) return base - 3 * DAY + i * 60;
  if (i < 30) return base - 2 * DAY + (i - 15) * 60;
  return base - 600 + (i - 30) * 30;
}

const MSGS = [];
for (let i = 0; i < TURNS; i += 1) {
  MSGS.push({ role: 'user', text: `第 ${i + 1} 问：这个边界值问题怎么解`, ts: tsOf(i) });
  MSGS.push({ role: 'assistant', text: `回答 ${i + 1}：先分离变量，再代入边界条件。`, ts: tsOf(i) + 5 });
}

function conversationJson() {
  const mapping = {};
  MSGS.forEach((m, i) => {
    mapping['n' + i] = {
      id: 'n' + i,
      parent: i ? 'n' + (i - 1) : null,
      children: i < MSGS.length - 1 ? ['n' + (i + 1)] : [],
      message: {
        id: 'm' + i,
        author: { role: m.role },
        create_time: m.ts,
        content: { content_type: 'text', parts: [m.text] }
      }
    };
  });
  return { title: 'timeline', current_node: 'n' + (MSGS.length - 1), mapping };
}

const errors = [];
let browser;

(async () => {
  browser = await chromium.launch({ ...launchOptions(), headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));

  const html = fs.readFileSync(path.join(__dirname, 'mock-newui.html'), 'utf8');
  await page.route('https://chatgpt.com/**', (r) => {
    const u = r.request().url();
    if (u.indexOf('/backend-api/conversation/') >= 0) {
      // 故意慢 1.5 秒：模拟真实站点「接口还在路上」的那段窗口
      return new Promise((res) => {
        setTimeout(() => res(r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversationJson()) })), 1500);
      });
    }
    if (u.indexOf('/api/auth/session') >= 0) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"accessToken":"tok"}' });
    }
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
  });
  await page.addInitScript({ content: 'window.__MSGS__ = ' + JSON.stringify(MSGS) + ';' });
  await page.addInitScript({ content: CONTENT });
  await page.goto('https://chatgpt.com/c/a1b2c3d4-1111-2222-3333-444455556666', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(7000);

  const st = await page.evaluate(() => {
    const sr = document.getElementById('chat-outline-host').shadowRoot;
    const toast = sr.querySelector('.toast') ? sr.querySelector('.toast').textContent : '';
    return {
      items: sr.querySelectorAll('.item').length,
      users: sr.querySelectorAll('.item.user').length,
      grps: sr.querySelectorAll('.grp').length,
      heads: Array.from(sr.querySelectorAll('.grphead .glabel')).map((x) => x.textContent.trim()),
      badge: sr.querySelector('.count').textContent,
      gbar: !sr.querySelector('.gbar').hidden,
      gsum: sr.querySelector('.gsum').textContent,
      toast,
      scrolls: window.__scrolls
    };
  });

  check('提问数 = 全量 40（不是只有视口那几条）', st.users === TURNS, `${st.users} 问 / ${st.items} 条`);
  check('计数徽标 = 40', st.badge === '40', st.badge);
  check('有日期分组（时间轴回来了）', st.grps >= 2, `${st.grps} 组: ${st.heads.join(' / ')}`);
  check('分组工具条可见（N 天 · M 轮）', st.gbar && /轮/.test(st.gsum), st.gsum);
  check('进入时页面几乎没被滚（没有上下滑动加载）', st.scrolls <= 3, `滚动 ${st.scrolls} 次`);
  check('没有「找不到」提示', !/找不到/.test(st.toast), st.toast || '无提示');
  check('无未捕获异常', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('测试崩溃:', e.message);
  process.exit(1);
});
