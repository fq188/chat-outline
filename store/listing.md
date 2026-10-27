# Edge Add-ons 上架材料（复制粘贴用）

> Partner Center 提交页面逐项对应。当前包文件：`_dist/chat-outline-v1.2.1.zip`

## 提交记录

| 版本 | 包文件 | 提交时间 | 状态 |
| --- | --- | --- | --- |
| 1.2.0 | `chat-outline-v1.2.0.zip` | 2026-10-20 | **已上架 Live**（2026-10-24 复核公开页返回 200） |
| 1.2.1 | `chat-outline-v1.2.1.zip` | 2026-10-24 | 草稿就绪，待发布（见下） |

### 1.2.1 更新提交进度（2026-10-24）

| 环节 | 状态 |
| --- | --- |
| 上传程序包 | 已完成：`chat-outline-v1.2.1.zip`，版本 1.2.1，校验「已完成」，权限 storage |
| 可用性 | 已保存：公用 / 241 个市场（沿用） |
| 属性 | 已保存：高效工作（沿用） |
| 隐私 | 已保存：权限理由、无远程代码（沿用） |
| Store 一览 | 文字无需改动（Edge 清单无「此版本新增内容」字段） |
| 清单截图 | 已替换：4 张图的上传时间为 2026-10-24 23:39Z（清单横幅「尚未修改扩展」已消失） |
| 认证说明 | **待填**：每次提交必填，当前 0/2000 |
| 发布 | **待点**：右上角「发布」 |

> 自动化限制：Edge Partner Center 的会话约 15 分钟过期，且静默续期在自动化浏览器里被拦，写操作会返回「会话已过期」。最后一填一点需在已登录的浏览器里手动完成。

### 替换清单截图（2026-10-24 起待办）

本地 4 张图已是当前代码渲染的结果（`dev/store-shots.js` 现取 `content.js` 重新生成，与仓库内文件逐字节相同），无需重做，只需把商店里的替换掉：

1. **Store 一览 → 编辑详细信息**，滚到「屏幕截图」，对每张点 **删除（垃圾桶）** 清掉旧图
2. 逐张点 **添加图像**，按顺序选：`1-outline.png` → `2-answers.png` → `3-search.png` → `4-auto.png`
3. 每张的「添加图像描述」可留空，也可填：省/问/跳转/自动识别（英文：Outline / Answers / Search / Auto-detect）
4. 点 **保存草稿**，再回「提交」页填认证说明并 **发布**

> 文件位置：`store/screenshots/`，均为 1280×800 PNG（Edge 要求的尺寸之一）。检验新旧：商店缩略图地址里的时间戳是 `10/20/2026`，替换成功后应变成当天日期。

### 账号与标识

| 项目 | 值 |
| --- | --- |
| 产品 ID | `3f0f4414-be01-4c31-8fb5-8b555a4bc55b` |
| Microsoft Store ID | `0RDCKDGR9FP7` |
| CRX ID | `khaaohojjiococjbikeeiopklokhbjka` |
| 已提交语言 | 英语(美国)，状态「已完成」 |
| 认证说明 | 537 字符，测试人员无需凭据 |
| 商店链接 | 审核通过后可用（形如 `https://microsoftedge.microsoft.com/addons/detail/0RDCKDGR9FP7`） |

## 基本信息

| 项目 | 值 |
| --- | --- |
| 扩展包 | `_dist/chat-outline-v1.2.1.zip`（zip 根目录含 manifest.json） |
| 扩展名称 | 对话目录 · Chat Outline（取自 manifest，无需手填） |
| 简短描述 | 取自 manifest description，无需手填 |
| 类别（Category） | 生产力 / Productivity |
| 隐私政策 URL | https://github.com/fq188/chat-outline/blob/main/PRIVACY.md |
| 支持 URL / 网站 | https://github.com/fq188/chat-outline |
| 扩展 Logo | `store/store-logo-300.png`（300×300） |
| 截图（最多 6 张） | `store/screenshots/1-outline.png` `2-answers.png` `3-search.png` `4-auto.png`（均 1280×800） |
| 搜索词（≤7 个） | `对话目录` `ChatGPT` `AI 聊天` `outline` `DeepSeek` `Kimi` `导出 Markdown` |
| 成人内容 | 否 |

