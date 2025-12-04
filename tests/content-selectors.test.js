global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn()
    }
  }
};

global.MutationObserver = class {
  constructor(callback) {
    this.callback = callback;
  }

  observe() {}
  disconnect() {}
};

const {
  MESSAGE_SELECTORS,
  getMessageNodes,
  getMessageRole,
  getMessageContent
} = require("../../SnipBoardExtension/content.js");

const SAMPLE_HTML = `
<article data-testid="conversation-turn-user" data-message-id="msg-user-1" data-turn="user" data-message-author-role="user">
  <div class="text-message">
    <div class="user-message-bubble-color">
      <div class="whitespace-pre-wrap">hello user</div>
    </div>
  </div>
</article>
<article data-testid="conversation-turn-assistant" data-message-id="msg-assistant-1" data-turn="assistant">
  <div class="text-message">
    <div class="assistant-message-bubble-color">
      <div class="markdown">
        <p>assistant response here</p>
      </div>
    </div>
  </div>
</article>
`;

describe("content.js selectors", () => {
  beforeEach(() => {
    document.body.innerHTML = SAMPLE_HTML;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("message selectors remain defined", () => {
    expect(Array.isArray(MESSAGE_SELECTORS)).toBe(true);
    expect(MESSAGE_SELECTORS.length).toBeGreaterThan(0);
  });

  test("captures the user and assistant wrappers", () => {
    const nodes = getMessageNodes();
    const ids = nodes.map(node => node.getAttribute("data-message-id"));
    expect(ids).toEqual(
      expect.arrayContaining(["msg-user-1", "msg-assistant-1"])
    );
  });

  test("determines roles for at least one of each", () => {
    const nodes = getMessageNodes();
    const roles = new Set(nodes.map(node => getMessageRole(node)));
    expect(roles.has("assistant")).toBe(true);
    expect(roles.has("user")).toBe(true);
  });

  test("extracts the expected text content", () => {
    const nodes = getMessageNodes();
    const contents = nodes.map(node => getMessageContent(node));
    expect(contents).toEqual(
      expect.arrayContaining(["hello user", "assistant response here"])
    );
  });
});
