const { contextBridge, ipcRenderer } = require('electron');

const api = {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  onRefresh: (callback) => ipcRenderer.on('window-hotkey-refresh', callback)
};

try {
  if (contextBridge && contextBridge.exposeInMainWorld) {
    contextBridge.exposeInMainWorld('electronAPI', api);
  }
} catch (e) {}

try {
  window.electronAPI = api;
} catch (e) {}