## 详细描述（中文，zh-CN）

给 ChatGPT、Gemini、Claude、Copilot、DeepSeek、Kimi、豆包等 62 个 AI 对话网站加一个悬浮目录——像 PDF 书签一样，随时看到这次对话里问过的每一个问题，点一下立即跳转。

长对话里翻找「那个问题到底在哪」是最浪费时间的事。这个扩展把整段对话变成一份可点击的大纲：

• 提问清单：按 1、2、3… 列出本次对话的全部提问，各显示前两行
• 点击跳转：平滑滚动到对应消息，并用描边高亮，一眼定位
• 滚动跟随：你在页面上滚到哪里，目录就自动高亮哪一问
• 搜索过滤：输入关键词即时筛选并高亮命中词，回车直接跳到第一条命中
• AI 回答：可选把回答条目（含时间戳）也列入目录
• 导出 Markdown：一键把整段问答导出为 .md 文件，方便存档、写周报、贴进笔记
• 深浅色自适应：跟随页面主题，面板不刺眼
• 键盘可用：Tab 聚焦条目，Enter / 空格跳转
• 快捷键：Alt+Q 显示 / 收起；收起后是屏幕边缘一个小标签，不占地方

识别能力：内置 ChatGPT、Gemini、Claude 等常用站点的精确适配；对未适配的站点，会自动尝试 30 多种通用标记和「编辑按钮」结构启发式识别；仍不准时可在面板底部手动填写 CSS 选择器（按域名记忆）。

隐私：完全本地运行，没有任何网络请求，不收集、不传输任何数据。开源可查：https://github.com/fq188/chat-outline

## Full description (English, en-US)

Chat Outline adds a floating table of contents to 62 AI chat sites — ChatGPT, Gemini, Claude, Copilot, DeepSeek, Kimi, Doubao and more. Like PDF bookmarks for your conversation: see every question you've asked at a glance and jump to any of them in one click.

Hunting for "that one question" in a long conversation is the biggest time sink. This extension turns the whole thread into a clickable outline:

• Question list: every prompt you sent, numbered 1, 2, 3…, two lines each
• Click to jump: smooth-scrolls to the message and highlights it
• Scroll-spy: the outline follows your reading position automatically
• Search: instant filtering with match highlighting; press Enter to jump to the first match
• AI answers: optionally include assistant replies with timestamps
• Markdown export: save the whole Q&A thread as a .md file for notes or reports
• Auto dark/light theme; keyboard accessible — Tab to an entry, Enter or Space to jump
• Alt+Q toggles the panel; collapses to a slim edge tab

Detection: precise adapters for major sites, plus 30+ universal patterns and a structural heuristic anchored on the "edit" button, so even unsupported sites usually work. If detection misses, you can enter a custom CSS selector in the panel (remembered per domain).

Privacy: 100% local — no network requests, no data collection. Open source: https://github.com/fq188/chat-outline

## 审核备注（Notes for certification）

本扩展无需账号、无付费功能、无后端服务。测试方法：打开 https://chatgpt.com （或 manifest.json 中 matches 列出的任一站点）并进行任意对话，页面右侧会出现「目录」悬浮标签，点击或按 Alt+Q 打开面板，即可看到提问列表；点击条目跳转，点 ⤓ 导出 Markdown。扩展仅申请 storage 权限，用于保存界面偏好；content script 只在 manifest 列出的对话站点注入，不修改页面内容、不读取账号数据。全部识别在本地完成，无网络请求。

## 本次更新内容（Release notes，v1.2.2）

> Partner Center 更新提交页的「此版本的新增内容」字段，按语言分别填写。v1.2.2 上传时会取代排队中的 1.2.1 提交。

**中文（zh-CN）**

