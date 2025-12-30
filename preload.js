const { contextBridge, ipcRenderer } = require("electron");
const { openColorPicker } = require("./src/ui/colorPicker.js");

const ALLOWED_INVOKE_CHANNELS = new Set([
  "get-data",
  "save-clip",
  "delete-clip",
  "create-section",
  "update-section",
  "tabs:load",
  "tabs:save",
  "choose-export-folder",
  "open-url",
  "set-section-export-path",
  "set-section-locked",
  "save-section-order",
  "delete-section",
]);

const ALLOWED_ON_CHANNELS = new Set([]);

const isAllowedChannel = (channel, allowlist) =>
  typeof channel === "string" && allowlist.has(channel);

contextBridge.exposeInMainWorld("api", {
  invoke: (channel, args) => {
    if (!isAllowedChannel(channel, ALLOWED_INVOKE_CHANNELS)) {
      console.warn(`[SnipBoard] Blocked IPC invoke: ${String(channel)}`);
      return Promise.reject(new Error("Blocked IPC channel"));
    }
    return ipcRenderer.invoke(channel, args);
  },
  send: (channel, args) => {
    const allowedChannels = new Set([
      "get-data",
      "save-clip",
      "delete-clip",
      "create-section",
      "delete-section",
      "save-section-order",
      "list-displays",
      "capture-screen",
      "save-screenshot",
      "get-screenshot-url",
      "open-url",
      "delete-clips",
      "get-clipboard-text",
    ]);
    if (typeof channel !== "string" || !allowedChannels.has(channel)) return;
    ipcRenderer.send(channel, args);
  },
  on: (channel, listener) => {
    if (!isAllowedChannel(channel, ALLOWED_ON_CHANNELS)) {
      console.warn(`[SnipBoard] Blocked IPC listener: ${String(channel)}`);
      return;
    }
    if (typeof listener !== "function") return;
    ipcRenderer.on(channel, listener);
  },
  getData: () => ipcRenderer.invoke("get-data"),
  listDisplays: () => ipcRenderer.invoke("list-displays"),
  captureScreen: (displayId) =>
    ipcRenderer.invoke("capture-screen", displayId),
  saveScreenshot: (payload) => ipcRenderer.invoke("save-screenshot", payload),
  getScreenshotUrl: (filename) =>
    ipcRenderer.invoke("get-screenshot-url", filename),
  saveClip: (clip, options) => ipcRenderer.invoke("save-clip", clip, options),
  deleteClip: (id) => ipcRenderer.invoke("delete-clip", id),
  deleteClips: (ids) => ipcRenderer.invoke("delete-clips", ids),
  getClipboardText: () => ipcRenderer.invoke("get-clipboard-text"),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
});

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
});

contextBridge.exposeInMainWorld("ui", {
  openColorPicker,
});
