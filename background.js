const CALENDAR_URL = 'https://calendar.google.com/calendar/r/week';
const MSG = { type: 'freeslot:toggle' };

// Toolbar click (or Alt+Shift+O) toggles offer mode on the calendar tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.url || !tab.url.startsWith('https://calendar.google.com/')) {
    chrome.tabs.create({ url: CALENDAR_URL });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, MSG);
  } catch {
    // Tab was open before the extension was installed — inject, then toggle.
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, MSG);
  }
});
