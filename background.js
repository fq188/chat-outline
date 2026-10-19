// 点击工具栏图标 -> 通知当前标签页的 content script 切换面板
chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'CHAT_OUTLINE_TOGGLE' }, () => {
    if (chrome.runtime.lastError) {
      // 页面未注入（不在支持站点，或扩展重装/更新后旧标签页还没刷新）：
      // 在图标上打个 ↻ 角标提示「刷新页面后可用」，3 秒后自动消掉
      try {
        chrome.action.setBadgeText({ tabId: tab.id, text: '↻' });
        chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#0e8f6f' });
        setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: '' }), 3000);
      } catch (e) {
        /* ignore */
      }
    }
  });
});
