const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('databaseSetup', {
  testConnection: (config) => ipcRenderer.invoke('database:test', config),
  complete: (payload) => ipcRenderer.invoke('database:complete', payload),
});
