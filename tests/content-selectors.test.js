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
  getMessageRole,
  getMessageContent
} = require("./__mocks__/content.js");

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
    const articles = Array.from(document.querySelectorAll("article"));
    articles.forEach((article) => {
      if (!article.dataset.messageAuthorRole) {
        article.dataset.messageAuthorRole = article.getAttribute("data-turn") || "";
      }
    });
    const userArticle = document.querySelector('[data-message-id="msg-user-1"]');
    const assistantArticle = document.querySelector('[data-message-id="msg-assistant-1"]');
    if (userArticle) userArticle.innerText = "hello user";
    if (assistantArticle) assistantArticle.innerText = "assistant response here";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("determines roles for at least one of each", () => {
    const nodes = Array.from(document.querySelectorAll("article"));
    const roles = new Set(nodes.map(node => getMessageRole(node)));
    expect(roles.has("assistant")).toBe(true);
    expect(roles.has("user")).toBe(true);
  });

  test("extracts the expected text content", () => {
    const nodes = Array.from(document.querySelectorAll("article"));
    const contents = nodes.map(node => getMessageContent(node));
    expect(contents).toEqual(
      expect.arrayContaining(["hello user", "assistant response here"])
    );
  });
});
