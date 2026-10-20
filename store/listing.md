# Edge Add-ons 上架材料（复制粘贴用）

> Partner Center 提交页面逐项对应。包文件：`_dist/chat-outline-v1.2.0.zip`

## 提交记录

| 项目 | 值 |
| --- | --- |
| 提交时间 | 2026-10-20 |
| 状态 | 正在审阅（官方预计 7 个工作日） |
| 产品 ID | `3f0f4414-be01-4c31-8fb5-8b555a4bc55b` |
| Microsoft Store ID | `0RDCKDGR9FP7` |
| CRX ID | `khaaohojjiococjbikeeiopklokhbjka` |
| 已提交语言 | 英语(美国)，状态「已完成」 |
| 认证说明 | 537 字符，测试人员无需凭据 |
| 商店链接 | 审核通过后可用（形如 `https://microsoftedge.microsoft.com/addons/detail/0RDCKDGR9FP7`） |

## 基本信息

| 项目 | 值 |
| --- | --- |
| 扩展包 | `_dist/chat-outline-v1.2.0.zip`（zip 根目录含 manifest.json） |
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
• 搜索过滤：输入关键词即时筛选，回车直接跳到第一条命中
• AI 回答：可选把回答条目（含时间戳）也列入目录
• 导出 Markdown：一键把整段问答导出为 .md 文件，方便存档、写周报、贴进笔记
• 深浅色自适应：跟随页面主题，面板不刺眼
• 快捷键：Alt+Q 显示 / 收起；收起后是屏幕边缘一个小标签，不占地方

识别能力：内置 ChatGPT、Gemini、Claude 等常用站点的精确适配；对未适配的站点，会自动尝试 30 多种通用标记和「编辑按钮」结构启发式识别；仍不准时可在面板底部手动填写 CSS 选择器（按域名记忆）。

隐私：完全本地运行，没有任何网络请求，不收集、不传输任何数据。开源可查：https://github.com/fq188/chat-outline

## Full description (English, en-US)

Chat Outline adds a floating table of contents to 62 AI chat sites — ChatGPT, Gemini, Claude, Copilot, DeepSeek, Kimi, Doubao and more. Like PDF bookmarks for your conversation: see every question you've asked at a glance and jump to any of them in one click.

Hunting for "that one question" in a long conversation is the biggest time sink. This extension turns the whole thread into a clickable outline:

• Question list: every prompt you sent, numbered 1, 2, 3…, two lines each
• Click to jump: smooth-scrolls to the message and highlights it
• Scroll-spy: the outline follows your reading position automatically
• Search: instant filtering; press Enter to jump to the first match
• AI answers: optionally include assistant replies with timestamps
• Markdown export: save the whole Q&A thread as a .md file for notes or reports
• Auto dark/light theme; Alt+Q toggles the panel; collapses to a slim edge tab

Detection: precise adapters for major sites, plus 30+ universal patterns and a structural heuristic anchored on the "edit" button, so even unsupported sites usually work. If detection misses, you can enter a custom CSS selector in the panel (remembered per domain).

Privacy: 100% local — no network requests, no data collection. Open source: https://github.com/fq188/chat-outline

## 审核备注（Notes for certification）

本扩展无需账号、无付费功能、无后端服务。测试方法：打开 https://chatgpt.com （或 manifest.json 中 matches 列出的任一站点）并进行任意对话，页面右侧会出现「目录」悬浮标签，点击或按 Alt+Q 打开面板，即可看到提问列表；点击条目跳转，点 ⤓ 导出 Markdown。扩展仅申请 storage 权限，用于保存界面偏好；content script 只在 manifest 列出的对话站点注入，不修改页面内容、不读取账号数据。全部识别在本地完成，无网络请求。

## 上架步骤（Partner Center）

1. 用 Microsoft 账号登录 https://partner.microsoft.com/dashboard/microsoftedge/overview （个人开发者免费注册）
2. 「创建新扩展」→ 上传 `_dist/chat-outline-v1.2.0.zip`
3. 「属性」页：类别选 Productivity，隐私政策填上面的 URL，成人内容选「否」
4. 「语言/详细信息」页：按上面文案填中文（可加英文），上传 Logo 和截图
5. 「可用性」页：默认公开发行即可
6. 提交审核，一般 1–7 个工作日出结果，状态会发到注册邮箱

> 首次上架必须在网页上操作；上架成功后在「发布 API」页创建凭据，以后更新版本可用 REST API 自动提交。
