/**
 * e2e-real.js —— 用「真正装在 Edge 里的那份扩展」跑一遍接近真实的 ChatGPT 页面
 *
 * 和 test-v150 的区别：
 *   - test-v150 是把 content.js 用 addInitScript 注入，测的是逻辑
 *   - 这里用 --load-extension 加载 chat-outline-extension/ 整个目录，测的是「装上去以后到底出不出面板」
 *   - 页面尽量贴近真实 DOM：article[data-testid="conversation-turn-N"] > div[data-message-author-role]
 *     + 「10月26日 / 昨天 / 今天」分隔条 + 消息里的 <time datetime> + 40 轮虚拟列表
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();

const EXT = process.env.EXT_DIR || path.resolve(__dirname, '..');
const UDD = path.join(os.tmpdir(), 'co-real-' + Date.now());

const NOW = Date.now() / 1000;
const TURNS = 40;
const Q = (i) => `第 ${i} 个问题：这是一段比较长的提问，用来验证目录能不能一次性收全`;
const A = (i) => `第 ${i} 条回答：内容填充，说明解题思路和关键步骤，顺便占一点高度。`;

const MOCK = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>ChatGPT</title>
<style>
 html,body{margin:0;height:100%;font:14px/1.6 "Segoe UI",sans-serif;background:#fff}
 main{height:100vh;overflow-y:auto}
 #inner{position:relative}
 .sep{position:absolute;left:12%;right:12%;height:24px;display:flex;align-items:center;font-size:12px;color:#888}
 article{position:absolute;left:12%;right:12%;box-sizing:border-box;padding:10px 12px;border-radius:10px;background:#f7f7f8}
 article>div[data-message-author-role="user"]{background:#eef4ff;margin:-10px -12px;padding:10px 12px;border-radius:10px}
</style></head><body><main><div id="inner"></div></main>
<script>
(function(){
  var H = 120, SEPH = 24, GAP = 48, TURNS = ${TURNS};
  var labels = ['10月26日', '昨天', '今天'];
  var dayOf = function(i){ return i < 12 ? 0 : i < 26 ? 1 : 2; };
  var blocks = [], y = 0, lastDay = -1;
  for (var i = 0; i < TURNS; i++) {
    var d = dayOf(i);
    if (d !== lastDay) { blocks.push({ kind:'sep', day:d, top:y }); y += SEPH + GAP; lastDay = d; }
    blocks.push({ kind:'turn', i:i, top:y }); y += H;
  }
  var total = y;
  window.__meta = { total: total, turns: TURNS };
  var inner = document.getElementById('inner');
  inner.style.height = total + 'px';
  var main = document.querySelector('main');
  var mounted = new Set();

  function make(o){
    var el;
    if (o.kind === 'sep') {
      el = document.createElement('div');
      el.className = 'sep';
      el.style.top = o.top + 'px';
      el.textContent = labels[o.day];
      return el;
    }
    var q = document.createElement('article');
    q.setAttribute('data-testid', 'conversation-turn-' + (o.i * 2));
    q.style.top = o.top + 'px';
    q.style.height = (H / 2 - 6) + 'px';
    var u = document.createElement('div');
    u.setAttribute('data-message-author-role', 'user');
    u.textContent = '第 ' + (o.i + 1) + ' 个问题：这是一段比较长的提问，用来验证目录能不能一次性收全';
    q.appendChild(u);

    var a = document.createElement('article');
    a.setAttribute('data-testid', 'conversation-turn-' + (o.i * 2 + 1));
    a.style.top = (o.top + H / 2) + 'px';
    a.style.height = (H / 2 - 6) + 'px';
    var ad = document.createElement('div');
    ad.setAttribute('data-message-author-role', 'assistant');
    ad.textContent = '第 ' + (o.i + 1) + ' 条回答：内容填充，说明解题思路和关键步骤，顺便占一点高度。';
    var tm = document.createElement('time');
    tm.setAttribute('datetime', new Date(Date.now() - (TURNS - o.i) * 600000).toISOString());
    a.appendChild(ad); a.appendChild(tm);

    var frag = document.createDocumentFragment();
    frag.appendChild(q); frag.appendChild(a);
    return frag;
  }

  function render(){
    var view = main.clientHeight || 800, st = main.scrollTop;
    var lo = st - view * 0.3, hi = st + view;
    var want = [];
    blocks.forEach(function(o){
      var h = o.kind === 'sep' ? SEPH : H;
      if (o.top + h > lo && o.top < hi) want.push(o);
    });
    // 卸载
    Array.from(mounted).forEach(function(el){
      if (!el.isConnected) return;
      var t = parseFloat(el.style.top || '0');
      if (t + H < lo || t > hi) { el.remove(); mounted.delete(el); }
    });
    want.forEach(function(o){
      var key = o.kind + ':' + o.top;
      if (document.querySelector('[data-co-key="' + key + '"]')) return;
      var el = make(o);
      if (el.nodeType === 11) {
        Array.from(el.childNodes).forEach(function(n){ n.setAttribute('data-co-key', key); mounted.add(n); });
        inner.appendChild(el);
      } else {
        el.setAttribute('data-co-key', key);
        inner.appendChild(el); mounted.add(el);
      }
    });
  }
  var ticking = false;
  main.addEventListener('scroll', function(){
    if (ticking) return; ticking = true;
    requestAnimationFrame(function(){ ticking = false; render(); });
  }, { passive: true });
  window.__scrolls = 0;
  main.addEventListener('scroll', function(){ window.__scrolls += 1; });
  render();
  main.scrollTop = main.scrollHeight;
  render();
})();
</script></body></html>`;

function conversationJson() {
  const mapping = {};
  for (let i = 0; i < TURNS; i += 1) {
    const ts = NOW - (TURNS - i) * 600;
    mapping['n' + i * 2] = {
      id: 'n' + i * 2,
      parent: i === 0 ? null : 'n' + (i * 2 - 1),
      children: ['n' + (i * 2 + 1)],
      message: {
        id: 'u' + i,
        author: { role: 'user' },
        create_time: ts,
        content: { content_type: 'text', parts: [Q(i + 1)] }
      }
    };
    mapping['n' + (i * 2 + 1)] = {
      id: 'n' + (i * 2 + 1),
      parent: 'n' + i * 2,
      children: i === TURNS - 1 ? [] : ['n' + (i * 2 + 2)],
      message: {
        id: 'a' + i,
        author: { role: 'assistant' },
        create_time: ts + 5,
        content: { content_type: 'text', parts: [A(i + 1)] }
      }
    };
  }
  return { title: 'real', current_node: 'n' + (TURNS * 2 - 1), mapping };
}

(async () => {
  const md5 = require('crypto')
    .createHash('md5')
    .update(fs.readFileSync(path.join(EXT, 'content.js')))
    .digest('hex');
  const ver = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8')).version;
  console.log(`EXT = ${EXT}`);
  console.log(`版本 = ${ver} | content.js md5 = ${md5}`);

  const ctx = await chromium.launchPersistentContext(UDD, {
    ...launchOptions(),
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run']
  });
  const page = await ctx.newPage();
  const errs = [];
  const logs = [];
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push('[' + m.type() + '] ' + m.text().slice(0, 160));
  });

  await page.route('https://chatgpt.com/**', (r) => {
    const u = r.request().url();
    const bad = process.env.API_STATUS && process.env.API_STATUS !== '200';
    if (u.indexOf('/backend-api/conversation/') >= 0) {
      if (bad) return r.fulfill({ status: Number(process.env.API_STATUS), body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversationJson()) });
    }
    if (u.indexOf('/api/auth/session') >= 0) {
      if (bad) return r.fulfill({ status: Number(process.env.API_STATUS), body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"accessToken":"tok"}' });
    }
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK });
  });

  await page.goto('https://chatgpt.com/c/6a1b2c3d-1111-2222-3333-444455556666', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const res = await page.evaluate(() => {
    const h = document.getElementById('chat-outline-host');
    if (!h) return { injected: false };
    const sr = h.shadowRoot;
    if (!sr) return { injected: true, shadow: false };
    const app = sr.querySelector('.app');
    const users = sr.querySelectorAll('.item.user');
    const txt = (li) => (li.querySelector('.txt') || {}).textContent || '';
    return {
      injected: true,
      shadow: true,
      open: app ? app.dataset.open : null,
      launcher: !!sr.querySelector('.launcher'),
      users: users.length,
      total: sr.querySelectorAll('.item').length,
      groups: sr.querySelectorAll('.grp').length,
      dayLabels: Array.from(sr.querySelectorAll('.grp')).map((g) => g.dataset.day),
      first: txt(users[0]).slice(0, 18),
      last: txt(users[users.length - 1]).slice(0, 18),
      scrolls: window.__scrolls
    };
  });

  console.log('\n=== 结果 ===');
  console.log(JSON.stringify(res, null, 2));
  console.log('页面错误:', errs.length ? errs : '无');
  console.log('console 异常:', logs.length ? logs.slice(0, 12) : '无');

  await page.screenshot({ path: path.join(__dirname, 'shots', '30-e2e-real.png') });
  await ctx.close();
})().catch((e) => {
  console.log('E2E FAILED:', e.message);
  process.exit(1);
});
