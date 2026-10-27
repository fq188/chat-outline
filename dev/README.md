# 测试脚手架

这里的东西**不参与扩展运行**，只是为了验证识别逻辑和 UI。四个仿真页面覆盖扩展的三级识别路径和边界情况。

## 环境

```bash
npm install
npx playwright install chromium     # 若用 playwright-core，需自备浏览器并设置 BROWSER_PATH
```

## 跑测试

```bash
node test-all.js      # 四场景：站点硬适配 / 编辑按钮启发式 / class 命名 / 无对话页面
node test-narrow.js   # 647×352、1280×620、1600×900 三种窗口下，面板宽度与高度
node test-v12.js      # v1.2 回归：动态新增提问 / 流式回答更新 / SPA 路由 / 启发式缓存失效
node test-v121.js     # v1.2.1 回归：高亮不残留 / 键盘跳转 / 搜索高亮 / 导出降级与 aria
node test-v122.js     # v1.2.2 回归：纯图片提问进目录 / alt 命名 / 图片+文字不叠加 / 图片条目跳转
node test-refresh.js  # v1.2.2 回归：刷新后自动恢复 / 骨架延迟渲染补扫 / 存储回调卡住仍能加载
node test-v123.js     # v1.2.3 回归：虚拟列表全量补扫 / 编号连续 / 滚远后条目不丢 / 点击未渲染条目
node e2e.js           # 用 --load-extension 真实加载扩展，验证 manifest 与注入
```

`test-v122.js` 和 `test-refresh.js` 支持用 `CONTENT_FILE` 环境变量换掉被测的 `content.js`，
用来做反向验证（把旧版本代码跑一遍，确认新加的断言在旧代码上确实会 FAIL）：

```bash
CONTENT_FILE=dev/_old-content.js node dev/test-refresh.js
```

截图会写到 `shots/`（已在 .gitignore 中忽略）。

`e2e.js` 需要真实浏览器支持加载扩展，用 `headless: false` 启动，跑完会自动关闭。

## 仿真页面

| 文件 | 覆盖的识别路径 |
| --- | --- |
| `mock.html` | 仿 ChatGPT 结构，带 `data-message-author-role` → 站点硬适配 |
| `mock-generic.html` | 只有「编辑」按钮、无任何语义属性 → 结构启发式 |
| `mock-universal.html` | 靠 `class="human-message"` 命名 → 通用选择器 |
| `mock-empty.html` | 无对话内容 → 确认不会误弹面板 |
| `mock-image.html` | 纯图片提问 / 图片+文字 / 带文件名 alt → 媒体占位标签 `[图片]`、`[图片：x.png]` |
| `mock-late.html` | 骨架页 1.8s 后才渲染消息 → 退避补扫能否补全 |
| `mock-virtual.html` | 虚拟列表：60 条消息只挂载视口附近 ~20 条 → 全量补扫与未渲染条目跳转 |

每个页面通过 `page.route()` 挂到目标域名下（如 `https://chatgpt.com/**`），这样 `location.hostname` 才能命中 `manifest.json` 里的 matches。
