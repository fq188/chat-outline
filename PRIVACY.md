# 隐私政策 · Privacy Policy

**生效日期：2026-10-31**

## 中文

「对话目录 · Chat Outline」在你的浏览器里本地运行，不向任何第三方发送数据。

- **不收集、不上报**：扩展没有自己的服务器，不接入任何分析工具、广告或第三方服务，不追踪你的任何行为。
- **唯一的网络请求**：在 ChatGPT 上（`chatgpt.com` / `chat.openai.com`），为了让长对话的目录一次加载完整，扩展会向**当前站点自己的域名**请求这段对话的会话数据（`/backend-api/conversation/<id>`，必要时先读 `/api/auth/session` 取访问令牌）。该请求与页面本身发出的请求完全同源，用的是你当前已登录的身份，不携带任何额外信息，也不会发往其他地方。若接口不可用（未登录、接口变更、超时），扩展会安静地退回纯页面解析，不发任何请求。
- **其他站点**：不使用任何网络请求，只在页面内解析。
- **不读取账号数据**：扩展不读取、不保存你的密码、登录状态或 Cookie 内容。会话令牌只在内存中使用一次，不落盘、不外传。
- **本地存储**：扩展仅使用浏览器自带的 `chrome.storage.local` 保存你的界面偏好（面板开/关、左右侧、是否显示回答）、折叠状态和你手动填写的 CSS 选择器。这些数据只存在你自己的浏览器里，卸载扩展即删除。
- **导出功能**：「导出 Markdown」只在你主动点击时，把当前页面已显示的对话内容保存为本地文件，文件只写到你自己的电脑上。
- **权限最小化**：只申请 `storage`。不申请 `cookies`、`tabs`、`host_permissions` 等可以窥探其他站点或账号的权限。

如有疑问，请在 GitHub 提 issue：<https://github.com/fq188/chat-outline/issues>

## English

**Chat Outline** runs locally in your browser and never sends your data to any third party.

- **No collection, no reporting**: the extension has no backend of its own, embeds no analytics, ads or third-party services, and does not track your behaviour.
- **The one network request**: on ChatGPT (`chatgpt.com` / `chat.openai.com`), so that a long thread fills the outline in one go, the extension asks **the site's own domain** for that conversation's data (`/backend-api/conversation/<id>`, plus `/api/auth/session` when it needs an access token). This is the same origin the page itself talks to, it runs under your existing login, carries no extra information, and goes nowhere else. If the endpoint is unavailable (signed out, changed API, timeout), the extension silently falls back to pure page parsing and makes no request at all.
- **Other sites**: no network requests whatsoever; parsing happens entirely in the page.
- **No account data**: the extension never reads or stores your password, login state or cookie contents. The session token is used once, in memory, and is never persisted or transmitted.
- **Local storage only**: it uses `chrome.storage.local` solely to remember your UI preferences (panel open/closed, side, show-answers toggle), folding state, and any CSS selectors you enter manually. This data stays in your browser and is removed on uninstall.
- **Export**: "Export Markdown" only runs when you click it, saving the currently visible conversation to a local file on your own machine.
- **Minimal permissions**: `storage` only. No `cookies`, `tabs` or `host_permissions` — nothing that could reach other sites or your account.

Questions? Open an issue at <https://github.com/fq188/chat-outline/issues>
