/**
 * v1.2 回归测试：验证新增的性能优化没有破坏动态更新。
 *   1. 新增一条提问后目录必须更新（廉价签名不能误跳过）
 *   2. 回答原地流式增长时，开「答」后条目文本要跟着更新
 *   3. SPA pushState 切换路由后重扫、不报错
 *   4. 启发式模式下新增带「编辑」按钮的提问要能被识别（缓存按按钮数失效）
 *   5. 无对话页面持续 DOM 变动也不会误弹面板
 */
const fs = require('fs');
const path = require('path');
const { loadChromium, launchOptions } = require('./_browser');
const chromium = loadChromium();

const EXT = path.resolve(__dirname, '..');
const CONTENT = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
function check(name, cond, extra) {
  console.log(` ${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? ' -> ' + extra : ''}`);
  if (!cond) failed++;
}

async function openMock(browser, url, mockFile) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  const html = fs.readFileSync(path.join(__dirname, mockFile), 'utf8');
  await page.route(new URL(url).origin + '/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  );
  await page.addInitScript({ content: CONTENT });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  return { page, errors };
}

// 注意：page.evaluate 里的代码在页面侧执行，不能用 Node 侧变量，
// 所以下面统一写完整表达式 document.getElementById('chat-outline-host').shadowRoot

(async () => {
  const browser = await chromium.launch({ ...launchOptions(), headless: true });

  // ---------- 1+2+3：ChatGPT 硬适配页 ----------
  {
    const { page, errors } = await openMock(browser, 'https://chatgpt.com/c/v12', 'mock.html');
    const c0 = await page.evaluate(() => +document.getElementById('chat-outline-host').shadowRoot.querySelector('.count').textContent);
    check('初始识别 6 个提问', c0 === 6, c0);

    // 1. 追加一条新提问（模拟继续对话）
    await page.evaluate(() => {
      const art = document.createElement('article');
      art.className = 'turn';
      art.setAttribute('data-testid', 'conversation-turn-11');
      art.innerHTML =
        '<div class="user"><div data-message-author-role="user" class="msg">' +
        '<div>新增问题：京都的巴士一日券在哪里买？</div>' +
        '<div class="actions"><button>编辑</button><button>复制</button></div></div></div>';
      document.querySelector('.main').appendChild(art);
    });
    await page.waitForTimeout(900);
    const c1 = await page.evaluate(() => +document.getElementById('chat-outline-host').shadowRoot.querySelector('.count').textContent);
    check('新增提问后目录更新为 7', c1 === 7, c1);

    // 2. 开「答」，再让最后一条回答原地变长（模拟流式输出）
    // 回答在 v1.3.0 起默认就显示；万一哪天改回默认隐藏，这里补点一下
    await page.evaluate(() => {
      const sr = document.getElementById('chat-outline-host').shadowRoot;
      if (!sr.querySelector('.item.asst')) sr.querySelector('[data-act="asst"]').click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const last = [...document.querySelectorAll('[data-message-author-role="assistant"]')].pop();
      last.querySelector('div').textContent += '（流式追加：雨天可以把岚山换成天龙寺室内行程。）';
    });
    await page.waitForTimeout(900);
    const asstUpdated = await page.evaluate(() => {
      const items = [...document.getElementById('chat-outline-host').shadowRoot.querySelectorAll('.item.asst')];
      return items.some((li) => li.querySelector('.txt').textContent.includes('流式追加'));
    });
    check('流式回答增长后条目文本更新', asstUpdated);

    // 3. SPA 路由切换（pushState），DOM 不变，面板应保持可用且不报错
    await page.evaluate(() => history.pushState({}, '', '/c/another-convo'));
    await page.waitForTimeout(900);
    const afterNav = await page.evaluate(() => ({
      count: +document.getElementById('chat-outline-host').shadowRoot.querySelector('.count').textContent,
      mounted: !!document.getElementById('chat-outline-host')
    }));
    check('pushState 后面板仍正常', afterNav.mounted && afterNav.count === 7, JSON.stringify(afterNav));

    check('无页面错误', errors.length === 0, errors.join('; ') || '无');
    await page.close();
  }

  // ---------- 4：启发式页新增提问 ----------
  {
    const { page, errors } = await openMock(browser, 'https://kimi.com/chat/v12', 'mock-generic.html');
    const c0 = await page.evaluate(() => +document.getElementById('chat-outline-host').shadowRoot.querySelector('.count').textContent);
    check('启发式初始 4 个提问', c0 === 4, c0);
    await page.evaluate(() => {
      const line = document.createElement('div');
      line.className = 'line right';
      line.innerHTML =
        '<div class="bubble">追加提问：闷蒸时间长短对甜感影响大吗？</div>' +
        '<div class="tools"><button>复制</button><button aria-label="编辑">编辑</button></div>';
      document.querySelector('.thread').appendChild(line);
    });
    await page.waitForTimeout(900);
    const c1 = await page.evaluate(() => +document.getElementById('chat-outline-host').shadowRoot.querySelector('.count').textContent);
    check('启发式缓存失效后识别到新提问（4→5）', c1 === 5, c1);
    check('无页面错误', errors.length === 0, errors.join('; ') || '无');
    await page.close();
  }

  // ---------- 5：无对话页面持续变动 ----------
  {
    const { page, errors } = await openMock(browser, 'https://poe.com/', 'mock-empty.html');
    for (let i = 0; i < 5; i++) {
      await page.evaluate((i) => {
        const d = document.createElement('div');
        d.textContent = '无关动态内容 ' + i;
        document.body.appendChild(d);
      }, i);
      await page.waitForTimeout(350);
    }
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => {
      const h = document.getElementById('chat-outline-host');
      return { has: h.shadowRoot.querySelector('.app').dataset.has, open: h.shadowRoot.querySelector('.app').dataset.open };
    });
    check('无对话页持续变动仍不误弹', st.has === '0' && st.open === 'false', JSON.stringify(st));
    check('无页面错误', errors.length === 0, errors.join('; ') || '无');
    await page.close();
  }

  await browser.close();
  console.log(failed ? `\n${failed} 项失败` : '\n全部通过');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.log('V1.2 TEST FAILED:', e.message);
  process.exit(1);
});
