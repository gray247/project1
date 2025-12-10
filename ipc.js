(function (global) {
  /**
   * SnipBoard Module: ipc.js
   *
   * Responsibilities:
   *  - Define IPC channel names used throughout the renderer.
   *  - Expose thin wrappers for invoke/send/on IPC interactions.
   *  - Provide a safeInvoke helper that surfaces errors to the UI.
   *
   * Exports:
   *  - window.SnipIPC { CHANNELS, invoke, safeInvoke, send, on }
   *
   * Does NOT handle:
   *  - DOM manipulation.
   *  - Business logic or retries.
   *
   * Dependencies:
   *  - global.api injected by preload.js.
   *  - Optional window.SnipToast for user-facing error reporting.
   *
   * Notes:
   *  - Pure IPC glue; renderer.js bootstraps and injects into modules.
   */
  const CHANNELS = {
    GET_DATA: "get-data",
    SAVE_CLIP: "save-clip",
    DELETE_CLIP: "delete-clip",
    DELETE_CLIPS: "delete-clips",
    CREATE_SECTION: "create-section",
    RENAME_SECTION: "rename-section",
    UPDATE_SECTION: "update-section",
    LOAD_TABS: "tabs:load",
    SAVE_TABS: "tabs:save",
    CHOOSE_EXPORT_FOLDER: "choose-export-folder",
    SAVE_SCREENSHOT: "save-screenshot",
    CAPTURE_SCREEN: "capture-screen",
    OPEN_URL: "open-url",
    SET_SECTION_EXPORT_PATH: "set-section-export-path",
    SET_SECTION_LOCKED: "set-section-locked",
    SAVE_SECTION_ORDER: "save-section-order",
    CHECK_SCREENSHOT_PATH: "check-screenshot-path",
    DELETE_SCREENSHOT: "delete-screenshot",
    DELETE_SECTION: "delete-section",
    GET_CLIPBOARD_TEXT: "get-clipboard-text",
    GET_SCREENSHOT_URL: "get-screenshot-url",
    LIST_DISPLAYS: "list-displays",
    DEBUG_LIST_DISPLAYS: "debug-list-displays",
    SAVE_CLIPS_ORDER: "save-clips-order",
    REORDER_CLIPS: "reorder-clips",
    REORDER_TABS: "reorder-tabs",
  };

  /**
   * Invoke an IPC channel (raw).
   * @param {...any} args
   * @returns {Promise<any>}
   */
  const invoke = (...args) => global.api.invoke(...args);
  /**
   * Invoke IPC with standardized error handling and toast notification.
   * @param {string} channel
   * @param {any} [payload={}]
   * @returns {Promise<any>}
   */
  async function safeInvoke(channel, payload = {}) {
    try {
      return await invoke(channel, payload);
    } catch (err) {
      console.error("IPC Failure:", channel, err);
      if (global.SnipToast?.error) {
        global.SnipToast.error("Operation failed. See console for details.");
      }
      throw err;
    }
  }
  /**
   * Send a fire-and-forget IPC message.
   * @param {...any} args
   */
  const send = (...args) => global.api.send(...args);
  /**
   * Subscribe to an IPC channel.
   * @param {...any} args
   */
  const on = (...args) => global.api.on(...args);

  global.SnipIPC = {
    CHANNELS,
    invoke,
    safeInvoke,
    send,
    on,
  };

  // Public API:
  // {
  //   CHANNELS,
  //   invoke,
  //   safeInvoke,
  //   send,
  //   on,
  // }
})(window);
