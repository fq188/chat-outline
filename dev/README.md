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
node e2e.js           # 用 --load-extension 真实加载扩展，验证 manifest 与注入
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

每个页面通过 `page.route()` 挂到目标域名下（如 `https://chatgpt.com/**`），这样 `location.hostname` 才能命中 `manifest.json` 里的 matches。