修复两个影响使用的问题：只发图片、不打字提问时，这一问原先不会出现在目录里，现在会显示成「[图片]」占位条目（带文件名的显示「[图片：文件名]」，多条图片显示「[图片 ×2]」），视频、语音、附件同理。另外，刷新页面后目录可能一直是空的，需要手动滚动才恢复——原因是目录初始化排在偏好读取之后，而浏览器在某些情况下不会回调读取结果；现在改为先开始识别、再读偏好，并对读取加了超时兜底。针对聊天页面骨架屏较慢、消息晚于首次渲染才出现的情况，新增了从 300 毫秒到 6 秒、约 30 秒的退避补扫，并在页面完全加载和从缓存恢复时各补扫一次，目录会自己补齐。

**English (en-US)**

Two fixes that affected everyday use: a prompt that was only an image (no text) used to be missing from the outline — it now appears as a "[Image]" entry (with a filename when available, e.g. "[Image: shot.png]", and "×2" for multiple images), and the same applies to video, voice and file attachments. Second, the outline could stay empty after a page refresh until you scrolled — initialization was queued behind the preferences read, which the browser does not always call back; detection now starts first and the preferences read has a timeout fallback. For chat pages whose skeleton renders slowly and whose messages appear after the first paint, a backoff re-scan (300 ms up to 6 s, roughly 30 seconds), plus one extra scan on full load and on back-forward cache restore, fills the outline in automatically.

## 本次更新内容（Release notes，v1.2.1）

> Partner Center 更新提交页的「此版本的新增内容」字段，按语言分别填写。

**中文（zh-CN）**

修复两处问题：同一条消息重复跳转、或跳到另一条时，绿色描边可能残留不消失，现在任意时刻只有一圈高亮；下载被浏览器拦截且环境不支持剪贴板时，导出会抛出未捕获异常，现在只做提示，有剪贴板时自动改为复制。体验上，搜索命中的关键词会在目录里高亮（大小写不敏感），目录条目可以用 Tab 聚焦、Enter 或空格跳转，图标按钮与搜索框补齐了无障碍标签。

**English (en-US)**

Two fixes: the green highlight ring could linger after repeated jumps to the same message or when jumping elsewhere — exactly one ring is now shown at a time; and export threw an uncaught error when downloads were blocked and no clipboard was available — it now shows a notice and falls back to copying when possible. Also: search matches are highlighted in the outline (case-insensitive), entries can be focused with Tab and jumped to with Enter or Space, and icon buttons plus the search box now carry accessibility labels.

## 上架步骤（Partner Center）

### 版本更新（v1.2.0 → v1.2.2）

1. 用注册扩展的 Microsoft 账号登录 https://partner.microsoft.com/dashboard/microsoftedge/overview
2. 在扩展列表点「对话目录 · Chat Outline」→「更新」→「包」页上传 `_dist/chat-outline-v1.2.2.zip`
3. 「商店一览」页把上面「本次更新内容」分别填进中文 / 英文语言条目
4. 确认「属性」「可用性」不变，点「发布」提交审核
5. 提交后 `manifest.version` 必须大于线上版本（1.2.2 > 1.2.0，已满足）

> 若旧版本仍在审核中，提交新版本会取代排队中的提交；以最后一次发布的提交为准。
> 1.2.1 的包已上传过但未发布，这次传 1.2.2 会把它整份替换掉，无需先撤销。

### 首次上架（已完成，留档）

1. 用 Microsoft 账号登录 https://partner.microsoft.com/dashboard/microsoftedge/overview （个人开发者免费注册）
2. 「创建新扩展」→ 上传 zip
3. 「属性」页：类别选 Productivity，隐私政策填上面的 URL，成人内容选「否」
4. 「语言/详细信息」页：按上面文案填中文（可加英文），上传 Logo 和截图
5. 「可用性」页：默认公开发行即可
6. 提交审核，一般 1–7 个工作日出结果，状态会发到注册邮箱

> 网页端提交完成后，可在「发布 API」页创建凭据，以后更新版本可用 REST API 自动提交。
