// popup.js robust version with auto-inject + clean error handling

function getActiveTab() {
  return new Promise(resolve => {
    chrome.tabs.query({ lastFocusedWindow: true }, tabs => {
      if (!tabs || !tabs.length) {
        resolve(null);
        return;
      }

      const chatTab = tabs.find(tab => {
        const url = tab.url || "";
        return (
          url.startsWith("https://chat.openai.com/") ||
          url.startsWith("https://chatgpt.com/")
        );
      });

      if (chatTab) {
        resolve(chatTab);
        return;
      }

      const userTab = tabs.find(
        tab => tab.url && !tab.url.startsWith("chrome://")
      );
      resolve(userTab || tabs[0]);
    });
  });
}

const statusLogEl = document.getElementById("statusLog");

function logStatus(message) {
  if (statusLogEl) {
    statusLogEl.textContent = `Status: ${message}`;
  }
}

function sendSelectionRequest(tabId) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "SNIPBOARD_GET_SELECTION" },
      response => {
        const err = chrome.runtime.lastError || null;
        if (err) {
          resolve({ error: err, messages: [] });
          return;
        }
        const messages = response && response.messages ? response.messages : [];
        resolve({ error: null, messages });
      }
    );
  });
}

function ensureContentScript(tabId) {
  return new Promise(resolve => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["content.js"]
      },
      () => {
        const err = chrome.runtime.lastError || null;
        if (err) {
          console.warn("[SnipBoard] content.js inject failed:", err.message);
        }
        resolve();
      }
    );
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isReceiverError(err) {
  return (
    err &&
    err.message &&
    err.message.includes("Receiving end does not exist")
  );
}

async function getSelectedMessages() {
  const tab = await getActiveTab();
  if (!tab) {
    logStatus("no active tab available");
    return { tab: null, messages: [] };
  }

  logStatus("injecting content.js into tab");
  await ensureContentScript(tab.id);
  let { error, messages } = await sendSelectionRequest(tab.id);

  if (isReceiverError(error)) {
    let attempts = 0;
    while (isReceiverError(error) && attempts < 5) {
      const attemptLabel = attempts + 1;
      logStatus(`waiting for popup receiver (attempt ${attemptLabel})`);
      await sleep(120);
      ({ error, messages } = await sendSelectionRequest(tab.id));
      attempts++;
    }
  }

  if (error) {
    logStatus("still could not read selection");
    return { tab, messages: [] };
  }

  logStatus("connected to content.js");
  return { tab, messages };
}

async function updateSelectedCount() {
  const { messages } = await getSelectedMessages();
  const countEl = document.getElementById("selectedCount");
  const btn = document.getElementById("saveBtn");

  const count = messages.length;
  countEl.textContent = String(count);

  if (count === 0) {
    btn.disabled = true;
    btn.textContent = "Waiting...";
    logStatus("waiting for ChatGPT selection...");
  } else {
    btn.disabled = false;
    btn.textContent =
      count === 1 ? "Save 1 message to SnipBoard" : `Save ${count} messages`;
    logStatus(`${count} message${count === 1 ? "" : "s"} ready`);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateSelectedCount();
  const pollId = setInterval(updateSelectedCount, 800);

  window.addEventListener("unload", () => clearInterval(pollId));

  document.getElementById("saveBtn").addEventListener("click", async () => {
    const { tab, messages } = await getSelectedMessages();
    if (!messages.length) return;

    const sectionId = document.getElementById("sectionSelect").value;
    const titleInput = document.getElementById("titleInput").value;
    const tagsInput = document.getElementById("tagsInput").value;

    let title = titleInput && titleInput.trim();
    if (!title && messages.length > 0) {
      const first = messages[0].content || "";
      title = first.split(/\r?\n/)[0].slice(0, 80) || "ChatGPT Snip";
    }

    const tags = tagsInput
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    const payload = {
      sectionId,
      title,
      tags,
      text: messages
        .map(m => `${m.role.toUpperCase()}:\n${m.content}`)
        .join("\n\n"),
      sourceUrl: tab?.url || "",
      sourceTitle: tab?.title || "",
      capturedAt: Date.now()
    };

    const btn = document.getElementById("saveBtn");
    btn.disabled = true;
    btn.textContent = "Saving...";

    try {
      await fetch("http://127.0.0.1:4050/add-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      btn.textContent = "Saved!";
      setTimeout(() => window.close(), 800);
    } catch (err) {
      console.error("[SnipBoard] POST failed:", err);
      btn.disabled = false;
      btn.textContent = "Error";
    }
  });
});
