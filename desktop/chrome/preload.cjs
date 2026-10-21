const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopChrome', {
  action: action => {
    if (['reload', 'print', 'pdf', 'menu', 'update'].includes(action)) ipcRenderer.send('desktop-chrome-action', action);
  },
  onState: callback => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('desktop-chrome-state', (_, state) => {
      if (['loading', 'ready', 'offline'].includes(state)) callback(state);
    });
  },
  onUpdate: callback => {
    if (typeof callback === 'function') ipcRenderer.on('desktop-update-state', (_, state) => callback(state));
  },
});
