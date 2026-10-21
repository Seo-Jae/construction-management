const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('printPreview', {
  action: (command, settings) => { if (['save', 'print', 'close'].includes(command)) ipcRenderer.send('desktop-preview-action', command, settings); },
  subscribe: callback => ipcRenderer.on('desktop-preview-state', (_event, value) => callback(value)),
  onCommand: callback => ipcRenderer.on('desktop-preview-command', (_event, command) => callback(command)),
});
