const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { session, dialog } = require('electron');

module.exports = async ({ app, mainWindow, home, contents, pageView, tray, notifications, printPreviews, webUpdater, updater }) => {
  const timeout = setTimeout(() => { process.stderr.write('Desktop smoke test timed out\n'); app.exit(1); }, 60000);
  const output = path.join(app.getPath('userData'), 'results');
  await fs.mkdir(output, { recursive: true });
  assert.equal(mainWindow.isMenuBarVisible(), false);
  assert.equal(pageView.getBounds().y, 54);
  assert.equal(await mainWindow.webContents.executeJavaScript('document.querySelectorAll("button[data-action]").length'), 5);
  assert.equal(await contents.executeJavaScript('typeof window.desktopChrome'), 'undefined');
  await fs.writeFile(path.join(output, 'appbar.png'), (await mainWindow.webContents.capturePage({ x: 0, y: 0, width: 1584, height: 54 })).toPNG());
  let body = '';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    body = await contents.executeJavaScript('document.getElementById("root")?.innerText || ""');
    if (body.includes('로그인')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(body.includes('로그인'), 'Production login screen rendered');
  assert.ok(contents.getURL().startsWith(home));
  assert.equal(await contents.executeJavaScript('typeof window.require'), 'undefined');
  const prefs = contents.getLastWebPreferences();
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.sandbox, true);
  assert.equal(await contents.executeJavaScript('Notification.permission'), 'granted');
  assert.equal(await contents.executeJavaScript('Notification.requestPermission()'), 'granted');
  assert.notEqual(await mainWindow.webContents.executeJavaScript('Notification.permission'), 'granted', 'Local shell is not granted web notification permission');
  assert.equal(tray.isDestroyed(), false);
  // Windows honors the launcher's SW_HIDE for the first ShowWindow call.
  mainWindow.show();
  await contents.executeJavaScript('window.desktopRetainedDraft = "unsaved-draft"');
  assert.equal(webUpdater.getState().phase, 'current', 'Loaded page matches live deployment');
  await webUpdater.check();
  assert.equal(await contents.executeJavaScript('window.desktopRetainedDraft'), 'unsaved-draft', 'Update notification preserves the current page');
  const webActivate = webUpdater.activate;
  const programActivate = updater.activate;
  const programState = updater.getState;
  let webClicks = 0;
  let programClicks = 0;
  webUpdater.activate = async () => { webClicks += 1; };
  updater.activate = async () => { programClicks += 1; };
  updater.getState = () => ({ phase: 'ready' });
  await mainWindow.webContents.executeJavaScript('window.desktopChrome.action("update")');
  for (let attempt = 0; attempt < 30 && webClicks === 0; attempt += 1) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(webClicks, 1, 'Top update button requests a web update');
  assert.equal(programClicks, 0, 'Top update button never activates the native installer');
  webUpdater.activate = webActivate;
  updater.activate = programActivate;
  updater.getState = programState;
  mainWindow.close();
  assert.equal(mainWindow.isDestroyed(), false, 'X preserves the running window');
  assert.equal(mainWindow.isVisible(), false, 'X hides to tray');
  assert.equal(await contents.executeJavaScript('window.desktopRetainedDraft'), 'unsaved-draft');
  assert.equal(await contents.executeJavaScript('document.visibilityState'), 'hidden');
  const checkNativeNotice = async target => {
    const result = await target.executeJavaScript(`new Promise(resolve => {
      const notice = new Notification('욱림건설 알림 확인', { body: 'Windows 알림 연결이 정상입니다.', tag: 'desktop-smoke', silent: true });
      window.smokeNotice = notice;
      notice.onclick = () => { window.desktopNoticeClicked = true; notice.close(); };
      notice.onshow = () => resolve('shown');
      notice.onerror = () => resolve('failed');
      setTimeout(() => resolve('no-event'), 8000);
    })`);
    assert.equal(result, 'shown', 'Windows native notification emits show');
    const entry = [...notifications.values()].find(value => value.contents === target);
    assert.ok(entry, 'Native notification retained for later clicks');
    entry.notice.emit('click');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (await target.executeJavaScript('window.desktopNoticeClicked === true')) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.fail('Native click did not reach the existing web callback');
  };
  // Local notifications only: no login, database writes, or message recipients.
  await checkNativeNotice(contents);
  for (let attempt = 0; attempt < 30 && !mainWindow.isVisible(); attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(mainWindow.isVisible(), true, 'Notification click restores the hidden app');
  assert.equal(await contents.executeJavaScript('window.desktopNoticeClicked'), true);
  mainWindow.hide();
  // Hidden WebContentsView has no native capture surface; DOM rendering is checked above.

  const childCreated = once(contents, 'did-create-window');
  await contents.executeJavaScript(`(() => {
    const popup = window.open('', 'desktopPrintSmoke', 'width=900,height=650');
    popup.document.write('<!doctype html><html lang="ko"><head><title>인쇄 확인</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:sans-serif}td{border:1px solid #000;padding:10px}</style></head><body><h1>욱림건설 인쇄 확인</h1><table><tr><td>101동</td><td>작업중</td></tr></table></body></html>');
    popup.document.close();
  })()`);
  const [child] = await childCreated;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await child.webContents.executeJavaScript('document.body?.innerText.includes("101동")')) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(await child.webContents.executeJavaScript('Boolean(window.opener)'), true);
  assert.equal(await child.webContents.executeJavaScript('typeof window.require'), 'undefined');
  const pdf = await child.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
  assert.ok(pdf.subarray(0, 5).toString().startsWith('%PDF-'));
  await fs.writeFile(path.join(output, 'print.pdf'), pdf);
  await child.webContents.executeJavaScript('window.print()');
  for (let attempt = 0; attempt < 50 && !printPreviews.records.has(child.webContents.id); attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
  const preview = await printPreviews.records.get(child.webContents.id)?.ready;
  assert.ok(preview?.pdf?.subarray(0, 5).toString().startsWith('%PDF-'), 'Menu window.print opens PDF preview');
  assert.equal(await preview.window.webContents.executeJavaScript('document.querySelector("[data-action=save]").disabled'), false);
  assert.equal(preview.pageCount, 1);
  assert.equal(preview.landscape, true, 'Preserve the document landscape direction');
  assert.equal(preview.view.getBounds().x, 280, 'Printer settings remain alongside the preview');
  preview.window.showInactive();
  let rendered = false;
  for (let attempt = 0; attempt < 100 && !rendered; attempt += 1) {
    const pdfFrame = preview.view.webContents.mainFrame.frames.find(frame => frame.url.startsWith('chrome-extension:'));
    if (pdfFrame) rendered = await pdfFrame.executeJavaScript('Boolean(document.querySelector("pdf-viewer")?.documentDimensions?.pageDimensions?.length)');
    if (!rendered) await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(rendered, 'Built-in PDF viewer finishes rendering the document');
  await new Promise(resolve => setTimeout(resolve, 600));
  // Screenshots are optional artifacts; hidden/occluded Windows surfaces can be
  // unavailable even after the PDF DOM has rendered. Keep all print assertions.
  try {
    await fs.writeFile(path.join(output, 'preview.png'), (await preview.view.webContents.capturePage()).toPNG());
    await fs.writeFile(path.join(output, 'print-settings.png'), (await preview.window.webContents.capturePage()).toPNG());
  } catch (error) {
    if (!error.message.includes('Current display surface not available for capture')) throw error;
    process.stderr.write('Preview screenshot artifact unavailable: Windows display surface is hidden. PDF rendering and print assertions still run.\n');
  }
  const pdfFrame = preview.view.webContents.mainFrame.frames.find(frame => frame.url.startsWith('chrome-extension:'));
  assert.equal(await pdfFrame.executeJavaScript('document.querySelector("pdf-viewer").toolbarEnabled_'), false, 'PDF native print toolbar is hidden');
  const actualPrint = preview.view.webContents.print;
  const actualPrinters = preview.view.webContents.getPrintersAsync;
  let requestedPrint;
  try {
    // Verify dispatch without sending a real print job to the user's printer.
    preview.view.webContents.getPrintersAsync = async () => [{ name: 'smoke-printer' }];
    preview.view.webContents.print = (options, callback) => { requestedPrint = options; callback(true); };
    await preview.window.webContents.executeJavaScript(`
      document.getElementById('printer').replaceChildren(new Option('Test printer', 'smoke-printer'));
      document.getElementById('printer').disabled = false;
      document.getElementById('printer').dispatchEvent(new Event('change'));
      document.getElementById('copies').value = '2';
      document.getElementById('pages').value = '1';
      document.querySelector('[data-action=print]').click();
    `);
    for (let attempt = 0; attempt < 50 && !requestedPrint; attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(requestedPrint?.silent, true, 'Printing does not reopen the Windows preview dialog');
    assert.equal(requestedPrint?.deviceName, 'smoke-printer');
    assert.equal(requestedPrint?.copies, 2);
    assert.deepEqual(requestedPrint?.pageRanges, [{ from: 0, to: 0 }]);
  } finally { preview.view.webContents.print = actualPrint; preview.view.webContents.getPrintersAsync = actualPrinters; }
  await child.webContents.executeJavaScript('document.body.textContent = "Changed after preview"');
  const saveDialog = dialog.showSaveDialog;
  const savedPreview = path.join(output, 'saved-preview.pdf');
  try {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: savedPreview });
    await printPreviews.action(preview, 'save');
  } finally { dialog.showSaveDialog = saveDialog; }
  assert.deepEqual(await fs.readFile(savedPreview), preview.pdf, 'PDF save preserves exactly the previewed document');
  preview.window.close();
  await child.loadURL(home);
  child.hide();
  await checkNativeNotice(child.webContents);
  assert.equal(child.isVisible(), true, 'Messenger popup is restored by its notification');
  await child.loadURL('about:blank');
  await child.webContents.executeJavaScript('document.open(); document.write("<!doctype html><body>Print popup auto-close regression</body>"); document.close(); window.onafterprint = () => { document.body.textContent = ""; window.close(); }; true');
  const closingId = child.webContents.id;
  await child.webContents.executeJavaScript('window.print()');
  for (let attempt = 0; attempt < 50 && !printPreviews.records.has(closingId); attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
  const closedSourcePreview = await printPreviews.records.get(closingId)?.ready;
  assert.ok(closedSourcePreview?.pdf?.length > 0, 'Preview retains PDF when afterprint closes the source popup');
  await fs.writeFile(path.join(output, 'auto-close.pdf'), closedSourcePreview.pdf);
  closedSourcePreview.window.close();
  if (!child.isDestroyed()) child.destroy();

  await mainWindow.webContents.executeJavaScript('window.desktopChrome.action("print")');
  for (let attempt = 0; attempt < 50 && !printPreviews.records.has(contents.id); attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
  const toolbarPreview = await printPreviews.records.get(contents.id)?.ready;
  assert.ok(toolbarPreview?.pdf?.length > 0, 'Top toolbar opens preview for the work page');
  toolbarPreview.window.close();

  const downloadPath = path.join(output, 'download.txt');
  const downloaded = new Promise((resolve, reject) => {
    session.defaultSession.once('will-download', (_, item) => {
      item.setSavePath(downloadPath);
      item.once('done', (_, state) => state === 'completed' ? resolve() : reject(new Error(state)));
    });
  });
  await contents.executeJavaScript(`(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['wooklim-download-test'], { type: 'text/plain' }));
    a.download = 'download.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  })()`);
  await downloaded;
  assert.equal(await fs.readFile(downloadPath, 'utf8'), 'wooklim-download-test');
  assert.equal(await contents.executeJavaScript('window.open("file:///C:/Windows/win.ini") === null'), true);
  const shellUrl = mainWindow.webContents.getURL();
  const reloaded = once(contents, 'did-finish-load');
  await mainWindow.webContents.executeJavaScript('window.desktopChrome.action("reload")');
  await reloaded;
  assert.equal(mainWindow.webContents.getURL(), shellUrl, 'Reload targets the work page, not the title bar');
  assert.ok(contents.getURL().startsWith(home));
  assert.equal(pageView.getBounds().height, mainWindow.getContentSize()[1] - 54);
  app.once('quit', () => {
    clearTimeout(timeout);
    assert.equal(mainWindow.isDestroyed(), true, 'Explicit quit destroys the window');
    assert.equal(tray.isDestroyed(), true, 'Explicit quit removes the tray icon');
    process.stdout.write(JSON.stringify({ passed: true, checks: ['custom-appbar', 'isolated-toolbar', 'toolbar-reload', 'toolbar-print-preview', 'production-login', 'sandbox', 'print-popup-opener', 'pdf-export', 'pdf-preview-render', 'preview-save-identical', 'print-popup-auto-close', 'blob-download', 'blocked-file-popup', 'automatic-trusted-notifications', 'close-hides-preserves-draft', 'native-notification-show', 'popup-native-notification-show', 'notification-click-restores', 'explicit-quit'], artifacts: output }) + '\n');
  });
  app.quit();
};
