const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shanthiDesktop', {
  getInfo: () => ipcRenderer.invoke('desktop:get-info'),
  openDataFolder: () => ipcRenderer.invoke('desktop:open-data-folder'),
  openBackupFolder: () => ipcRenderer.invoke('desktop:open-backup-folder'),
  getPrinters: () => ipcRenderer.invoke('desktop:get-printers'),
  printHtml: (options) => ipcRenderer.invoke('desktop:print-html', options),
  resetDatabaseConfiguration: () => ipcRenderer.invoke('desktop:reset-database'),
  // Electron/Chromium can occasionally leave the renderer without keyboard
  // focus after a native confirm/alert dialog. This narrow signal lets the
  // renderer restore focus without exposing BrowserWindow or generic IPC.
  ensureKeyboardFocus: () => ipcRenderer.send('desktop:ensure-keyboard-focus'),
});
