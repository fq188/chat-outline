// 点击工具栏图标 -> 通知当前标签页的 content script 切换面板
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'CHAT_OUTLINE_TOGGLE' }, () => {
    // 页面未注入（比如不在支持站点）时忽略错误
    void chrome.runtime.lastError;
  });
});
