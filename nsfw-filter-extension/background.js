/**
 * NSFW Filter - Background Service Worker
 * Handles installation, settings initialization, and message passing.
 */

// Default settings
const DEFAULT_SETTINGS = {
  nsfw_sensitivity: 'medium',
  nsfw_action: 'blur',
  nsfw_whitelist: [],
  nsfw_blockedKeywords: [],
  nsfw_enabled: true
};

// Initialize on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set(DEFAULT_SETTINGS);
    console.log('[NSFW Filter] Installed with default settings');
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get-settings') {
    chrome.storage.local.get(DEFAULT_SETTINGS, (data) => {
      sendResponse(data);
    });
    return true; // async
  }

  if (message.type === 'save-settings') {
    chrome.storage.local.set(message.settings, () => {
      // Notify all tabs about settings change
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, { type: 'settings-updated' }).catch(() => {});
        });
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.type === 'get-stats') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'get-stats' }, (response) => {
          sendResponse(response || { blocked: 0 });
        });
      } else {
        sendResponse({ blocked: 0 });
      }
    });
    return true;
  }
});
