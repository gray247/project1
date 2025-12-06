(function () {
  console.log("[SnipBoard EXT] content.js active");

  const SELECTED_CLASS = "snipboard-selected";
  const MESSAGE_SELECTORS = [
    'article[data-message-id]',
    'article[data-testid^="conversation-turn"]',
    'article[data-turn]',
    'div[data-message-id]',
    'div[data-testid="conversation-turn"]',
    'div[data-testid="message"]',
    'div[data-testid="chat-message"]',
    'div[data-testid="assistant-response"]',
    'div[data-testid="user-response"]',
    'div.user-message-bubble-color',
    'div.assistant-message-bubble-color',
    'div.text-message',
    'div[role="listitem"]'
  ];
  const TEXT_CONTAINER_SELECTORS = [
    '[data-testid="message-text"]',
    '[data-testid="message-content"]',
    '[data-testid="message-body"]',
    ".markdown",
    ".result-streaming",
    ".message-inner",
    ".text-base",
    ".text-message",
    ".user-message-bubble-color",
    ".assistant-message-bubble-color",
    ".prose"
  ];

  function readText(node) {
    if (!node) return "";
    const raw =
      typeof node.innerText === "string"
        ? node.innerText
        : node.textContent || "";
    return raw.trim();
  }

  function injectStyles() {
    if (document.getElementById("snipboard-styles")) return;

    const style = document.createElement("style");
    style.id = "snipboard-styles";
    style.textContent = `
      .snipboard-checkbox {
        position: absolute !important;
        left: -28px !important;
        top: 10px !important;
        z-index: 9999 !important;
      }
      .snipboard-checkbox input {
        width: 18px !important;
        height: 18px !important;
        transform: scale(1.2);
        accent-color: #2563eb;
        cursor: pointer;
      }
      article[data-message-id].${SELECTED_CLASS},
      article[data-testid^="conversation-turn"].${SELECTED_CLASS},
      article[data-turn].${SELECTED_CLASS},
      div[data-message-id].${SELECTED_CLASS},
      div[data-testid="conversation-turn"].${SELECTED_CLASS},
      div[data-testid="message"].${SELECTED_CLASS},
      div[data-testid="chat-message"].${SELECTED_CLASS},
      div[data-testid*="response"].${SELECTED_CLASS},
      div.user-message-bubble-color.${SELECTED_CLASS},
      div.assistant-message-bubble-color.${SELECTED_CLASS},
      div.text-message.${SELECTED_CLASS},
      div[role="listitem"].${SELECTED_CLASS} {
        outline: 2px solid #2563eb;
        background: rgba(37,99,235,0.14);
        border-radius: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  function containsTextContainer(node) {
    return TEXT_CONTAINER_SELECTORS.some(selector => node.querySelector(selector));
  }

  function looksLikeChatMessage(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    const text = readText(node);
    if (!text) return false;
    const testId = node.getAttribute("data-testid") || "";
    if (testId && /message|response|assistant|user/i.test(testId) && containsTextContainer(node)) {
      return true;
    }
    return containsTextContainer(node);
  }

  function getMessageNodes() {
    const nodes = new Set();

    MESSAGE_SELECTORS.forEach(selector => {
      document.querySelectorAll(selector).forEach(node => {
        if (looksLikeChatMessage(node)) {
          nodes.add(node);
        }
      });
    });

    return Array.from(nodes);
  }

  function attachCheckboxes() {
    const nodes = getMessageNodes();

    nodes.forEach(node => {
      if (node.querySelector(".snipboard-checkbox")) return;

      node.style.position = "relative";

      const wrap = document.createElement("div");
      wrap.className = "snipboard-checkbox";

      const cb = document.createElement("input");
      cb.type = "checkbox";

      cb.checked = node.classList.contains(SELECTED_CLASS);

      cb.addEventListener("click", e => {
        e.stopPropagation();
        node.classList.toggle(SELECTED_CLASS, cb.checked);
      });

      node.addEventListener("click", e => {
        if (e.target.tagName === "A") return;
        cb.checked = !cb.checked;
        node.classList.toggle(SELECTED_CLASS, cb.checked);
      });

      wrap.appendChild(cb);
      node.prepend(wrap);
    });
  }

  function getMessageRole(node) {
    if (!node) return "assistant";

    const roleAttr =
      node.getAttribute("data-message-author-role") ||
      node.getAttribute("data-role") ||
      node.getAttribute("data-author") ||
      node.getAttribute("data-user-role") ||
      "";

    const match = (roleAttr || "").toLowerCase();
    if (match.includes("assistant") || match.includes("chatgpt")) return "assistant";
    if (match.includes("user") || match.includes("you")) return "user";

    const label = Array.from(node.querySelectorAll("span, strong, div"))
      .map(el => (el.innerText || "").trim().toLowerCase())
      .find(txt => txt && (txt.includes("assistant") || txt.includes("chatgpt") || txt.includes("user") || txt === "you"));

    if (label) {
      if (label.includes("assistant") || label.includes("chatgpt")) return "assistant";
      if (label.includes("user") || label === "you") return "user";
    }

    if (node.classList.contains("assistant")) return "assistant";
    if (node.classList.contains("user")) return "user";

    return "assistant";
  }

  function getMessageContent(node) {
    if (!node) return "";
    const container =
      node.querySelector('[data-testid="message-text"]') ||
      node.querySelector('[data-testid="message-content"]') ||
      node.querySelector('[data-testid="message-body"]') ||
      node.querySelector(".markdown") ||
      node.querySelector(".result-streaming") ||
      node.querySelector(".message-inner") ||
      node.querySelector(".prose") ||
      node.querySelector(".text-message") ||
      node.querySelector(".user-message-bubble-color") ||
      node.querySelector(".assistant-message-bubble-color");

    const text = (container && readText(container)) || readText(node);
    return text;
  }

  function collect() {
    return getMessageNodes()
      .filter(n => n.classList.contains(SELECTED_CLASS))
      .map(n => ({
        role: getMessageRole(n),
        content: getMessageContent(n)
      }))
      .filter(msg => msg.content);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "SNIPBOARD_GET_SELECTION") {
      sendResponse({ messages: collect() });
    }
  });

  const observer = new MutationObserver(() => {
    attachCheckboxes();
  });

  function startObserving() {
    const target = document.body || document.documentElement;
    if (!target) return;
    observer.observe(target, {
      childList: true,
      subtree: true
    });
  }

  injectStyles();
  attachCheckboxes();
  startObserving();

  setInterval(attachCheckboxes, 250);

  const contentExports = {
    MESSAGE_SELECTORS,
    TEXT_CONTAINER_SELECTORS,
    getMessageNodes,
    getMessageRole,
    getMessageContent,
    looksLikeChatMessage
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = contentExports;
  } else if (typeof window !== "undefined") {
    window.SnipBoardContentModule = contentExports;
  }
})();
