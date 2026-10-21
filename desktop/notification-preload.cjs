const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopPrint', { preview: () => ipcRenderer.send('desktop-print-preview') });
contextBridge.executeInMainWorld({ func: () => { window.print = () => window.desktopPrint.preview(); } });

// Main validates the sender frame and origin of these bounded messages.
contextBridge.exposeInMainWorld('desktopNotifications', {
  show: value => ipcRenderer.send('desktop-notification-show', value),
  close: id => ipcRenderer.send('desktop-notification-close', id),
  subscribe: callback => ipcRenderer.on('desktop-notification-event', (_event, value) => callback(value)),
});
contextBridge.executeInMainWorld({ func: () => {
  const WebNotification = window.Notification;
  const notices = new Map();
  let sequence = 0;
  // Preserve the site's constructor / onclick / close contract with native delivery.
  class DesktopNotification extends EventTarget {
    static get permission() { return WebNotification.permission; }
    static requestPermission(callback) { return WebNotification.requestPermission(callback); }
    constructor(title, options = {}) {
      super();
      this.id = `${Date.now()}-${++sequence}`;
      this.title = String(title);
      this.body = String(options.body || '');
      this.tag = String(options.tag || '');
      this.onclick = null;
      this.onshow = null;
      this.onerror = null;
      this.onclose = null;
      notices.set(this.id, this);
      if (notices.size > 64) notices.delete(notices.keys().next().value);
      window.desktopNotifications.show({ id: this.id, title: this.title, body: this.body, tag: this.tag, silent: options.silent === true });
    }
    close() { window.desktopNotifications.close(this.id); }
  }
  window.desktopNotifications.subscribe(({ id, type }) => {
    if (!['show', 'click', 'close', 'error'].includes(type)) return;
    const notice = notices.get(id);
    if (!notice) return;
    const event = new Event(type);
    notice.dispatchEvent(event);
    if (typeof notice[`on${type}`] === 'function') notice[`on${type}`].call(notice, event);
    if (type === 'error') notices.delete(id);
  });
  window.Notification = DesktopNotification;
} });
