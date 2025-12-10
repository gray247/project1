module.exports = {
  getMessageRole: (el) => el.dataset?.messageAuthorRole || "",
  getMessageContent: (el) => el.innerText || ""
};