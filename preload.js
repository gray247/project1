const { contextBridge, ipcRenderer } = require("electron");
const { openColorPicker } = require("./src/ui/colorPicker.js");

contextBridge.exposeInMainWorld("api", {
  invoke: (channel, args) => ipcRenderer.invoke(channel, args),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
});

contextBridge.exposeInMainWorld("ui", {
  openColorPicker,
});
