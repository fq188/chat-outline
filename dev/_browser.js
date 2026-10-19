/**
 * 测试脚本共用的浏览器加载器。
 * 优先用 playwright（自带浏览器下载），退而用 playwright-core（需自备浏览器）。
 * 也可用环境变量 BROWSER_PATH 指定浏览器可执行文件。
 */
function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch (e) {
    /* 继续尝试 core */
  }
  try {
    return require('playwright-core').chromium;
  } catch (e) {
    /* 落到下面的报错 */
  }
  throw new Error('未找到 playwright，请先执行：cd dev && npm install');
}

function launchOptions() {
  const exe = process.env.BROWSER_PATH || process.env.CHROMIUM_PATH;
  return exe ? { executablePath: exe } : {};
}

module.exports = { loadChromium, launchOptions };
