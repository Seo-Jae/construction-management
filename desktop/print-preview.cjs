const { BrowserWindow, WebContentsView, ipcMain, dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { printOptions } = require('./print-options.cjs');

module.exports = function createPrintPreview({ preferences, setTaskbarIdentity, smoke }) {
  const records = new Map();
  const previewUrl = pathToFileURL(path.join(__dirname, 'preview/index.html')).href;
  const owns = contents => [...records.values()].some(record => record.window.webContents === contents || record.view.webContents === contents);
  const publish = (record, value) => { if (!record.window.isDestroyed()) record.window.webContents.send('desktop-preview-state', value); };
  async function action(record, command, settings) {
    if (record.window.isDestroyed()) return;
    if (command === 'close') { record.window.close(); return; }
    if (!record.pdf || record.busy || !record.pageCount) return;
    record.busy = true;
    publish(record, { state: 'busy' });
    let message = '';
    try {
      if (command === 'save') {
        const answer = await dialog.showSaveDialog(record.window, { title: 'PDF 저장', defaultPath: `${record.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100) || '욱림건설'}.pdf`, filters: [{ name: 'PDF 문서', extensions: ['pdf'] }] });
        if (!answer.canceled && answer.filePath) await fs.writeFile(answer.filePath, record.pdf);
      } else if (command === 'print') {
        const printers = await record.view.webContents.getPrintersAsync();
        const options = printOptions(settings, printers, record.pageCount, record.landscape);
        await new Promise((resolve, reject) => record.view.webContents.print(options, (success, reason) => {
          if (success || /cancel/i.test(reason || '')) resolve();
          else reject(new Error(reason || '프린터를 확인해주세요.'));
        }));
        message = '선택한 프린터에 인쇄를 요청했습니다.';
      }
    } catch (error) {
      message = error.message;
    } finally { record.busy = false; publish(record, { state: 'ready', message }); }
  }
  ipcMain.on('desktop-preview-action', (event, command, settings) => {
    const record = [...records.values()].find(value => value.window.webContents === event.sender);
    if (!record || event.senderFrame !== event.sender.mainFrame || event.senderFrame.url !== previewUrl || !['save', 'print', 'close'].includes(command)) return;
    void action(record, command, settings);
  });
  async function open(contents) {
    if (!contents || contents.isDestroyed()) return;
    const existing = records.get(contents.id);
    if (existing) { if (!smoke) { existing.window.show(); existing.window.focus(); } return existing.ready; }
    const window = new BrowserWindow({ title: '인쇄 미리보기', width: 1180, height: 900, minWidth: 740, minHeight: 550, show: false, backgroundColor: '#e9edf3', icon: path.join(__dirname, 'assets/app.ico'), autoHideMenuBar: true, webPreferences: { ...preferences, preload: path.join(__dirname, 'preview/preload.cjs') } });
    setTaskbarIdentity(window);
    window.setMenu(null);
    const view = new WebContentsView({ webPreferences: { ...preferences, plugins: true } });
    window.contentView.addChildView(view);
    const record = { window, view, pdf: null, busy: false, title: contents.getTitle() || '욱림건설', directory: null };
    const sourceId = contents.id;
    records.set(sourceId, record);
    const layout = () => {
      if (window.isDestroyed()) return;
      const [width, height] = window.getContentSize();
      view.setBounds({ x: 280, y: 72, width: Math.max(0, width - 280), height: Math.max(0, height - 72) });
    };
    layout(); window.on('resize', layout);
    for (const target of [window.webContents, view.webContents]) target.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const key = input.key.toLowerCase();
      if ((input.control || input.meta) && ['p', 's'].includes(key)) {
        event.preventDefault();
        window.webContents.send('desktop-preview-command', key === 'p' ? 'print' : 'save');
      }
    });
    const cleanup = async () => {
      if (!record.directory) return;
      await fs.unlink(path.join(record.directory, 'preview.pdf')).catch(() => {});
      await fs.rmdir(record.directory).catch(() => {});
    };
    window.on('closed', () => {
      records.delete(sourceId);
      if (!view.webContents.isDestroyed()) view.webContents.close();
      void cleanup();
    });
    record.ready = (async () => {
      try {
        await window.loadFile(path.join(__dirname, 'preview/index.html'));
        if (!smoke) window.show();
        // Keep the existing print CSS/events; let fonts and document images finish first.
        await contents.executeJavaScript(`Promise.race([
          Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.decode().catch(() => {}))]).then(() => true),
          new Promise(resolve => setTimeout(resolve, 5000))
        ])`);
        // Printing popups may call window.close in afterprint. Keep their renderer
        // alive until Chromium has returned the PDF, then honor the close request.
        await contents.executeJavaScript(`
          window.__desktopPrintClose = { original: window.close, requested: false };
          window.close = () => { window.__desktopPrintClose.requested = true; };
          true;
        `);
        try {
          record.pdf = await contents.printToPDF({ printBackground: true, preferCSSPageSize: true, pageSize: 'A4' });
        } finally {
          if (!contents.isDestroyed()) void contents.executeJavaScript(`
            (() => {
              const state = window.__desktopPrintClose;
              window.close = state.original;
              delete window.__desktopPrintClose;
              if (state.requested) window.close();
            })();
            true;
          `).catch(() => {});
        }
        if (window.isDestroyed()) return record;
        record.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wooklim-print-'));
        const pdfPath = path.join(record.directory, 'preview.pdf');
        await fs.writeFile(pdfPath, record.pdf);
        if (window.isDestroyed()) { await cleanup(); return record; }
        // Hide the PDF viewer's own print button, which opens the unsupported Windows preview.
        await view.webContents.loadURL(`${pathToFileURL(pdfPath).href}#toolbar=0`);
        let dimensions;
        for (let attempt = 0; attempt < 200 && !window.isDestroyed(); attempt += 1) {
          const frame = view.webContents.mainFrame.frames.find(value => value.url.startsWith('chrome-extension:'));
          if (frame) dimensions = await frame.executeJavaScript('document.querySelector("pdf-viewer")?.documentDimensions?.pageDimensions').catch(() => null);
          if (dimensions?.length) break;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        if (window.isDestroyed()) return record;
        if (!dimensions?.length) throw new Error('PDF 페이지를 불러오지 못했습니다.');
        record.pageCount = dimensions.length;
        record.landscape = dimensions[0].width > dimensions[0].height;
        const printers = await view.webContents.getPrintersAsync();
        publish(record, { state: 'ready', title: record.title, pageCount: record.pageCount, landscape: record.landscape,
          printers: printers.map(({ name, displayName, isDefault }) => ({ name, displayName, isDefault })) });
        return record;
      } catch (error) {
        if (!window.isDestroyed()) window.webContents.send('desktop-preview-state', { state: 'error', title: '미리보기를 만들지 못했습니다. 창을 닫고 다시 시도해주세요.' });
        if (smoke) throw error;
        return record;
      }
    })();
    return record.ready;
  }
  return { open, owns, records, action };
};
