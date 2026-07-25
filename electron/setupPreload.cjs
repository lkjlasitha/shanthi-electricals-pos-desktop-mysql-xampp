const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('databaseSetup', {
  detectXampp: () => ipcRenderer.invoke('database:detect-xampp'),
  openXampp: (controlPanelPath) => ipcRenderer.invoke('database:open-xampp', controlPanelPath),
  testConnection: (config) => ipcRenderer.invoke('database:test', config),
  complete: (payload) => ipcRenderer.invoke('database:complete', payload),
});
