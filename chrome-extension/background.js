// Service worker — message hub between popup and content scripts

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PROFILE') {
    chrome.storage.local.get(['emploia_profile', 'emploia_token', 'emploia_api_base'], async (data) => {
      if (data.emploia_profile) {
        sendResponse({ ok: true, profile: data.emploia_profile });
        return;
      }
      // Try to fetch from server if token exists
      if (data.emploia_token) {
        try {
          const base = data.emploia_api_base || 'https://emploia.fr';
          const res = await fetch(`${base}/api/profile`, {
            headers: { 'Cookie': `__Host-emploia-token=${data.emploia_token}` },
            credentials: 'include',
          });
          if (res.ok) {
            const profile = await res.json();
            chrome.storage.local.set({ emploia_profile: profile });
            sendResponse({ ok: true, profile });
            return;
          }
        } catch {}
      }
      sendResponse({ ok: false, error: 'no_profile' });
    });
    return true; // async
  }

  if (msg.type === 'SAVE_PROFILE') {
    chrome.storage.local.set({ emploia_profile: msg.profile }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'CLEAR_PROFILE') {
    chrome.storage.local.remove(['emploia_profile', 'emploia_token'], () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'AUTOFILL_DONE') {
    // Notify popup that autofill was successful
    chrome.action.setBadgeText({ text: '✓', tabId: sender.tab?.id });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId: sender.tab?.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: sender.tab?.id }), 3000);
  }
});

// Clear badge on tab navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ text: '', tabId });
  }
});
