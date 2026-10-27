/* =========================================================================
 * 对话目录 · Chat Outline  (v1.2.2)
 * 为 AI 对话网页生成悬浮目录：
 *   - 列出全部「用户提问」（可切换显示 AI 回答）
 *   - 点击跳转到对应消息并高亮
 *   - 搜索过滤 / 滚动跟随高亮 / 导出 Markdown
 *
 * 识别策略（三级，逐级降级）：
 *   1. 站点硬适配：已知站点用精确选择器（ChatGPT / Gemini / Claude …）
 *   2. 通用选择器：几十条常见「用户消息」标记，逐一校验
 *   3. 结构启发式：以「编辑 / Edit」按钮为锚点反推提问容器
 * 任何一级命中即可工作；都不命中时可在面板底部手填 CSS 选择器。
 *
 * 原理：content script + Shadow DOM，不修改页面、不读取任何账号数据。
 * ========================================================================= */
(() => {
  'use strict';
  if (window.__chatOutlineLoadedV11) return;
  window.__chatOutlineLoadedV11 = true;

  const HOST = location.hostname;
  const HOSTKEY = HOST;

  /* ======================= 1. 站点硬适配表（已验证/半验证） ======================= */
  /* 选择器失效时不会报错，会自动降级到通用识别；也可在面板里手动覆盖 */
  const CGPT = {
    label: 'ChatGPT',
    // 兼容几代 DOM：新旧属性名都试一遍
    user:
      '[data-message-author-role="user"], [data-turn="user"], [data-turn-role="user"], [data-testid="user-message"]',
    assistant:
      '[data-message-author-role="assistant"], [data-turn="assistant"], [data-turn-role="assistant"], [data-testid="assistant-message"]',
    container: (n) => n.closest('[data-testid^="conversation-turn"], [data-turn-id], article') || n
  };

  const SITES = {
    'chatgpt.com': CGPT,
    'chat.openai.com': CGPT,

    'gemini.google.com': {
      label: 'Gemini',
      user: 'user-query',
      assistant: 'model-response',
      textRoot: (n) => n.querySelector('.query-text, .model-response-text, message-content, .markdown') || n
    },

    'claude.ai': {
      label: 'Claude',
      user: '[data-testid="user-message"]',
      assistant: '.font-claude-message',
      textRoot: (n) => n.querySelector('[data-testid="user-message"]') || n
    },

    /* —— 以下为「半验证」：命中就用，不命中自动降级，不会出错 —— */
    'copilot.microsoft.com': {
      label: 'Copilot',
      user: '[data-content="user-message"], cib-message-group[source="user"]',
      assistant: '[data-content="bot-message"], cib-message-group[source="bot"]'
    },
    'poe.com': {
      label: 'Poe',
      user: '[class*="humanMessageBubble"], [class*="humanMessage"]',
      assistant: '[class*="botMessageBubble"], [class*="botMessage"]'
    },
    'kimi.com': {
      label: 'Kimi',
      user: '.segment-user, [class*="segment-user"]',
      assistant: '.segment-assistant, [class*="segment-assistant"]'
    },
    'www.kimi.com': {
      label: 'Kimi',
      user: '.segment-user, [class*="segment-user"]',
      assistant: '.segment-assistant, [class*="segment-assistant"]'
    },
    'kimi.moonshot.cn': {
      label: 'Kimi',
      user: '.segment-user, [class*="segment-user"]',
      assistant: '.segment-assistant, [class*="segment-assistant"]'
    },
    'chat.deepseek.com': {
      label: 'DeepSeek',
      user: '[class*="user-message"], [class*="message-user"], .ds-message-user',
      assistant: '[class*="assistant-message"], [class*="message-assistant"]'
    },
    'chat.qwen.ai': {
      label: 'Qwen',
      user: '[class*="user-message"], [class*="userMessage"]',
      assistant: '[class*="assistant-message"], [class*="markdown"]'
    },
    'yuanbao.tencent.com': {
      label: '元宝',
      user: '[class*="bubble--human"], [class*="human"] [class*="bubble"], [class*="user-bubble"]',
      assistant: '[class*="bubble--ai"], [class*="agent"] [class*="bubble"]'
    },
    'doubao.com': {
      label: '豆包',
      user: '[data-testid*="user"][data-testid*="message"], [class*="user-message"]',
      assistant: '[class*="assistant-message"], [class*="markdown"]'
    },
    'www.doubao.com': {
      label: '豆包',
      user: '[data-testid*="user"][data-testid*="message"], [class*="user-message"]',
      assistant: '[class*="assistant-message"], [class*="markdown"]'
    }
  };

  const SITE = SITES[HOST] || SITES[HOST.replace(/^www\./, '')] || null;

  /* ======================= 2. 通用选择器候选（按优先级） ======================= */
  const UNIVERSAL_USER = [
    '[data-message-author-role="user"]',
    '[data-role="user"]',
    '[data-author-role="user"]',
    '[data-message-role="user"]',
    '[data-sender="user"]',
    '[data-source="user"]',
    '[data-testid="user-message"]',
    '[data-testid*="user-message"]',
    '[data-testid*="userMessage"]',
    '[data-testid="user-query"]',
    '[data-content="user-message"]',
    'user-query',
    '[class*="user-message"]',
    '[class*="userMessage"]',
    '[class*="user_message"]',
    '[class*="UserMessage"]',
    '[class*="message-user"]',
    '[class*="message--user"]',
    '[class*="is-user"]',
    '[class*="from-user"]',
    '[class*="human-message"]',
    '[class*="humanMessage"]',
    '[class*="human_message"]',
    '[class*="human-bubble"]',
    '[class*="user-bubble"]',
    '[class*="userBubble"]',
    '[class*="query-text"]',
    '[class*="queryText"]',
    '[class*="segment-user"]',
    '[aria-label*="Your message"]',
    '[aria-label*="你说"]',
    '[aria-label*="你的消息"]',
    '[aria-roledescription="user message"]'
  ];

  const UNIVERSAL_ASST = [
    '[data-message-author-role="assistant"]',
    '[data-role="assistant"]',
    '[data-author-role="assistant"]',
    '[data-sender="assistant"]',
    '[data-source="assistant"]',
    '[data-testid="assistant-message"]',
    '[data-testid*="assistant-message"]',
    '[data-testid*="assistantMessage"]',
    '[data-content="bot-message"]',
    'model-response',
    '[class*="assistant-message"]',
    '[class*="assistantMessage"]',
    '[class*="message-assistant"]',
    '[class*="bot-message"]',
    '[class*="botMessage"]',
    '[class*="ai-message"]',
    '[class*="model-response"]',
    '[class*="segment-assistant"]'
  ];

  /* ======================= 3. 工具函数 ======================= */
  function qsa(sel) {
    try {
      return Array.from(document.querySelectorAll(sel));
    } catch (e) {
      return [];
    }
  }

  function isVisible(n) {
    if (!n || !n.getBoundingClientRect) return false;
    const r = n.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && n.getClientRects().length > 0;
  }

  // 去掉「祖先也在集合里」的节点，避免嵌套重复
  function dropNested(nodes) {
    const set = new Set(nodes);
    return nodes.filter((n) => {
      let p = n.parentElement;
      while (p) {
        if (set.has(p)) return false;
        p = p.parentElement;
      }
      return true;
    });
  }

  function validateSet(nodes, role) {
    if (!nodes || !nodes.length || nodes.length > 1000) return false;
    const visible = nodes.filter(isVisible);
    if (!visible.length) return false;
    const texts = visible.map((n) => (n.innerText || '').trim() || mediaLabel(n)).filter(Boolean);
    if (texts.length < Math.max(1, Math.ceil(visible.length * 0.6))) return false;
    const avg = texts.reduce((a, t) => a + t.length, 0) / texts.length;
    if (avg < 2) return false;
    if (role === 'user' && avg > 1500) return false; // 太长，多半是整段对话容器
    if (avg > 30000) return false;
    return true;
  }

  function cleanRaw(node) {
    if (!node) return '';
    let clone;
    try {
      clone = node.cloneNode(true);
    } catch (e) {
      return '';
    }
    clone
      .querySelectorAll(
        'button, svg, style, script, [aria-hidden="true"], .sr-only, ' +
          '[data-testid="copy-turn-action-button"], [data-testid="good-response-turn-action-button"], ' +
          '[data-testid="bad-response-turn-action-button"], [data-testid="voice-play-turn-action-button"]'
      )
      .forEach((n) => n.remove());
    let t = '';
    try {
      t = clone.innerText || clone.textContent || '';
    } catch (e) {
      t = clone.textContent || '';
    }
    return t
      .replace(/\u200b/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .replace(/^(You said|你说|您说)\s*[:：]\s*/i, '');
  }

  // 纯图片 / 视频 / 附件消息没有文字，innerText 取不到东西。
  // 给它们合成一个占位标签，否则整条提问在目录里会凭空消失。
  function mediaLabel(node) {
    if (!node || !node.querySelectorAll) return '';
    const parts = [];
    try {
      const imgs = Array.prototype.filter.call(node.querySelectorAll('img'), (im) => {
        const w = im.naturalWidth || parseInt(im.getAttribute('width') || '0', 10) || 0;
        const h = im.naturalHeight || parseInt(im.getAttribute('height') || '0', 10) || 0;
        const alt = (im.getAttribute('alt') || '').trim();
        // 太小的是图标/头像/表情，不算消息内容；没尺寸信息时靠 alt 判断
        if ((w && w < 40) || (h && h < 40)) return false;
        if (!w && !h && !alt) return false;
        const cls = typeof im.className === 'string' ? im.className : '';
        if (/avatar|emoji|icon|logo|badge|spinner/i.test(cls)) return false;
        return true;
      });
      if (imgs.length) {
        const alt = (imgs[0].getAttribute('alt') || '').trim().replace(/\s+/g, ' ');
        const generic = !alt || /^(image|picture|photo|uploaded image|图片|已上传的图片|图像)$/i.test(alt);
        const one = generic ? '图片' : `图片：${alt.slice(0, 24)}`;
        parts.push(imgs.length > 1 ? `${one} ×${imgs.length}` : one);
      }
      if (node.querySelector('video')) parts.push('视频');
      if (node.querySelector('audio')) parts.push('语音');
      if (
        !parts.length &&
        node.querySelector('[data-testid*="file"], [class*="attachment"], [class*="file-card"]')
      ) {
        parts.push('附件');
      }
    } catch (e) {
      /* 忽略：拿不到就当没有 */
    }
    return parts.length ? `[${parts.join(' · ')}]` : '';
  }

  // 同一节点内容没变就不重复克隆解析（长对话 + 流式输出时省很多）
  const rawCache = new WeakMap();
  function cleanRawCached(node) {
    try {
      const len = (node.textContent || '').length;
      const hit = rawCache.get(node);
      if (hit && hit.len === len) return hit.raw;
      let raw = cleanRaw(node);
      if (!raw) raw = mediaLabel(node);
      rawCache.set(node, { len, raw });
      return raw;
    } catch (e) {
      return cleanRaw(node);
    }
  }

  function pickTime(root) {
    if (!root || !root.querySelector) return '';
    const t = root.querySelector('time[datetime], time');
    if (t) {
      const dt = t.getAttribute('datetime') || t.getAttribute('data-datetime');
      if (dt) {
        const d = new Date(dt);
        if (!isNaN(d.getTime())) {
          const p = (n) => String(n).padStart(2, '0');
          return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
        }
      }
      const txt = (t.textContent || '').trim();
      if (txt && txt.length <= 16) return txt;
    }
    return '';
  }

  function debounce(fn, ms) {
    let id = null;
    return function (...args) {
      clearTimeout(id);
      id = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function isDarkPage() {
    // 有的站点背景设在 body，有的设在 html（或 color-scheme），两层都看
    for (const el of [document.body, document.documentElement]) {
      try {
        if (!el) continue;
        const bg = getComputedStyle(el).backgroundColor || '';
        const m = bg.match(/\d+(\.\d+)?/g);
        if (m && m.length >= 3 && !/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/.test(bg)) {
          const [r, g, b] = m.map(Number);
          return 0.299 * r + 0.587 * g + 0.114 * b < 128;
        }
      } catch (e) {
        /* ignore */
      }
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  /* ======================= 4. 启发式：以「编辑」按钮反推提问 ======================= */
  const EDIT_RE = /^(编辑|编辑消息|编辑此消息|修改|edit|edit message|edit prompt|edit question)$/i;

  // 去掉所有按钮文字后的纯内容（用于判断容器里「有没有真消息」）
  function textWithoutButtons(el) {
    try {
      const c = el.cloneNode(true);
      c.querySelectorAll('button, [role="button"], [aria-hidden="true"]').forEach((x) => x.remove());
      return ((c.innerText || c.textContent || '') + '').replace(/\s+/g, ' ').trim();
    } catch (e) {
      return '';
    }
  }

  // 启发式很贵（逐按钮检查 + 向上爬父链），按「按钮总数」做戳记缓存；
  // 按钮数没变且缓存节点还挂在 DOM 上，就直接复用上次结果
  let editMemo = { stamp: -1, anchors: [] };

  function detectByEditButton() {
    const stamp = document.querySelectorAll('button, [role="button"]').length;
    if (editMemo.stamp === stamp && editMemo.anchors.every((a) => a.isConnected)) {
      return editMemo.anchors;
    }
    const btns = document.querySelectorAll('button, [role="button"], [aria-label], [title]');
    const found = [];
    let guard = 0;
    for (const b of btns) {
      if (found.length > 200 || guard++ > 4000) break;
      const label = (
        (b.getAttribute && (b.getAttribute('aria-label') || b.getAttribute('title'))) ||
        b.textContent ||
        ''
      )
        .trim()
        .slice(0, 24);
      if (!label || !EDIT_RE.test(label)) continue;
      const btnLen = ((b.innerText || b.textContent || '').trim()).length;
      let el = b.parentElement;
      let hops = 0;
      while (el && hops++ < 10) {
        const tag = (el.tagName || '').toLowerCase();
        if (!tag || tag === 'body' || tag === 'html' || tag === 'main') break;
        const t = (el.innerText || '').trim();
        if (t.length > 2500) break;
        const r = el.getBoundingClientRect();
        // 容器自身的文字（把所有按钮文字去掉）至少要有 1 个字，才像「一条消息」
        if (t.length - btnLen >= 1 && r.width > 40 && r.height > 10) {
          const own = textWithoutButtons(el);
          if (own.length >= 1) {
            found.push(el);
            break;
          }
        }
        el = el.parentElement;
      }
    }
    const uniq = dropNested(found);
    editMemo = { stamp, anchors: uniq };
    return uniq.length ? uniq : [];
  }

  /* ======================= 5. 识别方案（plan） ======================= */
  let plan = null;
  let planSig = '';
  // DOM 纪元：每次 MutationObserver 触发 +1。「三级探测全部落空」是很贵的操作，
  // 用纪元号缓存空结果 —— DOM 没变的期间不再重复探测（无对话页面收益最大）
  let domEpoch = 0;
  let nullEpoch = -1;

  function buildPlan(force) {
    const sig = location.href + '|' + (overrides.user || '') + '|' + (overrides.assistant || '');
    if (!force && plan && planSig === sig) return plan;
    if (!force && !plan && nullEpoch === domEpoch && planSig === sig) return null;
    planSig = sig;

    // ① 用户手动指定的选择器优先级最高
    if (overrides.user) {
      const nodes = qsa(overrides.user);
      if (nodes.length) {
        plan = {
          mode: 'custom',
          getUser: () => qsa(overrides.user),
          getAssistant: overrides.assistant ? () => qsa(overrides.assistant) : null
        };
        return plan;
      }
    }

    // ② 站点硬适配
    if (SITE && SITE.user) {
      const nodes = qsa(SITE.user);
      if (nodes.length) {
        plan = {
          mode: 'site',
          site: SITE,
          getUser: () => qsa(SITE.user),
          getAssistant: SITE.assistant ? () => qsa(SITE.assistant) : null
        };
        return plan;
      }
    }

    // ③ 通用选择器
    for (const sel of UNIVERSAL_USER) {
      const nodes = qsa(sel);
      if (validateSet(nodes, 'user')) {
        const asstSel = UNIVERSAL_ASST.find((s) => validateSet(qsa(s), 'assistant'));
        plan = {
          mode: 'auto',
          getUser: () => qsa(sel),
          getAssistant: asstSel ? () => qsa(asstSel) : null
        };
        return plan;
      }
    }

    // ④ 结构启发式
    const anchors = detectByEditButton();
    if (anchors.length) {
      const asstSel = UNIVERSAL_ASST.find((s) => validateSet(qsa(s), 'assistant'));
      plan = {
        mode: 'auto',
        getUser: () => detectByEditButton(),
        getAssistant: asstSel ? () => qsa(asstSel) : null
      };
      return plan;
    }

    plan = null;
    nullEpoch = domEpoch;
    return null;
  }

  /* ======================= 6. 状态 ======================= */
  let items = [];
  let showAssistant = false;
  let side = 'right';
  let query = '';
  let activeKey = null;
  let suppressSpyUntil = 0;
  let overrides = { user: '', assistant: '' };
  let openedOnce = false;
  let prefCollapsed = null;
  let lastSignature = '';
  let lastCheapSig = '';
  // 刷新后补扫：内容常常在 MutationObserver 挂上之前就渲染完，
  // 之后页面不再变动，只等 DOM 变动就会一直空着
  let retryTimer = null;
  let retryCount = 0;
  // 偏好读取完成后才允许自动展开，避免刷新瞬间先弹一下面板再收起
  let bootReady = false;

  /* ======================= 7. 样式 ======================= */
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .app {
    --bg: #ffffff;
    --fg: #1f2328;
    --muted: #6b7280;
    --line: #e6e8eb;
    --hover: #f2f4f6;
    --active: #e7f6ef;
    --accent: #0e8f6f;
    --shadow: 0 8px 30px rgba(15, 23, 42, .14);
    --radius: 12px;
    font-family: -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: var(--fg);
  }
  .app[data-theme="dark"] {
    --bg: #202123;
    --fg: #ececf1;
    --muted: #9ba1a6;
    --line: #3a3b3f;
    --hover: #2b2c30;
    --active: #1b3b31;
    --accent: #2ec08f;
    --shadow: 0 8px 30px rgba(0, 0, 0, .5);
  }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  .panel {
    position: fixed;
    top: 76px;
    bottom: 84px;
    width: clamp(220px, 26vw, 320px);
    min-width: 200px;
    max-width: 44vw;
    display: flex;
    flex-direction: column;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    overflow: hidden;
    z-index: 2147483600;
    pointer-events: auto;
    resize: horizontal;
  }
  /* 窗口不高 / 不宽时收一收，别把正文挤没了 */
  @media (max-height: 720px) {
    .panel { top: 58px; bottom: 58px; }
  }
  @media (max-width: 820px) {
    .panel { width: 216px; }
  }
  .app[data-side="right"] .panel { right: 14px; }
  .app[data-side="left"] .panel { left: 14px; }
  .app[data-open="false"] .panel { display: none; }
  .head {
    display: flex; align-items: center; gap: 6px;
    padding: 9px 10px 8px 12px;
    border-bottom: 1px solid var(--line);
    flex: 0 0 auto;
  }
  .title { font-weight: 600; font-size: 13px; letter-spacing: .2px; white-space: nowrap; }
  .count {
    font-size: 11px; color: var(--muted); font-weight: 400;
    background: var(--hover); border-radius: 20px; padding: 1px 7px;
  }
  .auto {
    font-size: 10px; color: var(--accent); border: 1px solid var(--accent);
    border-radius: 4px; padding: 0 3px; line-height: 15px; opacity: .85;
  }
  .grow { flex: 1 1 auto; }
  .iconbtn {
    width: 24px; height: 24px; border-radius: 6px; display: inline-flex;
    align-items: center; justify-content: center; color: var(--muted);
    font-size: 13px; line-height: 1; flex: 0 0 auto;
  }
  .iconbtn:hover { background: var(--hover); color: var(--fg); }
  .iconbtn[aria-pressed="true"] { color: var(--accent); background: var(--active); font-weight: 600; }
  .search { padding: 8px 10px; border-bottom: 1px solid var(--line); flex: 0 0 auto; }
  .search input {
    width: 100%; height: 28px; padding: 0 9px;
    border: 1px solid var(--line); border-radius: 7px;
    background: transparent; color: var(--fg); font: inherit; outline: none;
  }
  .search input:focus { border-color: var(--accent); }
  .search input::placeholder { color: var(--muted); }
  .list { flex: 1 1 auto; overflow-y: auto; overflow-x: hidden; margin: 0; padding: 6px; list-style: none; }
  .list::-webkit-scrollbar { width: 8px; }
  .list::-webkit-scrollbar-thumb { background: var(--line); border-radius: 8px; }
  .list::-webkit-scrollbar-track { background: transparent; }
  .item {
    display: flex; gap: 7px; align-items: flex-start;
    padding: 6px 7px; border-radius: 8px; cursor: pointer;
    color: var(--fg);
  }
  .item:hover { background: var(--hover); }
  .item:focus { outline: none; }
  .item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .item.active { background: var(--active); }
  .item.active .idx { color: var(--accent); border-color: var(--accent); }
  .idx {
    flex: 0 0 auto; min-width: 19px; height: 19px; margin-top: 1px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 600; color: var(--muted);
    border: 1px solid var(--line); border-radius: 6px; padding: 0 3px;
  }
  .item.asst .idx { font-weight: 500; opacity: .75; }
  .body { min-width: 0; flex: 1 1 auto; }
  .txt {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
  }
  .item.asst .txt { color: var(--muted); font-size: 12px; }
  .txt mark { background: var(--active); color: var(--accent); border-radius: 3px; padding: 0 1px; font-weight: 600; }
  .meta { color: var(--muted); font-size: 11px; margin-top: 1px; }
  .empty { padding: 22px 14px; color: var(--muted); text-align: center; font-size: 12px; line-height: 1.7; }
  .foot { border-top: 1px solid var(--line); flex: 0 0 auto; }
  .adv { padding: 6px 10px 8px; }
  .adv summary { cursor: pointer; color: var(--muted); font-size: 11px; outline: none; }
  .adv .row { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
  .adv label { width: 46px; flex: 0 0 auto; color: var(--muted); font-size: 11px; }
  .adv input {
    flex: 1 1 auto; height: 24px; padding: 0 6px; font: inherit; font-size: 11px;
    border: 1px solid var(--line); border-radius: 6px; background: transparent; color: var(--fg); outline: none;
  }
  .adv .save {
    margin-top: 6px; height: 24px; padding: 0 10px; border-radius: 6px;
    border: 1px solid var(--line); font-size: 11px; color: var(--muted);
  }
  .adv .save:hover { background: var(--hover); color: var(--fg); }
  .launcher {
    position: fixed; top: 42%; right: 0;
    display: inline-flex; align-items: center; gap: 5px;
    padding: 8px 9px; border: 1px solid var(--line); border-right: 0;
    border-radius: 10px 0 0 10px;
    background: var(--bg); color: var(--fg);
    box-shadow: var(--shadow); z-index: 2147483600;
    cursor: pointer; pointer-events: auto; font-size: 12px;
    writing-mode: vertical-rl; text-orientation: mixed; letter-spacing: 2px;
  }
  .app[data-side="left"] .launcher {
    right: auto; left: 0; border-radius: 0 10px 10px 0; border: 1px solid var(--line); border-left: 0;
  }
  .launcher:hover { background: var(--hover); }
  .app[data-open="true"] .launcher { display: none; }
  .app[data-has="0"] .launcher { display: none; }
  .toast {
    position: fixed; bottom: 104px; right: 24px; z-index: 2147483601;
    background: rgba(20, 20, 20, .88); color: #fff; font-size: 12px;
    padding: 6px 10px; border-radius: 8px; opacity: 0; transition: opacity .2s;
    pointer-events: none;
  }
  .app[data-side="left"] .toast { right: auto; left: 24px; }
  .toast.show { opacity: 1; }
  `;

  /* ======================= 8. DOM ======================= */
  const host = document.createElement('div');
  host.id = 'chat-outline-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483600;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;
  root.appendChild(style);

  const app = document.createElement('div');
  app.className = 'app';
  app.dataset.open = 'false';
  app.dataset.side = 'right';
  app.dataset.has = '0';
  app.innerHTML = `
    <button class="launcher" title="打开对话目录（Alt+Q）" aria-label="打开对话目录（Alt+Q）">目录</button>
    <aside class="panel" role="complementary" aria-label="对话目录">
      <div class="head">
        <span class="title">对话目录</span>
        <span class="count">0</span>
        <span class="auto" hidden title="自动识别页面结构；若不准，请用底部「选择器设置」">自动</span>
        <span class="grow"></span>
        <button class="iconbtn" data-act="asst" title="显示 / 隐藏 AI 回答" aria-label="显示 / 隐藏 AI 回答" aria-pressed="false">答</button>
        <button class="iconbtn" data-act="side" title="换到另一侧" aria-label="换到另一侧">⇄</button>
        <button class="iconbtn" data-act="export" title="导出为 Markdown" aria-label="导出为 Markdown">⤓</button>
        <button class="iconbtn" data-act="refresh" title="重新扫描" aria-label="重新扫描">⟳</button>
        <button class="iconbtn" data-act="close" title="收起（Alt+Q）" aria-label="收起目录（Alt+Q）">✕</button>
      </div>
      <div class="search"><input type="search" placeholder="搜索问题 / 回答…" aria-label="搜索问题 / 回答" /></div>
      <ul class="list"></ul>
      <div class="foot">
        <details class="adv">
          <summary>选择器设置（识别不准时用）</summary>
          <div class="row"><label>提问</label><input data-f="user" spellcheck="false" placeholder="" /></div>
          <div class="row"><label>回答</label><input data-f="assistant" spellcheck="false" placeholder="" /></div>
          <button class="save">保存并重扫</button>
        </details>
      </div>
    </aside>
    <div class="toast"></div>
  `;
  root.appendChild(app);

  const $list = app.querySelector('.list');
  const $count = app.querySelector('.count');
  const $auto = app.querySelector('.auto');
  const $input = app.querySelector('.search input');
  const $toast = app.querySelector('.toast');
  const $btnAsst = app.querySelector('[data-act="asst"]');
  const $fUser = app.querySelector('[data-f="user"]');
  const $fAsst = app.querySelector('[data-f="assistant"]');

  function mount() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  let toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $toast.classList.remove('show'), 2000);
  }

  function applyTheme() {
    app.dataset.theme = isDarkPage() ? 'dark' : 'light';
  }

  /* ======================= 9. 扫描 ======================= */
  // 廉价签名：只数节点和文本长度（textContent 不触发排版）。
  // 没变就跳过后面整套「getBoundingClientRect 可见性测量 + 克隆清洗 + 排序渲染」，
  // 流式输出期间 MutationObserver 触发很频繁，这层能挡掉绝大多数无效扫描。
  function cheapSigOf(nodes) {
    let len = 0;
    for (let i = 0; i < nodes.length; i++) len += (nodes[i].textContent || '').length;
    return nodes.length + ':' + len;
  }

  function collectNodes(nodes, role, siteCfg) {
    const clean = dropNested(nodes.filter(isVisible));
    const container = (siteCfg && siteCfg.container) || null;
    const textRoot = (siteCfg && siteCfg.textRoot) || null;
    const out = [];
    for (const n of clean) {
      const el = (container ? container(n) : n) || n;
      const tn = (textRoot ? textRoot(n) : n) || n;
      let raw = cleanRawCached(tn);
      // 文本节点可能只是消息的一部分（如 Gemini 的 .query-text），
      // 拿不到文字就回退到整条消息里找图片/附件
      if (!raw && el && el !== tn) raw = mediaLabel(el);
      if (!raw) continue;
      out.push({ el, role, raw, text: raw.replace(/\s+/g, ' '), time: pickTime(el) });
    }
    return out;
  }

  function scan(forceDetect) {
    const p = buildPlan(forceDetect);
    if (!p) {
      items = [];
      lastSignature = '';
      lastCheapSig = '';
      app.dataset.has = '0';
      $count.textContent = '0';
      render();
      scheduleRetry();
      return items;
    }

    $auto.hidden = p.mode !== 'auto';

    const userNodes = p.getUser();
    const asstNodes = p.getAssistant ? p.getAssistant() : [];
    const cs = cheapSigOf(userNodes) + '|' + cheapSigOf(asstNodes);
    if (!forceDetect && cs === lastCheapSig) return items;
    lastCheapSig = cs;

    let all = [
      ...collectNodes(userNodes, 'user', p.site),
      ...collectNodes(asstNodes, 'assistant', p.site)
    ];

    // 同一容器只保留一次
    const seen = new Set();
    all = all.filter((it) => {
      if (!it.el || seen.has(it.el)) return false;
      seen.add(it.el);
      return true;
    });

    all.sort((a, b) => {
      const r = a.el.compareDocumentPosition(b.el);
      if (r & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (r & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });

    let q = 0;
    all.forEach((it, i) => {
      if (it.role === 'user') q += 1;
      it.q = q || 1;
      it.key =
        (it.el.getAttribute && (it.el.getAttribute('data-testid') || it.el.id)) ||
        `${it.role}-${i}-${it.text.slice(0, 12)}`;
    });

    // 签名里只在「答」打开时纳入回答长度 —— 这样流式回答时列表能跟着更新；
    // 没开「答」时不纳入，避免回答增长引起无谓的列表重建
    const sig =
      all
        .filter((i) => i.role === 'user')
        .map((i) => i.key + '|' + i.text.slice(0, 40))
        .join('~') +
      (showAssistant ? '|A' + all.filter((i) => i.role === 'assistant').map((i) => i.raw.length).join(',') : '');

    items = all;
    app.dataset.has = items.some((i) => i.role === 'user') ? '1' : '0';

    if (sig !== lastSignature) {
      lastSignature = sig;
      render();
    } else {
      $count.textContent = String(items.filter((i) => i.role === 'user').length);
    }

    if (!openedOnce && items.some((i) => i.role === 'user')) {
      openedOnce = true;
      if (bootReady && prefCollapsed !== true) setOpen(true);
    }

    // 还没有任何提问 → 可能是页面内容晚于 observer 渲染，安排补扫
    if (!items.some((i) => i.role === 'user')) {
      scheduleRetry();
    } else {
      retryCount = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }
    return items;
  }

  /* ======================= 10. 渲染 ======================= */
  function visibleItems() {
    const q = query.toLowerCase();
    return items.filter((it) => {
      if (it.role === 'assistant' && !showAssistant) return false;
      if (!q) return true;
      return it.text.toLowerCase().includes(q);
    });
  }

  // 在转义后的安全 HTML 里给命中关键词包 <mark>，大小写不敏感，保留原文
  function highlightText(text, q) {
    if (!q) return esc(text);
    const lower = text.toLowerCase();
    const ql = q.toLowerCase();
    let out = '';
    let i = 0;
    for (;;) {
      const at = lower.indexOf(ql, i);
      if (at < 0) {
        out += esc(text.slice(i));
        break;
      }
      out += esc(text.slice(i, at)) + '<mark>' + esc(text.slice(at, at + q.length)) + '</mark>';
      i = at + q.length;
    }
    return out;
  }

  function render() {
    const list = visibleItems();
    const userTotal = items.filter((i) => i.role === 'user').length;
    const userShown = list.filter((i) => i.role === 'user').length;
    $count.textContent = query ? `${userShown}/${userTotal}` : String(userTotal);

    const keepScroll = $list.scrollTop;

    if (!list.length) {
      $list.innerHTML = `<li class="empty">${
        items.length
          ? '没有匹配的内容'
          : '没识别到对话<br>按 Alt+Q 可打开设置，<br>在下方填「提问」的 CSS 选择器'
      }</li>`;
      return;
    }

    const html = list
      .map((it) => {
        const isUser = it.role === 'user';
        const idx = isUser ? String(it.q) : '答';
        const meta = [isUser ? '' : `回答 ${it.q}`, it.time].filter(Boolean).join(' · ');
        return `<li class="item${isUser ? ' user' : ' asst'}${it.key === activeKey ? ' active' : ''}" data-key="${esc(
          it.key
        )}" title="${esc(it.text.slice(0, 300))}" tabindex="0" role="button">
          <span class="idx">${esc(idx)}</span>
          <span class="body">
            <span class="txt">${highlightText(it.text, query)}</span>
            ${meta ? `<span class="meta">${esc(meta)}</span>` : ''}
          </span>
        </li>`;
      })
      .join('');
    $list.innerHTML = html;
    $list.scrollTop = keepScroll;
  }

  /* ======================= 11. 跳转 ======================= */
  // 同一元素反复跳转时复用最初样式 + 重置计时器，避免把「高亮态」当原始样式存回去；
  // 跳到新消息时立即清掉上一条的高亮，屏幕上同时只有一圈描边。
  const flashState = new WeakMap();
  let currentFlash = null;

  function restoreFlash(el) {
    const st = flashState.get(el);
    if (!st) return;
    clearTimeout(st.timer);
    el.style.outline = st.outline;
    el.style.outlineOffset = st.offset;
    el.style.borderRadius = st.radius;
    el.style.transition = st.transition;
    flashState.delete(el);
    if (currentFlash === el) currentFlash = null;
  }

  function flash(el) {
    if (currentFlash && currentFlash !== el) restoreFlash(currentFlash);
    let st = flashState.get(el);
    if (!st) {
      st = {
        outline: el.style.outline,
        offset: el.style.outlineOffset,
        radius: el.style.borderRadius,
        transition: el.style.transition,
        timer: null
      };
      flashState.set(el, st);
    }
    clearTimeout(st.timer);
    el.style.transition = 'outline-color .25s ease';
    el.style.outline = '2px solid ' + (app.dataset.theme === 'dark' ? '#2ec08f' : '#10a37f');
    el.style.outlineOffset = '6px';
    el.style.borderRadius = '10px';
    currentFlash = el;
    st.timer = setTimeout(() => restoreFlash(el), 1500);
  }

  function setActive(key, scrollInList) {
    activeKey = key;
    $list.querySelectorAll('.item').forEach((li) => li.classList.toggle('active', li.dataset.key === key));
    if (scrollInList) {
      const cur = $list.querySelector('.item.active');
      if (cur) cur.scrollIntoView({ block: 'nearest' });
    }
  }

  function jumpTo(key) {
    let it = items.find((i) => i.key === key);
    if (!it) return;
    if (!it.el.isConnected) {
      scan(true);
      it = items.find((i) => i.key === key) || it;
      if (!it.el.isConnected) {
        toast('这条消息当前未渲染，先手动滚动一下再试');
        return;
      }
    }
    suppressSpyUntil = Date.now() + 1000;
    it.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flash(it.el);
    setActive(key, true);
  }

  function updateActiveByScroll() {
    if (Date.now() < suppressSpyUntil) return;
    const list = visibleItems();
    if (!list.length) return;
    const line = window.innerHeight * 0.35;
    let best = null;
    for (const it of list) {
      if (!it.el.isConnected) continue;
      const r = it.el.getBoundingClientRect();
      if (r.top <= line) best = it;
      else break;
    }
    if (best && best.key !== activeKey) setActive(best.key, false);
  }

  /* ======================= 12. 导出 ======================= */
  function buildMarkdown() {
    const ts = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}-${p(ts.getMonth() + 1)}-${p(ts.getDate())} ${p(ts.getHours())}:${p(ts.getMinutes())}`;
    let md = `# ${document.title || '对话记录'}\n\n> 来源：${location.href}\n> 导出时间：${stamp}\n\n`;
    if (!items.length) return md + '_（未识别到内容）_\n';
    items.forEach((it) => {
      if (it.role === 'user') {
        md += `\n---\n\n## Q${it.q}${it.time ? ` · ${it.time}` : ''}\n\n${it.raw}\n`;
      } else {
        md += `\n### A${it.q}${it.time ? ` · ${it.time}` : ''}\n\n${it.raw}\n`;
      }
    });
    return md;
  }

  function exportMarkdown() {
    if (!items.length) {
      toast('没有可导出的内容');
      return;
    }
    const md = buildMarkdown();
    const name =
      (document.title || 'conversation')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60) || 'conversation';
    try {
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.md`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 1500);
      toast('已导出 Markdown');
    } catch (e) {
      // 下载被禁（或 Blob 失败）时退回复制；clipboard 在 http 等非安全上下文里可能是 undefined
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(md).then(
            () => toast('下载被拦截，已改为复制到剪贴板'),
            () => toast('导出失败：下载与剪贴板均不可用')
          );
        } else {
          toast('导出失败：当前环境不支持下载，请检查浏览器设置');
        }
      } catch (e2) {
        toast('导出失败');
      }
    }
  }

  /* ======================= 13. 交互 ======================= */
  function setOpen(open) {
    app.dataset.open = open ? 'true' : 'false';
    if (open) {
      applyTheme();
      scan();
      updateActiveByScroll();
    }
    prefCollapsed = !open;
    store.set('pref:collapsed', !open);
  }

  app.querySelector('.launcher').addEventListener('click', () => setOpen(true));

  app.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const act = btn.dataset.act;
      if (act === 'close') setOpen(false);
      if (act === 'refresh') {
        lastSignature = '';
        lastCheapSig = '';
        scan(true);
        render();
        toast(`已重新扫描：${items.filter((i) => i.role === 'user').length} 个提问`);
      }
      if (act === 'export') exportMarkdown();
      if (act === 'asst') {
        showAssistant = !showAssistant;
        $btnAsst.setAttribute('aria-pressed', String(showAssistant));
        store.set('pref:showAssistant', showAssistant);
        render();
      }
      if (act === 'side') {
        side = side === 'right' ? 'left' : 'right';
        app.dataset.side = side;
        store.set('pref:side', side);
      }
      return;
    }
    const li = e.target.closest('.item');
    if (li) jumpTo(li.dataset.key);
  });

  // 键盘操作：Tab 到某条后 Enter / 空格即可跳转（与鼠标点击等效）
  $list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const li = e.target.closest('.item');
    if (!li) return;
    e.preventDefault();
    jumpTo(li.dataset.key);
  });

  $input.addEventListener('input', () => {
    query = $input.value.trim();
    render();
  });
  $input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = visibleItems()[0];
      if (first) jumpTo(first.key);
      else if (query) toast('没有匹配的内容');
    }
    if (e.key === 'Escape') {
      $input.value = '';
      query = '';
      render();
      $input.blur();
    }
  });

  app.querySelector('.adv .save').addEventListener('click', () => {
    overrides = { user: $fUser.value.trim(), assistant: $fAsst.value.trim() };
    store.set(`sel:${HOSTKEY}`, overrides);
    lastSignature = '';
    scan(true);
    render();
    toast(overrides.user ? '已保存选择器' : '已清空，恢复自动识别');
  });

  let rafId = null;
  window.addEventListener(
    'scroll',
    () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateActiveByScroll();
      });
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.code === 'KeyQ' || (e.key || '').toLowerCase() === 'q')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(app.dataset.open !== 'true');
      }
    },
    true
  );

  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'CHAT_OUTLINE_TOGGLE') setOpen(app.dataset.open !== 'true');
    });
  } catch (e) {
    /* ignore */
  }

  /* ======================= 14. 存储 ======================= */
  const store = {
    get(key, def) {
      return new Promise((resolve) => {
        let done = false;
        const finish = (v) => {
          if (done) return;
          done = true;
          resolve(v);
        };
        // storage 回调可能永远不返回（扩展上下文失效等），
        // 不能让它卡住初始化——否则观察器和首次扫描都起不来
        const timer = setTimeout(() => finish(def), 800);
        try {
          if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            clearTimeout(timer);
            return finish(def);
          }
          chrome.storage.local.get([key], (r) => {
            void chrome.runtime.lastError;
            clearTimeout(timer);
            finish(r && r[key] !== undefined ? r[key] : def);
          });
        } catch (e) {
          clearTimeout(timer);
          finish(def);
        }
      });
    },
    set(key, val) {
      try {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.set({ [key]: val }, () => void chrome.runtime.lastError);
      } catch (e) {
        /* ignore */
      }
    }
  };

  /* ======================= 15. 启动 ======================= */
  // 后台标签页不扫描（MutationObserver 照触但直接丢弃），回前台时补一次
  const scheduleScan = debounce(() => {
    if (!document.hidden) scan(false);
  }, 400);
  const mo = new MutationObserver(() => {
    domEpoch += 1;
    scheduleScan();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleScan();
  });

  // 目录为空时的补扫：间隔递减后拉长，最多 ~30 秒，之后交给 DOM 变动
  const RETRY_DELAYS = [300, 600, 1000, 1500, 2000, 3000, 3000, 4000, 5000, 5000, 6000];
  function scheduleRetry() {
    if (retryTimer || retryCount >= RETRY_DELAYS.length) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      retryCount += 1;
      if (document.hidden) {
        scheduleRetry();
        return;
      }
      scan(true);
    }, RETRY_DELAYS[retryCount]);
  }

  function boot() {
    mount();
    applyTheme();
    if (window.matchMedia) {
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
      } catch (e) {
        /* ignore */
      }
    }

    // 先挂观察器、先扫一次：偏好读取失败或超时也不能让目录起不来
    mo.observe(document.documentElement, { childList: true, subtree: true });
    scan(true);

    Promise.all([
      store.get('pref:collapsed', false),
      store.get('pref:side', 'right'),
      store.get('pref:showAssistant', false),
      store.get(`sel:${HOSTKEY}`, null)
    ]).then(([collapsed, s, asst, sel]) => {
      prefCollapsed = collapsed;
      side = s === 'left' ? 'left' : 'right';
      app.dataset.side = side;
      showAssistant = !!asst;
      $btnAsst.setAttribute('aria-pressed', String(showAssistant));
      if (sel && (sel.user || sel.assistant)) {
        overrides = { user: sel.user || '', assistant: sel.assistant || '' };
        $fUser.value = overrides.user;
        $fAsst.value = overrides.assistant;
      }
      $fUser.placeholder = (SITE && SITE.user) || '例：.user-message';
      $fAsst.placeholder = (SITE && SITE.assistant) || '例：.assistant-message';

      bootReady = true;
      scan(true);
      render();
      if (items.some((it) => it.role === 'user')) {
        if (prefCollapsed !== true && app.dataset.open !== 'true') setOpen(true);
      } else {
        scheduleRetry();
      }
    });

    // 刷新 / 从往返缓存恢复 / 资源加载完成，都补一次扫描
    if (document.readyState === 'complete') {
      scheduleRetry();
    } else {
      window.addEventListener('load', () => scan(true), { once: true });
    }
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) scan(true);
    });

    // SPA 路由切换：包裹 history API + popstate/hashchange 做即时感知，
    // 1s 轮询只当兜底（个别框架直接改 location 不走这些钩子）
    let lastHref = location.href;
    function handleNav() {
      if (location.href === lastHref) return;
      lastHref = location.href;
      items = [];
      activeKey = null;
      lastSignature = '';
      lastCheapSig = '';
      plan = null;
      planSig = '';
      nullEpoch = -1;
      editMemo = { stamp: -1, anchors: [] };
      query = '';
      $input.value = '';
      setTimeout(() => {
        scan(true);
        render();
      }, 700);
    }
    setInterval(handleNav, 1000);
    try {
      const fire = () => setTimeout(handleNav, 50);
      ['pushState', 'replaceState'].forEach((m) => {
        const orig = history[m];
        history[m] = function (...args) {
          const r = orig.apply(this, args);
          fire();
          return r;
        };
      });
      window.addEventListener('popstate', fire);
      window.addEventListener('hashchange', fire);
    } catch (e) {
      /* ignore */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
