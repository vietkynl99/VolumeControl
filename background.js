const SITES_KEY = 'sites';
const BADGE_COLOR = '#18181b';
const BADGE_COLOR_MUTED = '#e5322a';

function hostnameFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return parsed.hostname;
  } catch (e) {
    return null;
  }
}

function computeBadge(entry) {
  const percent = Math.round((entry && typeof entry.volume === 'number' ? entry.volume : 1) * 100);
  const isSilent = !!(entry && entry.muted) || percent === 0;
  return {
    text: isSilent ? 'X' : percent === 100 ? '' : String(percent),
    color: isSilent ? BADGE_COLOR_MUTED : BADGE_COLOR,
  };
}

function updateBadgeForTab(tabId, url) {
  const hostname = hostnameFromUrl(url);
  if (!hostname) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }
  chrome.storage.sync.get([SITES_KEY], (result) => {
    const entry = (result[SITES_KEY] || {})[hostname];
    const badge = computeBadge(entry);
    chrome.action.setBadgeText({ tabId, text: badge.text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
    if (chrome.action.setBadgeTextColor) {
      chrome.action.setBadgeTextColor({ tabId, color: '#ffffff' });
    }
  });
}

function refreshAllTabs() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id !== undefined && tab.url) {
        updateBadgeForTab(tab.id, tab.url);
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(refreshAllTabs);
chrome.runtime.onStartup.addListener(refreshAllTabs);
refreshAllTabs();

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (tab && tab.url) updateBadgeForTab(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.url || changeInfo.status === 'complete') && tab.url) {
    updateBadgeForTab(tabId, tab.url);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes[SITES_KEY]) {
    refreshAllTabs();
  }
});

// Content scripts (including third-party iframes) ask for the hostname of the
// tab that hosts them, since a cross-origin frame cannot read its own tab's
// top-level URL. `sender.tab` always resolves to the real browser tab.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'GET_TAB_HOSTNAME') {
    sendResponse({ hostname: hostnameFromUrl(sender.tab && sender.tab.url) });
  }
});
