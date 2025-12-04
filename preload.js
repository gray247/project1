const { contextBridge, ipcRenderer } = require("electron");

console.log("[SnipBoard] Preload script loaded");

contextBridge.exposeInMainWorld("api", {

  getData: () => ipcRenderer.invoke("get-data"),
  saveClip: (clip) => ipcRenderer.invoke("save-clip", clip),
  deleteClip: (id) => ipcRenderer.invoke("delete-clip", id),
  deleteClips: (ids) => ipcRenderer.invoke("delete-clips", ids),
  createSection: (name) => ipcRenderer.invoke("create-section", name),
  deleteSection: (id) => ipcRenderer.invoke("delete-section", id),
  saveSectionOrder: (sections) => ipcRenderer.invoke("save-section-order", sections),

  getClipboardText: () => ipcRenderer.invoke("get-clipboard-text"),

  listDisplays: () => ipcRenderer.invoke("list-displays"),
  captureScreen: (displayId) => ipcRenderer.invoke("capture-screen", displayId),
  saveScreenshot: (arr) => ipcRenderer.invoke("save-screenshot", arr),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  setSectionLocked: (id, locked) => ipcRenderer.invoke("set-section-locked", { id, locked }),
  setSectionExportPath: (id, exportPath) =>
    ipcRenderer.invoke("set-section-export-path", { id, exportPath }),
  chooseExportFolder: () => ipcRenderer.invoke("choose-export-folder"),
  checkScreenshotExists: (filename) => ipcRenderer.invoke("check-screenshot-path", filename),
});
