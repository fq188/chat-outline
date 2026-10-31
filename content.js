/* =========================================================================
 * 对话目录 · Chat Outline  (v1.5.0)
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
        const generic =
          !alt ||
          /^(image|picture|photo|uploaded image|uploaded file|attachment|file|图片|已上传的图片|图像|附件|用户附件)$/i.test(alt);
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

  /* —— 时间线：从页面里找「日期分隔条」，把对话按天分组 —— */
  // ChatGPT / Gemini / Claude 这类站点会在两轮之间插一条「今天 / 昨天 / 10月24日」
  // 的分隔条。它没有统一的选择器，所以按「短文本 + 长得像日期」来认。
  // 只认「几乎不可能是别的东西」的写法。
  // 裸的「1/2」「2/3」不认 —— 它既是美式月/日，也常是分数、页码、题号，
  // 误伤率太高；真日期交给站点自己的 <time datetime> 去说（见 dayFromTime）
  const DAY_RE =
    /^(?:(?:今天|昨天|前天|今天早些时候|today|yesterday)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{1,2}(?:,\s*\d{4})?|(?:\d{4}年)?\d{1,2}月\d{1,2}日|\d{4}[-/]\d{1,2}[-/]\d{1,2})$/i;

  // 「这是一条消息」的通用标记：日期分隔条绝不能长在它里面
  const MSG_SEL =
    '[data-message-author-role], [data-testid^="conversation-turn"], [data-turn-id], user-query, model-response, message-content, .query-text';

  // 站点没给日期分隔条时，退一步用它给的时间戳（M/D HH:MM）折成「M月D日」
  function dayFromTime(t) {
    const m = /^(\d{1,2})\/(\d{1,2})\b/.exec(String(t || ''));
    return m ? `${parseInt(m[1], 10)}月${parseInt(m[2], 10)}日` : '';
  }

  // 日期统一成中文能读的样子：1/2 → 1月2日，Jun 3, 2025 → 2025年6月3日。
  // 站点给什么写法都有，直接照抄到组头上，用户看着就是一堆乱码
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function fmtDay(label) {
    const s = String(label || '').trim();
    if (!s) return '';
    let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
    if (m) return `${m[1]}年${+m[2]}月${+m[3]}日`;
    m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/.exec(s);
    if (m) {
      const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      return `${y}年${+m[1]}月${+m[2]}日`;
    }
    m = /^(\d{1,2})[-/](\d{1,2})$/.exec(s);
    if (m) return `${+m[1]}月${+m[2]}日`;
    m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,\s*(\d{4}))?$/i.exec(s);
    if (m) {
      const i = MON.indexOf(m[1].toLowerCase());
      if (i >= 0) return `${m[3] ? m[3] + '年' : ''}${i + 1}月${+m[2]}日`;
    }
    return s;
  }

  // 「更早」组的名字（比前面所有日期都早、但分隔条没渲染出来的那几条）
  function earlierLabel() {
    return /^zh/i.test(document.documentElement.lang || navigator.language || '') ? '更早' : 'Earlier';
  }

  function normalizeDay(txt) {
    return String(txt || '')
      .replace(/\s+/g, ' ')
      .replace(/[·•,，.。]+$/g, '')
      .trim()
      .slice(0, 24);
  }

  // 只认「最内层」的日期文本节点：外层容器 textContent 也会命中，留着会一串重复
  function collectDaySeps(root) {
    const out = [];
    if (!root || !root.querySelectorAll) return out;
    let nodes = [];
    try {
      nodes = root.querySelectorAll('div,span,p,time,li,h1,h2,h3,h4,h5,h6,strong,b,em,small');
    } catch (e) {
      return out;
    }
    for (const el of nodes) {
      // 消息内部一律不看，免得把「今天」这种正文当成日期分隔条
      if (el.querySelector('[data-message-author-role], article, [data-testid^="conversation-turn"]')) {
        continue;
      }
      // 自己就长在消息里面（比如正文里的「1/2」「今天」）也一样跳过 ——
      // 只查子孙节点会漏掉这一层，把消息里的「1/2」当成日期分隔条，
      // 那一天就会在目录里被劈成两半
      if (el.parentElement && el.parentElement.closest(MSG_SEL)) continue;
      const raw = el.textContent || '';
      if (raw.length > 32) continue;
      const txt = normalizeDay(raw);
      if (!txt || !DAY_RE.test(txt)) continue;
      let inner = false;
      for (const c of el.children) {
        if (DAY_RE.test(normalizeDay(c.textContent || ''))) {
          inner = true;
          break;
        }
      }
      if (inner) continue;
      out.push({ el, label: txt });
    }
    return out;
  }

  let daySepCache = { at: 0, seps: [] };
  function daySeps() {
    if (Date.now() - daySepCache.at < 3000) return daySepCache.seps;
    const anyEl = (items.find((i) => i.el && i.el.isConnected) || {}).el;
    const root = (anyEl && findScroller(anyEl)) || document.body;
    let seps = [];
    try {
      seps = collectDaySeps(root);
    } catch (e) {
      seps = [];
    }
    daySepCache = { at: Date.now(), seps };
    return seps;
  }

  // 这条消息属于哪一天：取它前面最近的一条日期分隔条
  function dayLabelFor(el, seps) {
    if (!el || !seps.length) return '';
    for (let i = seps.length - 1; i >= 0; i -= 1) {
      const s = seps[i];
      if (!s.el.isConnected) continue;
      let pos = 0;
      try {
        pos = s.el.compareDocumentPosition(el);
      } catch (e) {
        pos = 0;
      }
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return s.label;
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
  // v1.3.0：默认连回答一起列出来（跟着时间线分组、回答缩进显示）
  let showAssistant = true;
  let side = 'right';
  let query = '';
  let activeKey = null;
  let suppressSpyUntil = 0;
  let overrides = { user: '', assistant: '' };
  let openedOnce = false;
  let prefCollapsed = null;
  let lastSignature = '';
  let lastCheapSig = '';
  // 折叠了哪些时间分组（按标签存，存进 sessionStorage，刷新后还在）
  let foldedDays = new Set();
  let foldLoadedFor = '';
  // 补扫过程中让列表跟着长（节流）：长对话要扫半分钟，不能一直空着不更新
  let lastQuietRender = 0;
  // 刷新后补扫：内容常常在 MutationObserver 挂上之前就渲染完，
  // 之后页面不再变动，只等 DOM 变动就会一直空着
  let retryTimer = null;
  let retryCount = 0;
  // 偏好读取完成后才允许自动展开，避免刷新瞬间先弹一下面板再收起
  let bootReady = false;

  // —— 虚拟列表累积（v1.2.3）——
  // ChatGPT 这类站点只把视口附近的几轮对话留在 DOM 里，滚远了就卸载。
  // 如果每次都「按当前 DOM 重建目录」，看到的永远只是点开那条上下几条。
  // 所以改成：每次扫描都并进一份长期档案（按稳定 key 去重），顺序按文档位置维护。
  const archive = new Map(); // key -> item
  let order = []; // key 数组，文档顺序
  let archiveHref = '';
  let sweepTimer = null;
  let sweeping = false;
  let sweepAbort = false;
  let sweptOnce = false;
  let sweepBlockedUntil = 0;
  // 长对话一趟扫不完时接着扫：记住走到哪、已经扫过几趟（v1.2.6）
  let sweepResume = null; // { sc, y } 上一趟停在哪个位置
  let sweepRound = 0; // 这一页已经补扫过几趟
  let sweepNextAt = 0; // 下一趟最早什么时候能开始
  const SWEEP_MAX_ROUNDS = 8; // 最多连着扫 8 趟，防死循环
  // 判断「收全了没有」用的进度：从顶部起过（fromTop）+ 有趟真的走到了底（done）
  const sweepCover = { fromTop: false, done: false };

  /* ======================= 7. 样式 ======================= */
  const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; }
  .app {
    --bg: #ffffff;
    --fg: #1f2328;
    --muted: #6b7280;
    --line: #e6e8eb;
    --rail: #ccd1d8;
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
    --rail: #54575e;
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
    /* 实心底色把组内那条脊线挡在徽章后面，看着才像「节点穿在线上」 */
    background: var(--bg);
  }
  .item:hover .idx { background: var(--hover); }
  .item.active .idx { background: var(--active); }
  .item.asst .idx { font-weight: 500; opacity: .75; }
  .body { min-width: 0; flex: 1 1 auto; }
  .txt {
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
  }
  .item.asst .txt {
    color: var(--muted); font-size: 12px;
    -webkit-line-clamp: 1;   /* 回答只留一行预览：目录是用来导航的，不是用来读的 */
  }
  .txt mark { background: var(--active); color: var(--accent); border-radius: 3px; padding: 0 1px; font-weight: 600; }
  .meta { color: var(--muted); font-size: 11px; margin-top: 1px; }

  /* —— 时间线分组（一级）+ 回答缩进（v1.3.0） —— */
  .grp { list-style: none; }
  .grphead {
    display: flex; align-items: center; gap: 6px;
    width: 100%; padding: 5px 6px; margin-top: 2px;
    border-radius: 7px; text-align: left;
    color: var(--muted); font-size: 11px; font-weight: 600;
    letter-spacing: .3px; cursor: pointer;
    position: sticky; top: 0; z-index: 2;
    background: var(--bg);
  }
  .grphead:hover { background: var(--hover); color: var(--fg); }
  .grphead:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
  .grphead .caret {
    width: 10px; flex: 0 0 auto; font-size: 9px; opacity: .8;
    transition: transform .15s ease;
  }
  .grp.folded .grphead .caret { transform: rotate(-90deg); }
  .grphead .glabel { flex: 0 0 auto; }
  .grphead .gmeta {
    flex: 0 0 auto; font-weight: 400; opacity: .8;
    background: var(--hover); border-radius: 20px; padding: 0 6px;
  }
  .grphead .gline { flex: 1 1 auto; height: 1px; background: var(--line); }
  /* 折叠起来时，组头右侧补一条「这一组最后一问」的摘要，收起也知道里面是什么 */
  .grphead .gpeek {
    display: none; flex: 1 1 auto; min-width: 0;
    font-weight: 400; letter-spacing: 0; opacity: .9;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .grp.folded .grphead .gpeek { display: block; }
  .grp.folded .grphead .gline { display: none; }
  .grp + .grp { margin-top: 7px; }
  .grpbody { list-style: none; margin: 0; padding: 0; position: relative; z-index: 0; }
  /* 组内一条细脊线，把条目串成一列「节点」—— 分组和条目的层级一眼看得出来 */
  .grpbody::before {
    content: ''; position: absolute; left: 16px; top: 5px; bottom: 5px;
    width: 1px; background: var(--rail); z-index: -1;
  }

  /* 分组工具条：全部展开 / 全部收起（只在有多组时出现） */
  .gbar {
    display: flex; align-items: center; gap: 6px;
    padding: 2px 10px 3px; flex: 0 0 auto;
    border-bottom: 1px solid var(--line);
    color: var(--muted); font-size: 11px;
  }
  .gbar[hidden] { display: none; }
  .gbar .gsum { flex: 1 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gbar .gact {
    flex: 0 0 auto; height: 20px; padding: 0 8px; border-radius: 6px;
    border: 1px solid var(--line); color: var(--muted); font-size: 11px;
  }
  .gbar .gact:hover { background: var(--hover); color: var(--fg); border-color: var(--muted); }
  .gbar .gact:focus-visible { outline: 2px solid var(--accent); outline-offset: -1px; }
  .grp.folded .grpbody { display: none; }
  /* 回答：整体缩进约两个字，和提问一眼分得开。
     不再单独画引导线 —— 组里已经有一条脊线了，两条紧挨着的竖线看着像画错了 */
  .item.asst {
    margin-left: 1.2em;
    padding-left: calc(4px + .9em);
    border-radius: 8px;
  }
  .item.asst .idx {
    border-color: transparent; background: none;
    font-weight: 400; opacity: .55;
  }
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
      <div class="gbar" hidden>
        <span class="gsum"></span>
        <button class="gact" data-act="foldAll" aria-label="全部折叠或展开">全部收起</button>
      </div>
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
  const $gbar = app.querySelector('.gbar');
  const $gsum = app.querySelector('.gbar .gsum');
  const $btnFoldAll = app.querySelector('[data-act="foldAll"]');
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

  /* ======================= 8.5 滚动容器 / 稳定 key ======================= */
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 消息往上找第一个「能滚且真的在滚」的祖先，就是对话滚动容器。
  // 虚拟列表只渲染这个容器的视口附近，靠它才能把整段对话扫一遍。
  function findScroller(node) {
    let el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      let cs = null;
      try {
        cs = getComputedStyle(el);
      } catch (e) {
        cs = null;
      }
      const oy = cs && cs.overflowY;
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        el.scrollHeight > el.clientHeight + 24
      ) {
        return el;
      }
      el = el.parentElement;
    }
    const se = document.scrollingElement || document.documentElement;
    return se && se.scrollHeight > se.clientHeight + 24 ? se : null;
  }

  // 元素相对滚动容器的位置比例（0~1）。虚拟列表里条目会被卸载，
  // 记下这个比例，跳转时才有「大概往哪儿滚」的依据。
  function ratioOf(el) {
    if (!el || !el.getBoundingClientRect) return 0;
    const sc = findScroller(el);
    if (!sc) return 0;
    const rect = el.getBoundingClientRect();
    const srect = sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0 };
    const top = rect.top - srect.top + (sc.scrollTop || 0);
    return Math.max(0, Math.min(1, top / Math.max(1, sc.scrollHeight)));
  }

  // 从属性里抠「第几轮」：用来判断序号有没有缺口，也是跳转定位的备用锚点
  const IDX_RE = /(\d+)\s*$/;
  function indexOfNode(el) {
    if (!el || !el.getAttribute) return null;
    const cands = [
      el.getAttribute('data-testid'),
      el.getAttribute('data-turn-id'),
      el.getAttribute('data-message-id'),
      el.getAttribute('data-index'),
      el.id
    ];
    for (const c of cands) {
      if (!c) continue;
      if (/^\d+$/.test(c)) return parseInt(c, 10);
      const m = String(c).match(IDX_RE);
      if (m && /(turn|message|msg|index|item)/i.test(String(c))) return parseInt(m[1], 10);
    }
    return null;
  }

  // 没有稳定属性时的兜底 key：用文本指纹，位置变了也不会变成新条目
  function hashText(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36) + '-' + s.length.toString(36);
  }

  function keyOfNode(el, role, text) {
    const attr =
      (el &&
        el.getAttribute &&
        (el.getAttribute('data-testid') || el.getAttribute('data-turn-id') || el.id)) ||
      '';
    return attr ? 'k:' + attr : 't:' + role + ':' + hashText(text);
  }

  /* ======================= 8.6 快速通道：直接读会话数据 ======================= */
  // 虚拟列表逼着我们上下滚动才能把目录凑齐 —— 一段几十轮的对话要滚十几秒，
  // 页面还会明显地跳来跳去，用户是看得见的。能读到站点自己的会话数据的话，
  // 一次请求就有整段对话：不滚动、不闪烁，也不受「只渲染视口附近」的限制。
  //
  // 读不到（没登录 / 接口变了 / 不是这个站点）就安静地退回滚动补扫，
  // 功能一点不受影响，只是慢回原来的样子。
  let apiThread = null; // 全量条目（按对话顺序），null = 没拿到
  let apiState = 'idle'; // idle | loading | ok | failed
  let apiForHref = '';
  let apiRetryAt = 0;
  let apiRefetchLeft = 3;
  let apiStartAt = 0;
  let apiWatchdog = null; // 快速通道超时兜底：到点还没结果就直接交回滚动补扫

  function clockOf(ts) {
    const d = new Date((ts || 0) * 1000);
    if (isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // 时间戳 → 与页面分隔条同一套说法（今天 / 昨天 / 10月24日），
  // 两边说法不一致的话，同一天会被 fixDays 之外的逻辑切碎
  function dayOfTs(ts) {
    const d = new Date((ts || 0) * 1000);
    if (isNaN(d.getTime()) || !ts) return '';
    const at = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((at(new Date()) - at(d)) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // ChatGPT 的 content.parts 可能混着字符串和图片引用
  function cgptParts(c) {
    const parts = (c && c.parts) || [];
    const txt = [];
    let imgs = 0;
    for (const p of parts) {
      if (typeof p === 'string') {
        if (p.trim()) txt.push(p);
      } else if (p && typeof p === 'object') {
        if (p.asset_pointer || p.content_type === 'image_asset_pointer') imgs += 1;
        else if (p.text) txt.push(String(p.text));
      }
    }
    if (txt.length) return txt.join('\n').trim();
    if (imgs) return imgs > 1 ? `[图片 ×${imgs}]` : '[图片]';
    return String((c && c.text) || '').trim();
  }

  async function cgptThread() {
    const m = /\/c\/([0-9a-zA-Z-]{8,})/.exec(location.pathname);
    if (!m) return null;
    const hdr = {};
    try {
      const s = await fetch('/api/auth/session', { credentials: 'include' });
      if (s.ok) {
        const j = await s.json();
        if (j && j.accessToken) hdr.authorization = 'Bearer ' + j.accessToken;
      }
    } catch (e) {
      /* 拿不到 token 也再试一把：有些部署只认 cookie */
    }
    // 路径只认一种写法，但参数各家版本不一样：先按最标准的来，不成再带上分页参数
    const urls = [
      '/backend-api/conversation/' + m[1],
      '/backend-api/conversation/' + m[1] + '?offset=0&limit=100'
    ];
    let data = null;
    for (const u of urls) {
      let r = null;
      try {
        r = await fetch(u, { credentials: 'include', headers: hdr });
      } catch (e) {
        continue;
      }
      if (!r || !r.ok) continue;
      const j = await r.json().catch(() => null);
      if (j && j.mapping) {
        data = j;
        break;
      }
    }
    if (!data) return null;
    const map = data.mapping;
    // 从当前节点沿 parent 往回走，得到的就是「这条分支」的线性对话
    let start = data.current_node;
    if (!start || !map[start]) {
      // 没给 current_node：找那个没有 children 的末端节点
      for (const k in map) {
        const ch = map[k] && map[k].children;
        if (!ch || !ch.length) {
          start = k;
          break;
        }
      }
    }
    const out = [];
    const seen = new Set();
    let node = start;
    while (node && map[node] && !seen.has(node)) {
      seen.add(node);
      const msg = map[node].message;
      if (msg && msg.author && /^(user|assistant)$/.test(msg.author.role)) {
        const t = cgptParts(msg.content);
        if (t) out.push({ id: msg.id || node, role: msg.author.role, text: t, ts: msg.create_time || 0 });
      }
      node = map[node].parent;
    }
    out.reverse();
    return out.length ? out : null;
  }

  const API_ADAPTERS = { 'chatgpt.com': cgptThread, 'chat.openai.com': cgptThread };

  function applyApiThread(list) {
    const rows = [];
    list.forEach((m, i) => {
      const text = String(m.text || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      rows.push({
        key: 'api:' + m.id,
        role: m.role,
        raw: m.text,
        text,
        time: clockOf(m.ts),
        day: dayOfTs(m.ts),
        ratio: list.length > 1 ? i / (list.length - 1) : 0,
        el: null,
        gone: false,
        api: true
      });
    });
    if (rows.length < 2) return false;
    archive.clear();
    for (const it of rows) archive.set(it.key, it);
    order = rows.map((i) => i.key);
    apiThread = rows;
    apiState = 'ok';
    apiRefetchLeft = 3;
    if (apiWatchdog) {
      clearTimeout(apiWatchdog);
      apiWatchdog = null;
    }
    sweptOnce = true; // 已经是全量，不用再滚
    sweepAbort = true; // 正在滚的那趟也别滚了
    sweepResume = null;
    lastSignature = '';
    lastCheapSig = '';
    scan(true, false);
    return true;
  }

  // 配对用的文本指纹：去掉「[图片 ×6]」这类方括号标注和所有空白 ——
  // 接口给的图片消息和页面渲染出来的写法不一样，但去掉之后就都一样了
  function normMatch(t) {
    return String(t || '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[\s\u200b]+/g, '')
      .slice(0, 60);
  }

  function apiCandidates() {
    if (!apiThread) return null;
    const map = new Map();
    for (const it of apiThread) {
      if (!map.has(it.role)) map.set(it.role, []);
      map.get(it.role).push({ key: it.key, norm: normMatch(it.text), taken: false });
    }
    return map;
  }

  // 页面上这条消息对应 API 里的哪一条：按角色 + 文本前缀配对，一对一消耗。
  // 图片消息两边去括号后都是空串，就按出现顺序一一对上。
  function apiKeyOf(cands, it) {
    if (!cands) return null;
    const list = cands.get(it.role);
    if (!list) return null;
    const n = normMatch(it.text);
    for (const c of list) {
      if (c.taken) continue;
      if (!n && !c.norm) {
        c.taken = true;
        return c.key;
      }
      if (!n || !c.norm) continue;
      // 回答在流式生成时，页面上的文字是接口那条的前缀，所以两个方向都要认
      if (n === c.norm || c.norm.indexOf(n) === 0 || n.indexOf(c.norm) === 0) {
        c.taken = true;
        return c.key;
      }
    }
    return null;
  }

  // 快速通道走不通（接口 401 / 结构变了 / 超时）：把机会立刻还给滚动补扫。
  // 这里必须主动叫一次 maybeSweep —— 之后页面的扫描几乎都是 quiet（observer 防抖），
  // 不会再去触发补扫判定，被动等就等于永远等下去。
  function apiGiveUp() {
    apiState = 'failed';
    apiRetryAt = Date.now() + 60000;
    if (apiWatchdog) {
      clearTimeout(apiWatchdog);
      apiWatchdog = null;
    }
    if (apiThread || sweptOnce) return;
    setTimeout(() => {
      try {
        maybeSweep();
      } catch (e) {
        /* ignore */
      }
    }, 0);
  }

  function maybeApiLoad(force) {
    if (!force && (apiState === 'loading' || apiState === 'ok')) return;
    if (!force && Date.now() < apiRetryAt) return;
    const ad = API_ADAPTERS[location.hostname];
    if (!ad) return;
    apiForHref = location.href;
    apiState = 'loading';
    apiStartAt = Date.now();
    const shownBefore = archive.size;
    if (apiWatchdog) clearTimeout(apiWatchdog);
    apiWatchdog = setTimeout(() => {
      apiWatchdog = null;
      if (apiForHref !== location.href || apiThread) return;
      if (apiState !== 'loading') return;
      apiGiveUp();
    }, 8000);
    Promise.resolve()
      .then(ad)
      .then((list) => {
        if (apiForHref !== location.href) return;
        if (!list || !list.length) {
          apiGiveUp();
          return;
        }
        if (apiWatchdog) {
          clearTimeout(apiWatchdog);
          apiWatchdog = null;
        }
        if (!applyApiThread(list)) {
          apiGiveUp();
          return;
        }
        const n = list.filter((m) => m.role === 'user').length;
        // 只在这种「本来要滚很久」的情况下提醒一次，别每次都弹
        if (shownBefore < n - 6 && n >= 10) toast(`已直接读取整段对话（${n} 条提问），不用滚动加载`);
      })
      .catch(() => {
        if (apiForHref !== location.href) return;
        apiGiveUp();
      });
  }

  // 快速通道还在路上：先别急着滚页面，等它一会儿（最多 8 秒）
  function apiPending() {
    if (!API_ADAPTERS[location.hostname]) return false;
    if (apiState === 'ok') return false;
    if (apiState === 'loading') return Date.now() - apiStartAt < 8000;
    return apiState === 'idle';
  }

  // 对话里又冒出新消息（接口快照里还没有）：安静地再拉一次，最多几次
  function scheduleApiRefetch() {
    if (!apiThread || apiRefetchLeft <= 0 || apiState === 'loading') return;
    apiRefetchLeft -= 1;
    setTimeout(() => maybeApiLoad(true), 4000);
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

  /* —— 顺序维护 ——
   * order 是「文档顺序」的 key 数组，但站点会做两件让人措手不及的事：
   *   ① 虚拟列表只挂一小段，我们永远只能看到局部顺序；
   *   ② turn 编号会被复用（编辑、重新发送、切分支后，同一个 N 换了一条消息）。
   * 于是每条新消息必须靠「DOM 里挨着谁」来落位，不能一律接在末尾，
   * 也不能因为 key 撞上了就原地改字 —— 那就是「刚问的问题显示在中间」的成因。
   */
  function mergeBatchOrder(batchKeys, atTop) {
    const n = batchKeys.length;
    for (let i = 0; i < n; i += 1) {
      const k = batchKeys[i];
      if (order.indexOf(k) >= 0) continue;
      let pos = -1;
      // ① 后面最近的一条已知条目 → 插到它前面（往上翻到更早的消息时落回原位）
      for (let j = i + 1; j < n; j += 1) {
        const aj = order.indexOf(batchKeys[j]);
        if (aj >= 0) {
          pos = aj;
          break;
        }
      }
      // ② 后面没有已知条目 → 贴到前面最近的那条后面
      if (pos < 0) {
        for (let j = i - 1; j >= 0; j -= 1) {
          const aj = order.indexOf(batchKeys[j]);
          if (aj >= 0) {
            pos = aj + 1;
            break;
          }
        }
      }
      // ③ 整批都是新的：停在最顶上说明这是更早的历史，插队首；
      //    否则就是刚追加的一轮，放末尾
      if (pos < 0) pos = atTop ? 0 : order.length;
      order.splice(pos, 0, k);
    }
  }

  // 本轮看到的 DOM 顺序就是真相：相邻两条在 order 里反过来了，
  // 说明其中一条位置过时了，把后一条挪到前一条之后
  function fixBatchOrder(batchKeys) {
    for (let i = 1; i < batchKeys.length; i += 1) {
      const a = order.indexOf(batchKeys[i - 1]);
      const b = order.indexOf(batchKeys[i]);
      if (a < 0 || b < 0 || b > a) continue;
      order.splice(b, 1);
      order.splice(order.indexOf(batchKeys[i - 1]) + 1, 0, batchKeys[i]);
    }
  }

  // 已经滚到对话最底部：本轮最后一条就是「最新的一条」。
  // order 里排在它后面的，只可能是「编辑消息 / 重新发送 / 切分支」之后
  // 页面已经不再渲染的旧分支残留 —— 清掉，并把最新那条顶到末尾。
  // 这是「刚问出的问题显示在目录中间」的根因：新问题按锚点插到了老位置，
  // 废弃分支的那几条还赖在它后面冒充更晚的提问。
  function fixTailOrder(batchKeys, atTail) {
    if (!atTail || !batchKeys.length) return;
    const lastKey = batchKeys[batchKeys.length - 1];
    const j = order.indexOf(lastKey);
    if (j < 0 || j === order.length - 1) return;
    const tail = order.slice(j + 1);
    // 安全阀：排在后面的条目要是还挂在页面上，说明 lastKey 并不是最后一条
    for (const k of tail) {
      const o = archive.get(k);
      if (o && o.el && o.el.isConnected) return;
    }
    const lastIt = archive.get(lastKey);
    const lastIdx = lastIt && lastIt.idx != null ? lastIt.idx : null;
    const keep = [];
    for (const k of tail) {
      const o = archive.get(k);
      // 轮次序号比最后一条还大 → 页面上不可能再有它了，是废弃分支的残留
      if (lastIdx != null && o && o.idx != null && o.idx > lastIdx) {
        archive.delete(k);
        continue;
      }
      keep.push(k);
    }
    order = order.slice(0, j).concat(keep, [lastKey]);
  }

  // 日期标签只会沿时间线往前走：「今天 → 1/2 → 今天」里的中间那段一定是误识别
  function fixDays(list) {
    const runs = [];
    for (const it of list) {
      const d = it.day || '';
      const last = runs[runs.length - 1];
      if (last && last.label === d) last.items.push(it);
      else runs.push({ label: d, items: [it] });
    }
    for (let k = 1; k < runs.length; k += 1) {
      const lab = runs[k].label;
      if (!lab) continue;
      let first = -1;
      for (let j = 0; j < k; j += 1) {
        if (runs[j].label === lab) {
          first = j;
          break;
        }
      }
      if (first < 0) continue;
      for (let j = first + 1; j <= k; j += 1) {
        runs[j].label = lab;
        for (const x of runs[j].items) x.day = lab;
      }
    }
  }

  function scan(forceDetect, quiet) {
    const p = buildPlan(forceDetect);
    if (!p) {
      items = [];
      archive.clear();
      order = [];
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

    // 换了对话就清空档案，别把上一段的条目混进来
    if (archiveHref && archiveHref !== location.href) {
      archive.clear();
      order = [];
      sweptOnce = false;
      sweepRound = 0;
      sweepResume = null;
      sweepNextAt = 0;
      daySepCache = { at: 0, seps: [] };
      // 快速通道也要跟着换：上一段对话的数据不能留
      apiThread = null;
      apiState = 'idle';
      apiRetryAt = 0;
      apiRefetchLeft = 3;
      if (apiWatchdog) {
        clearTimeout(apiWatchdog);
        apiWatchdog = null;
      }
    }
    archiveHref = location.href;
    // 刚进一个对话：先试试能不能直接读到整段（不滚动、不闪）
    maybeApiLoad();

    // 稳定 key：优先用站点给的 turn/message 标识，没有就用文本指纹。
    // 虚拟列表会反复卸载重挂同一条消息，key 不稳就会重复/错位。
    // 已经拿到整段对话时，优先复用接口那边的 key —— 这样页面滚到哪、
    // 哪条被虚拟列表卸载，目录里的位置都不会变。
    const usedKeys = new Set();
    const apiCands = apiCandidates();
    all.forEach((it) => {
      const apiKey = apiKeyOf(apiCands, it);
      const base = apiKey || keyOfNode(it.el, it.role, it.text);
      let k = base;
      let n = 1;
      while (usedKeys.has(k)) {
        n += 1;
        k = base + '#' + n;
      }
      usedKeys.add(k);
      it.key = k;
      it.idx = indexOfNode(it.el);
    });
    // 最新一条提问不在接口快照里 —— 多半是刚发出去的，安静地再拉一次
    if (apiThread) {
      const lastUser = all.length ? all.filter((x) => x.role === 'user').pop() : null;
      if (lastUser && lastUser.key.indexOf('api:') !== 0) scheduleApiRefetch();
    }

    // 时间线归属：页面上有日期分隔条就按它分组，没有就退回时间戳里的「月/日」
    const seps = daySeps();
    for (const it of all) {
      // 先看页面上有没有日期分隔条；那条缺失（还没渲染 / 被虚拟列表卸载）时，
      // 退一步用这条消息自己的 <time datetime>，不要整条留空
      const bySep = seps.length ? dayLabelFor(it.el, seps) : '';
      it.day = fmtDay(bySep || dayFromTime(it.time));
    }

    // 并入档案：本轮看到的更新，没看到的保留（说明被虚拟列表卸载了）
    const batchKeys = all.map((i) => i.key);
    const inBatch = new Set(batchKeys);
    for (const it of all) {
      const prev = archive.get(it.key);
      if (prev) {
        prev.raw = it.raw;
        prev.text = it.text;
        if (it.time) prev.time = it.time;
        if (it.day) prev.day = it.day;
        prev.el = it.el;
        if (it.idx != null) prev.idx = it.idx;
        prev.ratio = ratioOf(it.el);
        prev.gone = false;
      } else {
        it.ratio = ratioOf(it.el);
        it.gone = false;
        archive.set(it.key, it);
      }
    }
    for (const [k, v] of archive) {
      if (inBatch.has(k)) continue;
      v.gone = !(v.el && v.el.isConnected);
    }

    // 顺序校正（三步）：DOM 顺序才是真相。
    // 站点复用 turn 编号、或同一句话被重新发送时，档案里那条会赖在老位置不动，
    // 表现就是「刚问的问题显示在目录中间」—— 必须按眼下看到的顺序修回来。
    const scAny = all.length ? all[0].el : null;
    const scNow = scAny ? findScroller(scAny) : null;
    const atTop = !scNow || scNow.scrollTop <= 4;
    const atTail = !!scNow && scNow.scrollTop + scNow.clientHeight >= scNow.scrollHeight - 8;
    mergeBatchOrder(batchKeys, atTop);
    fixBatchOrder(batchKeys);
    fixTailOrder(batchKeys, atTail);

    items = order.map((k) => archive.get(k)).filter(Boolean);

    // 日期继承：虚拟列表会把日期分隔条一起卸载，那几条就会「没日期」，
    // 按目录顺序沿用上一条已知日期，时间线才不会被切成碎块
    let carryDay = '';
    for (const it of items) {
      if (it.day) carryDay = it.day;
      else if (carryDay) it.day = carryDay;
    }

    // 日期标签在时间线上只会往前走。同一个标签「死灰复燃」（今天 → 1/2 → 今天），
    // 中间那段就是误识别，并回前一段，免得同一天被切成三块
    fixDays(items);

    // 结构一致性：开头那几条更早的消息，它们的日期分隔条往往还没渲染出来。
    // 让它们散在组外面，面板就成了「几条散条目 + 几个组头」，一眼看着就是乱的
    const firstDay = items.findIndex((i) => i.day);
    if (firstDay > 0) {
      const label = earlierLabel();
      for (let i = 0; i < firstDay; i += 1) items[i].day = label;
    }

    // 重新编号：DOM 序号在虚拟列表下不可靠，改成按合并后的顺序数第几次提问
    let q = 0;
    items.forEach((it, i) => {
      if (it.role === 'user') q += 1;
      it.q = q || 1;
      it.pos = i;
    });

    // 签名里只在「答」打开时纳入回答长度 —— 这样流式回答时列表能跟着更新；
    // 没开「答」时不纳入，避免回答增长引起无谓的列表重建
    const sig = items
      .map(
        (i) =>
          i.key +
          '|' +
          (i.day || '') +
          '|' +
          (i.role === 'user' ? i.text.slice(0, 40) : showAssistant ? i.raw.length : '')
      )
      .join('~');

    app.dataset.has = items.some((i) => i.role === 'user') ? '1' : '0';

    // quiet：全量补扫过程中的静默采集，只并入档案、不重绘列表，
    // 免得几十次扫描把面板刷得直跳
    if (!quiet) {
      if (sig !== lastSignature) {
        lastSignature = sig;
        render();
      } else {
        $count.textContent = String(items.filter((i) => i.role === 'user').length);
      }
    } else if (sig !== lastSignature && Date.now() - lastQuietRender > 700) {
      // 补扫途中节流刷新：让用户看到目录一条条长出来，而不是干等半分钟
      lastQuietRender = Date.now();
      lastSignature = sig;
      render();
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

    // 虚拟列表：目录里出现序号缺口（中间几轮被卸载了），补一次全量扫描
    if (!quiet) {
      saveArchive();
      maybeSweep();
    }
    return items;
  }

  // 已挂载条目在滚动容器里占的纵向范围 —— 判断「上下还有没有没挂载的内容」
  function coverage(sc) {
    const view = sc.clientHeight || 400;
    const srect = sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0 };
    let firstTop = Infinity;
    let lastBottom = -Infinity;
    let covered = 0;
    let mounted = 0;
    for (const it of items) {
      if (!it.el || !it.el.isConnected) continue;
      const r = it.el.getBoundingClientRect();
      if (r.height <= 0) continue;
      const t = r.top - srect.top + (sc.scrollTop || 0);
      if (t < firstTop) firstTop = t;
      if (t + r.height > lastBottom) lastBottom = t + r.height;
      covered += r.height;
      mounted += 1;
    }
    const idx = archiveIndices();
    return {
      view,
      scrollHeight: sc.scrollHeight || 0,
      covered,
      mounted,
      firstTop,
      lastBottom,
      holes: idx ? idx.holes : []
    };
  }

  // 还有没挂载的内容吗？上下留白超过 48px、或序号有洞，都算没收全
  function stillIncomplete(c) {
    if (!c) return true;
    if (c.holes.length) return true;
    if (!isFinite(c.firstTop) || !isFinite(c.lastBottom)) return true;
    if (c.scrollHeight <= 0) return false;
    return c.firstTop > 48 || c.lastBottom < c.scrollHeight - 48;
  }

  // 判断「现在看到的只是整段对话的一小截」：
  // 已渲染条目的高度加起来，远小于容器总高 → 剩下的都被虚拟列表卸载了。
  function maybeSweep() {
    if (sweeping || sweptOnce) return;
    // 已经直接读到整段对话了，不需要再滚页面
    if (apiThread) return;
    // 快速通道还在路上就再等等，别先滚一遍白折腾
    if (apiPending()) {
      maybeApiLoad();
      return;
    }
    if (Date.now() < sweepBlockedUntil || Date.now() < sweepNextAt) return;
    if (document.hidden) return;
    const anyEl = (items.find((i) => i.el && i.el.isConnected) || {}).el;
    if (!anyEl) return;

    // ① 硬信号：轮次序号中间有洞，说明中间几轮压根没进过 DOM
    //    （长回答很占高度时，覆盖率可能「看起来够」，只靠 ② 会漏掉这种情况）
    const idx = archiveIndices();
    if (idx && idx.holes.length) {
      scheduleSweep();
      return;
    }

    const sc = findScroller(anyEl);
    if (!sc) return;
    const c = coverage(sc);

    // 一共就一两屏的对话不会有虚拟列表，别白滚一趟
    if (c.scrollHeight < c.view * 2) return;

    // ② 位置信号（最可靠）：已挂载条目没铺满容器，上面或下面还留着高度
    if (stillIncomplete(c)) {
      scheduleSweep();
      return;
    }

    // ③ 兜底：已渲染高度远小于容器总高
    if (c.scrollHeight < c.view * 2.5) return;
    if (c.covered * 1.6 < c.scrollHeight) scheduleSweep();
  }

  function scheduleSweep(delay) {
    if (sweepTimer || sweeping) return;
    sweepTimer = setTimeout(() => {
      sweepTimer = null;
      sweep();
    }, delay || 600);
  }

  // —— 补扫（sweep） ——
  // 1) 逐个试候选滚动容器：不同站点「真正在滚的那个」不一定是最近的祖先
  // 2) 每一步都等 DOM 安静再采，站点渲染慢于我们的步进时不会漏
  // 3) 扫完检查「序号缺口」，还有洞就换更细的步长再来一遍
  // 4) 结果按会话存进 sessionStorage，刷新后立刻就是完整目录

  // 等 DOM 安静下来（最多 maxMs）：React 重渲染、图片撑高、异步补历史都在这里等
  function settleQuiet(maxMs) {
    return new Promise((resolve) => {
      let done = false;
      let quietTimer = null;
      let hardTimer = null;
      const obs = new MutationObserver(() => {
        if (quietTimer) clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, 40);
      });
      function finish() {
        if (done) return;
        done = true;
        if (quietTimer) clearTimeout(quietTimer);
        if (hardTimer) clearTimeout(hardTimer);
        try {
          obs.disconnect();
        } catch (e) {
          /* ignore */
        }
        resolve();
      }
      try {
        obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      } catch (e) {
        /* ignore */
      }
      quietTimer = setTimeout(finish, 40);
      hardTimer = setTimeout(finish, maxMs || 400);
    });
  }

  // 候选滚动容器：从内往外的可滚祖先，最后补上文档本身
  function scrollerCandidates(node) {
    const out = [];
    let el = node && node.nodeType === 1 ? node : node && node.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      let cs = null;
      try {
        cs = getComputedStyle(el);
      } catch (e) {
        cs = null;
      }
      const oy = cs && cs.overflowY;
      if (
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        el.scrollHeight > el.clientHeight + 24
      ) {
        out.push(el);
      }
      el = el.parentElement;
    }
    const se = document.scrollingElement || document.documentElement;
    if (se && se.scrollHeight > se.clientHeight + 24) out.push(se);
    return out;
  }

  // 已收集条目的序号范围与缺口：缺口 = 区间内没抓到的轮次
  function archiveIndices() {
    const known = new Set();
    let min = Infinity;
    let max = -Infinity;
    for (const it of archive.values()) {
      if (it.idx == null) continue;
      known.add(it.idx);
      if (it.idx < min) min = it.idx;
      if (it.idx > max) max = it.idx;
    }
    if (!known.size) return null;
    const holes = [];
    for (let i = min; i <= max; i += 1) if (!known.has(i)) holes.push(i);
    return { known, min, max, holes };
  }

  // 当前挂载了哪些条目（数量 + 第一条的 key）：
  // 用来判断「滚动之后站点到底有没有重新渲染」—— 没变就是还没渲出来
  function mountedSig() {
    let n = 0;
    let firstKey = '';
    for (const it of items) {
      if (!it.el || !it.el.isConnected) continue;
      if (!n) firstKey = it.key;
      n += 1;
    }
    return n + '|' + firstKey;
  }

  // 在指定容器上跑一遍：滚一屏 → 等稳定 → 采一次
  // startY > 0 表示「上一趟没扫完，从这里接着走」（长对话一趟 12s 走不完）
  async function sweepWith(sc, stepRatio, maxMs, startY) {
    const before = archive.size;
    const view = sc.clientHeight || 400;
    const res = { grew: 0, moved: 0, ok: false, done: false, endY: 0, nextY: 0 };
    if (sc.scrollHeight < view * 1.5) {
      res.done = true;
      return res;
    }

    const start = sc.scrollTop;
    const prevBehavior = sc.style.scrollBehavior;
    sc.style.scrollBehavior = 'auto';
    const t0 = Date.now();
    const seenPos = new Set();
    const maxStart = Math.max(0, sc.scrollHeight - view);
    let y = Math.max(0, Math.min(maxStart, Math.round(startY || 0)));
    let reachedEnd = false;
    let prevSig = mountedSig();
    try {
      const step = Math.max(120, Math.floor(view * stepRatio));
      let guard = 0;
      while (guard < 500) {
        guard += 1;
        sc.scrollTop = y;
        seenPos.add(Math.round(sc.scrollTop));
        if (y === 0) {
          // 顶部常常要等站点异步补更早的历史：只要还在变高就继续等
          let prevH = sc.scrollHeight;
          for (let k = 0; k < 6; k += 1) {
            await settleQuiet(700);
            if (sc.scrollHeight === prevH) break;
            prevH = sc.scrollHeight;
          }
        } else {
          await settleQuiet(420);
        }
        scan(true, true);
        // 站点渲染常常比滚动慢半拍：位置动了但一条新消息都没挂上，
        // 说明还没渲出来（顶部最容易这样漏），再等一轮。最多等两轮。
        let sig = mountedSig();
        for (let r = 0; r < 2 && sig === prevSig; r += 1) {
          await settleQuiet(450);
          scan(true, true);
          sig = mountedSig();
        }
        prevSig = sig;
        if (sweepAbort) break;
        const maxTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
        if (y >= maxTop) {
          reachedEnd = true;
          break;
        }
        if (Date.now() - t0 > maxMs) break;
        y = Math.min(maxTop, y + step);
      }
      if (!sweepAbort) {
        sc.scrollTop = sc.scrollHeight;
        seenPos.add(Math.round(sc.scrollTop));
        await settleQuiet(600);
        scan(true, true);
      }
    } catch (e) {
      /* 页面切换 / 节点被删都可能抛，忽略 */
    } finally {
      // 记下「走到哪了」：没扫完的话下一趟从这里接着走
      try {
        res.endY = Math.round(sc.scrollTop);
      } catch (e) {
        res.endY = y;
      }
      sc.style.scrollBehavior = prevBehavior;
      try {
        sc.scrollTop = start;
      } catch (e) {
        /* ignore */
      }
      await raf();
      await settleQuiet(250);
    }
    res.grew = archive.size - before;
    res.moved = seenPos.size;
    // 只有「位置真的变过」才算这个容器在滚；否则它只是看着像滚动容器
    res.ok = res.moved >= 3;
    // done = 真的滚到了底（预算用光 / 被用户打断都算没走完）
    res.done = !sweepAbort && reachedEnd;
    // nextY = 没扫完时该从哪接着扫（注意不是最后的「贴底一访」，那只是收尾）
    res.nextY = res.done ? 0 : y;
    return res;
  }

  // 按「序号比例」回访缺口：中间某几轮没采到时，逐个洞跳过去补。
  // 单个洞补不到不立刻放弃，连续三次失败才收手。
  async function fillHoles(sc) {
    const view = sc.clientHeight || 400;
    const step = Math.max(120, Math.floor(view * 0.45));
    let fails = 0;
    let attempts = 0;
    while (attempts < 24 && fails < 3) {
      const idx = archiveIndices();
      if (!idx || !idx.holes.length) return;
      const maxTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
      if (!maxTop) return;
      const hole = idx.holes[0];
      const span = Math.max(1, idx.max - idx.min);
      const base = Math.round(((hole - idx.min) / span) * maxTop);
      let ok = false;
      for (let d = -2; d <= 2 && !ok; d += 1) {
        attempts += 1;
        sc.scrollTop = Math.max(0, Math.min(maxTop, base + d * step));
        await settleQuiet(420);
        scan(true, true);
        const now = archiveIndices();
        if (!now || now.known.has(hole)) ok = true;
      }
      if (ok) fails = 0;
      else fails += 1;
    }
  }

  async function sweep() {
    if (sweeping) return;
    const anyEl = (items.find((i) => i.el && i.el.isConnected) || {}).el;
    if (!anyEl) return;

    const cands = scrollerCandidates(anyEl).slice(0, 4);
    if (!cands.length) {
      sweptOnce = true;
      return;
    }
    // 上一趟没走完：同一个容器还在，就接着它的位置往下走
    const resume = sweepResume && sweepResume.sc && sweepResume.sc.isConnected ? sweepResume : null;

    sweeping = true;
    sweepAbort = false;
    sweepRound += 1;
    // 补扫期间页面自己在滚，别让滚动跟随把高亮乱改
    suppressSpyUntil = Date.now() + 30000;
    const cancel = () => {
      sweepAbort = true;
    };
    window.addEventListener('wheel', cancel, { passive: true, once: true });
    window.addEventListener('touchstart', cancel, { passive: true, once: true });
    window.addEventListener('keydown', cancel, { once: true });

    let worked = null;
    let unfinished = null; // { sc, y } 预算用光时停在哪 → 下一趟接着走
    let passDone = false; // 这一趟有没有真的滚到底
    const tried = [];
    try {
      // 续扫优先：长对话一趟 14s 走不完，接着上次停下的位置继续，别每次都从头来
      if (resume && cands.indexOf(resume.sc) >= 0) {
        const r = await sweepWith(resume.sc, 0.7, 14000, resume.y);
        tried.push({
          t: String(resume.sc.tagName || '') + '(resume)',
          from: resume.y,
          sh: resume.sc.scrollHeight,
          ch: resume.sc.clientHeight,
          moved: r.moved,
          grew: r.grew,
          done: r.done
        });
        // 续扫用的是同一个已验证过的容器，位置动过就算数
        if (r.moved >= 1) {
          worked = resume.sc;
          passDone = r.done;
        }
        if (r.moved >= 1 && !r.done) unfinished = { sc: resume.sc, y: r.nextY };
      }

      // 逐个候选试：只有「位置真的动过」的容器才可能把内容带出来
      if (!worked && !sweepAbort) {
        let best = null;
        let bestGrew = -1;
        let bestRes = null;
        for (const sc of cands) {
          if (sweepAbort) break;
          const r = await sweepWith(sc, 0.7, 14000);
          tried.push({
            t: String(sc.tagName || ''),
            sh: sc.scrollHeight,
            ch: sc.clientHeight,
            moved: r.moved,
            grew: r.grew,
            done: r.done
          });
          if ((r.moved >= 3 || (r.moved >= 1 && r.done)) && r.grew > bestGrew) {
            best = sc;
            bestGrew = r.grew;
            bestRes = r;
          }
          if ((r.moved >= 3 || (r.moved >= 1 && r.done)) && r.grew >= 2) {
            best = sc;
            bestRes = r;
            break;
          }
        }
        worked = best;
        if (worked && bestRes) {
          passDone = bestRes.done;
          if (!bestRes.done) unfinished = { sc: worked, y: bestRes.nextY };
        }
      }

      // 还有缺口（渲染慢 / 步进太大）：换细步长再走一遍，再逐洞回访
      const idx = archiveIndices();
      if (worked && idx && idx.holes.length && !sweepAbort && !unfinished) {
        const r = await sweepWith(worked, 0.35, 12000);
        if (r.moved >= 3 && r.done) passDone = true;
        if (r.moved >= 3 && !r.done) unfinished = { sc: worked, y: r.nextY };
        if (!unfinished) await fillHoles(worked);
      }
    } catch (e) {
      /* ignore */
    } finally {
      const aborted = sweepAbort;
      sweepAbort = false;
      await raf();
      scan(true);
      suppressSpyUntil = Date.now() + 400;
      sweeping = false;
      if (aborted) sweepBlockedUntil = Date.now() + 20000;

      // 「收全了没有」不能看位置：补扫完会把页面滚回原位（长对话必然停在底部），
      // 那时已挂载的条目本来就只盖住末尾，按位置判断永远是「没全」。
      // 真正的判据是：从顶部开始的一趟确实走到了底（中途没跳过），且序号没有洞。
      if (worked && !resume) sweepCover.fromTop = true;
      if (worked && passDone) sweepCover.done = true;
      const holeCount = (archiveIndices() || { holes: [] }).holes.length;
      // 只有「确实漏了」才提示：序号有洞，或者从顶扫到底中途被打断
      const gaps = holeCount > 0 || (sweepCover.fromTop && !sweepCover.done);
      const canRetryHole = holeCount > 0 && sweepRound < 3;
      const carryOn =
        !aborted &&
        !!worked &&
        (!!unfinished || canRetryHole) &&
        sweepRound < SWEEP_MAX_ROUNDS;
      if (carryOn) {
        sweptOnce = false;
        sweepResume = unfinished || null;
        sweepNextAt = Date.now() + 900;
        // 自己排下一趟：补扫结束后页面是静止的，没人会再来触发 maybeSweep
        scheduleSweep(1200);
      } else {
        sweptOnce = true;
        sweepResume = null;
        sweepNextAt = 0;
        if (!gaps) {
          sweepRound = 0; // 收全了，下次改动可以从头数
          sweepCover.fromTop = false;
          sweepCover.done = false;
        }
      }

      saveArchive(true);
      reportGaps(gaps, carryOn);
      writeDiag({
        aborted,
        tried,
        round: sweepRound,
        carryOn,
        fromTop: sweepCover.fromTop,
        reachedEnd: sweepCover.done,
        holes: holeCount,
        resumeAt: sweepResume ? sweepResume.y : null
      });
    }
  }

  // 本地诊断：把「找到多少 / 序号范围 / 候选容器」写进 chrome.storage.local，
  // 排查时不用让用户开 DevTools
  function writeDiag(extra) {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
      const idx = archiveIndices();
      const anyEl = (items.find((i) => i.el && i.el.isConnected) || {}).el;
      const cands = (anyEl ? scrollerCandidates(anyEl) : []).slice(0, 4).map((sc) => ({
        tag: String(sc.tagName || ''),
        cls: String(sc.className || '').slice(0, 48),
        sh: sc.scrollHeight,
        ch: sc.clientHeight
      }));
      chrome.storage.local.set({
        diag: {
          at: Date.now(),
          href: location.href,
          items: items.length,
          users: items.filter((i) => i.role === 'user').length,
          range: idx ? [idx.min, idx.max, idx.holes.length] : null,
          cands,
          extra: extra || null
        }
      });
    } catch (e) {
      /* ignore */
    }
  }

  // 扫完自查：还有没捞到的就把「找到几条」说出来，不装作成功。
  // quiet=true 表示「还在接着扫」，这时先别打扰用户。
  function reportGaps(gaps, quiet) {
    if (quiet || gaps === false) return;
    const idx = archiveIndices();
    const found = archive.size;
    if (idx && idx.holes.length) {
      const total = idx.max - idx.min + 1;
      toast(`找到 ${found}/${total} 条，还有 ${idx.holes.length} 条没加载出来`);
      return;
    }
    toast(`目录收了 ${found} 条，页面可能还有没加载出来的内容`);
  }

  /* —— 目录缓存：同一个标签页里刷新不用重扫 —— */
  function archiveKey() {
    return 'co:archive:' + location.pathname;
  }
  let saveTimer = null;

  function saveArchive(now) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (now) {
      writeArchive();
      return;
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      writeArchive();
    }, 500);
  }

  function writeArchive() {
    {
      try {
        if (!items.length || items.length > 600) return;
        const rows = items.map((it) => ({
          k: it.key,
          r: it.role,
          t: (it.text || '').slice(0, 400),
          w: (it.raw || '').slice(0, 2000),
          m: it.time || '',
          d: it.day || '',
          i: it.idx == null ? null : it.idx,
          a: Math.round((it.ratio || 0) * 1e4) / 1e4
        }));
        sessionStorage.setItem(archiveKey(), JSON.stringify({ u: location.href, rows }));
      } catch (e) {
        /* 超限就算了，不影响主流程 */
      }
    }
  }

  function loadArchive() {
    let data = null;
    try {
      const raw = sessionStorage.getItem(archiveKey());
      if (!raw) return false;
      data = JSON.parse(raw);
    } catch (e) {
      return false;
    }
    if (!data || data.u !== location.href || !Array.isArray(data.rows) || !data.rows.length) return false;
    for (const r of data.rows) {
      if (!r || !r.k || archive.has(r.k)) continue;
      archive.set(r.k, {
        key: r.k,
        role: r.r === 'assistant' ? 'assistant' : 'user',
        text: r.t || '',
        raw: r.w || '',
        time: r.m || '',
        day: r.d || '',
        idx: r.i == null ? null : r.i,
        ratio: r.a || 0,
        el: null,
        gone: true,
        q: 1,
        pos: 0
      });
      order.push(r.k);
    }
    // 缓存只保证「目录不是空的」，不代表收全了：
    // 上次可能只扫到一半就刷新了。所以这里不能锁死补扫，
    // 交给位置信号决定（当前 DOM 没铺满整段高度就还得补一趟）。
    sweptOnce = false;
    return order.length > 0;
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

  /* —— 时间分组的折叠状态：按会话存 sessionStorage，刷新后还在 —— */
  function foldKey() {
    return 'co:fold:' + location.pathname;
  }
  let foldAutoDone = false;

  function loadFolds() {
    if (foldLoadedFor === location.pathname) return;
    foldLoadedFor = location.pathname;
    foldAutoDone = false;
    foldedDays = new Set();
    try {
      const raw = sessionStorage.getItem(foldKey());
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          arr.forEach((d) => {
            if (typeof d === 'string' && d) foldedDays.add(d);
          });
        }
      }
    } catch (e) {
      /* 读不到就当没折叠 */
    }
  }

  function saveFolds() {
    try {
      sessionStorage.setItem(foldKey(), JSON.stringify(Array.from(foldedDays)));
    } catch (e) {
      /* 存不下不影响使用 */
    }
  }

  // 折叠 / 展开一组：只改这一组的 DOM，不整表重绘（滚动位置不会跳）
  function toggleFold(label) {
    if (!label) return;
    // 现在是展开的 → 这次点就收起；已经在折叠集合里 → 这次点就展开
    const fold = !foldedDays.has(label);
    if (fold) foldedDays.add(label);
    else foldedDays.delete(label);
    saveFolds();
    const grp = Array.from($list.querySelectorAll('.grp')).find((g) => g.dataset.day === label);
    if (!grp) return;
    grp.classList.toggle('folded', fold);
    const head = grp.querySelector('.grphead');
    if (head) head.setAttribute('aria-expanded', String(!fold));
    updateFoldBar(lastGroups);
  }

  // 把可见条目按日期切成时间线分组（文档顺序就是时间顺序）
  function buildGroups(list) {
    const groups = [];
    let cur = null;
    for (const it of list) {
      const label = it.day || '';
      if (!cur || cur.label !== label) {
        cur = { label, items: [], rounds: 0, lastQ: '', qFrom: 0, qTo: 0 };
        groups.push(cur);
      }
      cur.items.push(it);
      if (it.role === 'user') {
        cur.rounds += 1;
        cur.lastQ = it.text; // 折叠时用「这一组最后一问」当摘要
        if (!cur.qFrom) cur.qFrom = it.q;
        cur.qTo = it.q;
      }
    }
    return groups;
  }

  // 提问里常混着 LaTeX 和反引号（用户直接把题目贴进来），原样显示就是一堆 \frac、\(、
  // 在 216px 的窄面板里尤其占地方。只做最小清洗，把能读的部分留下
  function prettyText(s) {
    const src = String(s || '');
    if (!/[\\$`]/.test(src)) return src;
    const t = src
      .replace(/\\[dt]?frac\s*\{([^{}]{1,14})\}\s*\{([^{}]{1,14})\}/g, '$1/$2')
      .replace(/\\[dt]?frac\s*(\d)\s*(\d)/g, '$1/$2')
      .replace(/\\[()[\]]/g, '')
      .replace(/\\[,;:! ]/g, ' ')
      .replace(/\\[a-zA-Z]+\s*/g, '')
      .replace(/[$`]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return t || src;
  }

  // 折叠摘要：去掉「昨天」「第二问：」这类前缀，只留问题本身
  // （组头已经写了日期，摘要里再来一遍「昨天」很啰嗦）
  function peekText(q, label) {
    let t = prettyText(String(q || '')).replace(/\s+/g, ' ').trim();
    if (label && t.indexOf(label) === 0) {
      const rest = t.slice(label.length).replace(/^[\s:：·,，.。\-—]+/, '');
      if (rest) t = rest;
    }
    t = t.replace(/^第\s*[0-9一二三四五六七八九十百零两]+\s*(问|个问题|条|轮)?\s*[:：.、]?\s*/, '');
    t = t.replace(/^(Q|q|问)\s*\d+\s*[:：.、]?\s*/, '');
    return t || String(q || '').trim();
  }

  // —— 分组工具条：全部展开 / 全部收起 ——
  let lastGroups = [];

  function updateFoldBar(groups) {
    const labeled = groups.filter((g) => g.label);
    if (labeled.length < 2) {
      $gbar.hidden = true;
      return;
    }
    const rounds = groups.reduce((n, g) => n + g.rounds, 0);
    // 有「更早」这种占位组时不能说「N 天」，改成中性的「N 段」
    const unit = labeled.some((g) => g.label === earlierLabel()) ? '段' : '天';
    $gbar.hidden = false;
    $gsum.textContent = query
      ? `${labeled.length} ${unit}有命中 · ${rounds} 轮`
      : `${labeled.length} ${unit} · ${rounds} 轮`;
    // 搜索时所有分组都是强制展开的，「全部收起」点了也看不见效果，先藏起来
    $btnFoldAll.hidden = !!query;
    const allFolded = labeled.every((g) => foldedDays.has(g.label));
    $btnFoldAll.dataset.mode = allFolded ? 'open' : 'fold';
    $btnFoldAll.textContent = allFolded ? '全部展开' : '全部收起';
    $btnFoldAll.setAttribute('aria-label', allFolded ? '展开所有分组' : '收起所有分组');
  }

  function setAllFolds(fold) {
    lastGroups
      .filter((g) => g.label)
      .forEach((g) => {
        if (fold) foldedDays.add(g.label);
        else foldedDays.delete(g.label);
      });
    saveFolds();
    render();
  }

  function itemHtml(it) {
    const isUser = it.role === 'user';
    const idx = isUser ? String(it.q) : '答';
    // 组头已经写了日期，条目上只留时分
    const meta = String(it.time || '').replace(/^\d{1,2}\/\d{1,2}\s*/, '');
    const disp = prettyText(it.text);
    return `<li class="item${isUser ? ' user' : ' asst'}${it.key === activeKey ? ' active' : ''}" data-key="${esc(
      it.key
    )}" title="${esc(disp.slice(0, 300))}" tabindex="0" role="button">
      <span class="idx">${esc(idx)}</span>
      <span class="body">
        <span class="txt">${highlightText(disp, query)}</span>
        ${meta ? `<span class="meta">${esc(meta)}</span>` : ''}
      </span>
    </li>`;
  }

  function render() {
    const list = visibleItems();
    const userTotal = items.filter((i) => i.role === 'user').length;
    const userShown = list.filter((i) => i.role === 'user').length;
    $count.textContent = query ? `${userShown}/${userTotal}` : String(userTotal);

    const keepScroll = $list.scrollTop;
    // 原本就贴在列表底部（在看最新几条）的话，渲染完继续贴在底部，
    // 新问出来的那一句才不会「长在看不见的地方」
    const keepBottom = $list.scrollHeight - keepScroll - $list.clientHeight < 24;

    if (!list.length) {
      $list.innerHTML = `<li class="empty">${
        items.length
          ? '没有匹配的内容'
          : '没识别到对话<br>按 Alt+Q 可打开设置，<br>在下方填「提问」的 CSS 选择器'
      }</li>`;
      return;
    }

    loadFolds();
    const groups = buildGroups(list);

    // 只有「条目真的很多」才先把旧的收起来，只留最近一组展开。
    // 原来按「组数 > 3」判断，十几条的小对话也会被折成几个空壳组头，
    // 看着就像坏了 —— 现在按条目数判断，几十条以内一律全展开
    if (!query && !foldAutoDone && !foldedDays.size && list.length > 40 && groups.length > 2) {
      foldAutoDone = true;
      for (let i = 0; i < groups.length - 1; i += 1) {
        if (groups[i].label) foldedDays.add(groups[i].label);
      }
      saveFolds();
    }

    const html = groups
      .map((g) => {
        const body = g.items.map(itemHtml).join('');
        // 没有任何日期信息时保持原来的平铺列表，不留一个空分组头
        if (!g.label) return body;
        // 搜索时全部展开，否则「命中了却看不见」会让人以为没搜到
        const folded = !query && foldedDays.has(g.label);
        // 范围只放在 tooltip 里：216px 的窄面板上，组头再塞一段文字就挤成一团了
        const range = g.qFrom && g.qTo ? (g.qFrom === g.qTo ? `第 ${g.qFrom} 问` : `第 ${g.qFrom}–${g.qTo} 问`) : '';
        return `<li class="grp${folded ? ' folded' : ''}" data-day="${esc(g.label)}">
          <div class="grphead" role="button" tabindex="0" data-act="fold" data-day="${esc(
            g.label
          )}" aria-expanded="${!folded}" title="${esc(
            `折叠 / 展开「${g.label}」${range ? ' · ' + range : ''}`
          )}">
            <span class="caret">▾</span>
            <span class="glabel">${esc(g.label)}</span>
            <span class="gmeta">${g.rounds ? `${g.rounds} 轮` : `${g.items.length} 条`}</span>
            <span class="gpeek">${esc(peekText(g.lastQ, g.label).slice(0, 120))}</span>
            <span class="gline"></span>
          </div>
          <ul class="grpbody">${body}</ul>
        </li>`;
      })
      .join('');

    $list.innerHTML = html;
    $list.scrollTop = keepBottom ? $list.scrollHeight : keepScroll;
    lastGroups = groups;
    updateFoldBar(groups);
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
    const cur = $list.querySelector('.item.active');
    // 跳到折叠分组里的条目：先把那一组展开，不然点完什么也看不见
    if (cur && scrollInList) {
      const grp = cur.closest('.grp');
      if (grp && grp.classList.contains('folded')) {
        foldedDays.delete(grp.dataset.day);
        saveFolds();
        grp.classList.remove('folded');
        const head = grp.querySelector('.grphead');
        if (head) head.setAttribute('aria-expanded', 'true');
      }
    }
    if (scrollInList && cur) cur.scrollIntoView({ block: 'nearest' });
  }

  function jumpTo(key) {
    const it = archive.get(key) || items.find((i) => i.key === key);
    if (!it) return;
    if (it.el && it.el.isConnected) {
      doJump(it);
      return;
    }
    seekTo(it);
  }

  function doJump(it) {
    if (!it || !it.el || !it.el.isConnected) return;
    suppressSpyUntil = Date.now() + 1000;
    try {
      it.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {
      it.el.scrollIntoView();
    }
    flash(it.el);
    setActive(it.key, true);
  }

  // 目标被虚拟列表卸载了：先按记下的相对位置猜一屏，猜不中就在附近细搜，
  // 再不行从头线性扫一遍。全程临时关掉平滑滚动，避免几十次动画互相打断。
  async function seekTo(it) {
    const anyEl = (items.find((i) => i.el && i.el.isConnected) || {}).el;
    const cands = (anyEl ? scrollerCandidates(anyEl) : []).slice(0, 2);
    if (!cands.length) {
      toast('这条消息当前未渲染，先手动滚动一下再试');
      return;
    }
    try {
      for (const sc of cands) {
        if (await seekIn(sc, it)) return;
      }
      toast('这条消息暂时找不到，滚一下再试');
    } catch (e) {
      toast('跳转失败，请手动滚动到那条消息');
    }
  }

  async function seekIn(sc, it) {
    const prevBehavior = sc.style.scrollBehavior;
    sc.style.scrollBehavior = 'auto';
    suppressSpyUntil = Date.now() + 2500;

    const maxTop = () => Math.max(0, sc.scrollHeight - sc.clientHeight);
    const probe = async (y) => {
      sc.scrollTop = Math.max(0, Math.min(maxTop(), y));
      await raf();
      await sleep(85);
      scan(true, true);
      const cur = archive.get(it.key);
      return cur && cur.el && cur.el.isConnected ? cur : null;
    };

    try {
      const view = sc.clientHeight || 400;
      const step = Math.max(120, Math.floor(view * 0.6));
      let guess = Math.round((it.ratio || 0) * sc.scrollHeight - view * 0.4);
      guess = Math.max(0, Math.min(maxTop(), guess));

      for (let d = 0; d <= 4; d += 1) {
        const offs = d === 0 ? [0] : [-d * step, d * step];
        for (const off of offs) {
          const hit = await probe(guess + off);
          if (hit) {
            sc.style.scrollBehavior = prevBehavior;
            doJump(hit);
            return true;
          }
        }
      }

      // 长对话兜底：从头扫一遍（每屏一次）
      const total = maxTop();
      for (let y = 0; y <= total; y += step) {
        const hit = await probe(y);
        if (hit) {
          sc.style.scrollBehavior = prevBehavior;
          doJump(hit);
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    } finally {
      sc.style.scrollBehavior = prevBehavior;
    }
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
    let curDay = null;
    items.forEach((it) => {
      const day = it.day || '';
      if (day && day !== curDay) {
        curDay = day;
        md += `\n## ${day}\n`;
      }
      const q = `${day ? '###' : '##'} Q${it.q}${it.time ? ` · ${it.time}` : ''}`;
      const a = `${day ? '####' : '###'} A${it.q}${it.time ? ` · ${it.time}` : ''}`;
      if (it.role === 'user') {
        md += `\n---\n\n${q}\n\n${it.raw}\n`;
      } else {
        md += `\n${a}\n\n${it.raw}\n`;
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
        // 手动重扫时连整段对话一起补一遍：被虚拟列表卸载的部分也能捞回来
        sweptOnce = false;
        sweepBlockedUntil = 0;
        sweepRound = 0;
        sweepResume = null;
        sweepNextAt = 0;
        sweepCover.fromTop = false;
        sweepCover.done = false;
        scheduleSweep();
        writeDiag({ phase: 'manual' });
        toast(`已重新扫描：${items.filter((i) => i.role === 'user').length} 个提问`);
      }
      if (act === 'fold') toggleFold(btn.dataset.day);
      // 工具条上那个按钮：当前有展开的就全收起，已经全收起就全展开
      if (act === 'foldAll') setAllFolds(btn.dataset.mode === 'fold');
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

  // 键盘操作：Tab 到某条后 Enter / 空格即可跳转；分组标题上 Enter 折叠/展开；
  // ↑↓ 在可见条目之间移动（长列表不用一直摸鼠标滚轮）
  $list.addEventListener('keydown', (e) => {
    const head = e.target.closest('.grphead');
    if (head && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      toggleFold(head.dataset.day);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const all = Array.from($list.querySelectorAll('.item, .grphead')).filter(
        (el) => el.offsetParent !== null
      );
      const at = all.indexOf(e.target.closest('.item, .grphead'));
      if (at < 0) return;
      const next = all[at + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!next) return;
      e.preventDefault();
      next.focus();
      return;
    }
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
    loadArchive();
    scan(true);

    Promise.all([
      store.get('pref:collapsed', false),
      store.get('pref:side', 'right'),
      store.get('pref:showAssistant', true),
      store.get(`sel:${HOSTKEY}`, null),
      store.get('pref:asstMigrated', false)
    ]).then(([collapsed, s, asst, sel, asstMigrated]) => {
      prefCollapsed = collapsed;
      side = s === 'left' ? 'left' : 'right';
      app.dataset.side = side;
      showAssistant = !!asst;
      // v1.3.0 起回答默认显示：老用户之前点过「答」关掉的 false 只升级一次，
      // 之后仍尊重用户自己的选择（否则升级后根本看不到新功能）
      if (!asstMigrated) {
        store.set('pref:asstMigrated', true);
        if (asst === false) {
          showAssistant = true;
          store.set('pref:showAssistant', true);
        }
      }
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

    setTimeout(() => writeDiag({ phase: 'boot' }), 1500);

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
      archive.clear();
      order = [];
      archiveHref = location.href;
      sweptOnce = false;
      sweepBlockedUntil = 0;
      sweepRound = 0;
      sweepResume = null;
      sweepNextAt = 0;
      sweepCover.fromTop = false;
      sweepCover.done = false;
      activeKey = null;
      setTimeout(loadArchive, 0);
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
