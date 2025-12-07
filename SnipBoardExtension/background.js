const COLOR_MAP = {
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
};

let selectModeActive = false;

async function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });
}

chrome.action.onClicked.addListener(async () => {
  const tab = await getActiveTab();
  if (!tab) return;

  if (!selectModeActive) {
    selectModeActive = true;
    chrome.action.setBadgeText({ text: "S" });
    chrome.action.setBadgeBackgroundColor({ color: "#3B82F6" });
    chrome.tabs.sendMessage(tab.id, { type: "SNIPBOARD_SELECT_MODE_ON_V2" });
  } else {
    selectModeActive = false;
    chrome.action.setBadgeText({ text: "" });
    chrome.tabs.sendMessage(tab.id, { type: "SNIPBOARD_SELECT_MODE_OFF_AND_SAVE" });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "SNIPBOARD_ICON_UPDATE") return;
  const pct = typeof msg.percentage === "number" ? Math.max(0, Math.min(100, Math.floor(msg.percentage))) : 0;
  const colorKey = msg.color || "green";
  const color = COLOR_MAP[colorKey] || COLOR_MAP.green;
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text: `${pct}` });
  chrome.action.setIcon({
    path: {
      "16": `icons/icon-${colorKey}-16.png`,
      "32": `icons/icon-${colorKey}-32.png`,
      "48": `icons/icon-${colorKey}-48.png`,
      "128": `icons/icon-${colorKey}-128.png`,
    },
  });
  if (sendResponse) sendResponse({ ok: true });
  return true;
});
