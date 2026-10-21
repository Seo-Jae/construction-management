const { app, BrowserWindow, WebContentsView, Menu, Tray, Notification, dialog, shell, session, screen, ipcMain, net } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { appUrl, isAppUrl, isInternalPopup, externalUrl } = require('./security.cjs');
const createPrintPreview = require('./print-preview.cjs');
const createUpdater = require('./updater.cjs');
const { buildFingerprint, createWebUpdater } = require('./web-updater.cjs');

const smoke = process.argv.includes('--desktop-smoke-test');
const desktopAppId = `kr.co.wooklim.construction${smoke ? '.test' : app.isPackaged ? '' : '.development'}`;
// Test runs use their own profile and never reuse a person's saved login.
if (smoke) app.setPath('userData', path.join(os.tmpdir(), `wooklim-desktop-smoke-${process.pid}`));
app.setName(smoke ? '욱림건설 통합관리 테스트' : app.isPackaged ? '욱림건설 통합관리' : '욱림건설 통합관리 개발');
app.setAppUserModelId(desktopAppId);
app.enableSandbox();
const home = appUrl(app.isPackaged, process.env.WOOKLIM_DESKTOP_DEV_URL);
const preferences = { nodeIntegration: false, nodeIntegrationInWorker: false, contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false, allowRunningInsecureContent: false };
let mainWindow;
let pageView;
let applicationMenu;
let tray;
let quitting = false;
let printPreviews;
let updater;
let webUpdater;
let pendingUpdateInstall = false;
const notificationWindows = new Set();
const notifications = new Map();
const notificationPreload = path.join(__dirname, 'notification-preload.cjs');
const chromeUrl = pathToFileURL(path.join(__dirname, 'chrome/index.html')).href;
const CHROME_HEIGHT = 54;
const ownerWindow = contents => contents === pageView?.webContents ? mainWindow : BrowserWindow.fromWebContents(contents);
const pageContents = window => window === mainWindow ? pageView?.webContents : window?.webContents;
let externalPrompt = false;

function publishUpdateState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const programState = updater?.getState() || { phase: 'idle' };
  const programItem = applicationMenu?.getMenuItemById('program-update');
  if (programItem) {
    programItem.label = ({ checking: '프로그램 업데이트 확인 중', downloading: `프로그램 업데이트 다운로드 ${programState.percent || 0}%`, ready: '프로그램 업데이트 적용 (재시작)', installing: '프로그램 업데이트 적용 중' })[programState.phase] || '프로그램 업데이트 확인 / 적용';
    programItem.enabled = !['checking', 'downloading', 'installing'].includes(programState.phase);
  }
  mainWindow.webContents.send('desktop-update-state', {
    ...programState,
    web: webUpdater?.getState() || { phase: 'unknown' },
  });
}

function setTaskbarIdentity(window) {
  if (process.platform !== 'win32') return;
  window.setAppDetails({
    appId: desktopAppId,
    appIconPath: app.isPackaged ? process.execPath : path.join(__dirname, 'assets/app.ico'),
    appIconIndex: 0,
    relaunchCommand: app.isPackaged ? `"${process.execPath}"` : `"${process.execPath}" "${__dirname}"`,
    relaunchDisplayName: app.getName(),
  });
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  pageView?.webContents.focus();
}

function installTray() {
  tray = new Tray(path.join(__dirname, 'assets/app.ico'));
  tray.setToolTip('욱림건설 통합관리 · 메신저 수신 중');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '욱림건설 통합관리 열기', click: showMainWindow },
    { type: 'separator' },
    { label: '완전히 종료', click: () => app.quit() },
  ]));
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
}

async function openExternal(value, parent) {
  const url = externalUrl(value);
  if (!url || externalPrompt || smoke) return;
  externalPrompt = true;
  try {
    const options = { type: 'question', title: '외부 링크', message: '기본 브라우저에서 링크를 여시겠습니까?', detail: url, buttons: ['열기', '취소'], defaultId: 1, cancelId: 1, noLink: true };
    const answer = parent && !parent.isDestroyed() ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options);
    if (answer.response === 0) await shell.openExternal(url);
  } finally { externalPrompt = false; }
}

function secureContents(contents) {
  contents.on('did-create-window', window => {
    setTaskbarIdentity(window);
    const childContents = window.webContents;
    notificationWindows.add(childContents);
    childContents.once('destroyed', () => notificationWindows.delete(childContents));
  });
  contents.on('did-start-navigation', (_event, _url, inPlace, isMainFrame) => {
    if (isMainFrame && !inPlace) clearNotifications(contents);
  });
  contents.once('destroyed', () => clearNotifications(contents));
  contents.on('will-attach-webview', event => event.preventDefault());
  const guard = (event, url) => {
    if (contents !== mainWindow?.webContents && (isAppUrl(url, home) || (contents !== pageView?.webContents && isInternalPopup(url, home)))) return;
    event.preventDefault();
    void openExternal(url, ownerWindow(contents));
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.setWindowOpenHandler(({ url }) => {
    if (contents === mainWindow?.webContents) return { action: 'deny' };
    if (isInternalPopup(url, home)) return {
      action: 'allow',
      overrideBrowserWindowOptions: { icon: path.join(__dirname, 'assets/app.ico'), show: !smoke, autoHideMenuBar: true, webPreferences: { ...preferences, preload: notificationPreload } },
    };
    void openExternal(url, ownerWindow(contents));
    return { action: 'deny' };
  });
  contents.on('will-prevent-unload', event => {
    // Electron only ignores beforeunload when this event is prevented.
    const window = ownerWindow(contents);
    if (!window || smoke) return;
    const answer = dialog.showMessageBoxSync(window, { type: 'question', message: '저장하지 않은 내용이 있을 수 있습니다. 이 화면을 나가시겠습니까?', buttons: ['계속 작업', '나가기'], defaultId: 0, cancelId: 0 });
    if (answer === 1) event.preventDefault();
    else { quitting = false; pendingUpdateInstall = false; }
  });
  contents.on('before-input-event', (event, input) => {
    if (printPreviews?.owns(contents)) return;
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    const control = input.control || input.meta;
    let action;
    if (key === 'f5' || (control && key === 'r')) action = control && key === 'f5' || input.shift ? 'forceReload' : 'reload';
    else if (control && key === 'p') action = 'print';
    else if (control && input.shift && key === 's') action = 'pdf';
    else if (key === 'f11') action = 'fullscreen';
    else if (control && ['+', '='].includes(key)) action = 'zoomIn';
    else if (control && key === '-') action = 'zoomOut';
    else if (control && key === '0') action = 'resetZoom';
    else if (contents === mainWindow?.webContents && control && ['a', 'c', 'x', 'v', 'z', 'y'].includes(key)) action = ({ a: 'selectAll', c: 'copy', x: 'cut', v: 'paste', z: input.shift ? 'redo' : 'undo', y: 'redo' })[key];
    if (action) { event.preventDefault(); void runAction(action, ownerWindow(contents)); }
  });
}

function clearNotifications(contents) {
  for (const [key, entry] of notifications) {
    if (entry.contents === contents) { notifications.delete(key); entry.notice.close(); }
  }
}

function installNotifications() {
  const trusted = event => event.senderFrame === event.sender.mainFrame &&
    isAppUrl(event.senderFrame.url, home) &&
    (event.sender === pageView?.webContents || notificationWindows.has(event.sender));
  ipcMain.on('desktop-notification-show', (event, value) => {
    if (!trusted(event) || !value || typeof value.id !== 'string' || value.id.length > 80 || typeof value.title !== 'string' || typeof value.body !== 'string') return;
    const contents = event.sender;
    const key = `${contents.id}:${value.id}`;
    const tag = typeof value.tag === 'string' ? value.tag.slice(0, 200) : '';
    const emit = type => { if (!contents.isDestroyed()) contents.send('desktop-notification-event', { id: value.id, type }); };
    for (const [oldKey, entry] of notifications) {
      if (oldKey === key || (tag && entry.contents === contents && entry.tag === tag)) {
        notifications.delete(oldKey); entry.notice.close();
      }
    }
    if (notifications.size >= 64) {
      const [oldKey, entry] = notifications.entries().next().value;
      notifications.delete(oldKey); entry.notice.close();
    }
    const failed = () => {
      notifications.delete(key);
      emit('error');
      if (tag.startsWith('wooklim-messenger-permission-test-') && !smoke) {
        void dialog.showMessageBox(ownerWindow(contents), { type: 'error', message: 'Windows 알림을 표시하지 못했습니다.', detail: 'Windows 설정 → 시스템 → 알림에서 욱림건설 통합관리의 알림과 방해 금지 설정을 확인해주세요.' });
      }
    };
    if (!Notification.isSupported()) { failed(); return; }
    try {
      const notice = new Notification({ title: value.title.slice(0, 120), body: value.body.slice(0, 500), silent: value.silent === true, icon: path.join(__dirname, 'assets/app.png') });
      notifications.set(key, { contents, notice, tag });
      notice.on('show', () => emit('show'));
      notice.on('failed', failed);
      notice.on('close', () => emit('close'));
      notice.on('click', () => {
        if (contents.isDestroyed() || !isAppUrl(contents.getURL(), home)) return;
        if (contents === pageView?.webContents) showMainWindow();
        else {
          const window = ownerWindow(contents);
          if (window && !window.isDestroyed()) { if (window.isMinimized()) window.restore(); window.show(); window.focus(); }
        }
        emit('click');
      });
      notice.show();
    } catch { failed(); }
  });
  ipcMain.on('desktop-notification-close', (event, id) => {
    if (!trusted(event) || typeof id !== 'string') return;
    const key = `${event.sender.id}:${id}`;
    const entry = notifications.get(key);
    if (entry) { notifications.delete(key); entry.notice.close(); }
  });
}

function configureSession() {
  const approved = new Set();
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin) =>
    Boolean(contents && isAppUrl(contents.getURL(), home) && isAppUrl(origin, home) && (['fullscreen', 'notifications'].includes(permission) || approved.has(permission))));
  session.defaultSession.setPermissionRequestHandler(async (contents, permission, callback, details) => {
    const labels = { notifications: '알림 표시', media: '카메라 / 마이크 사용', 'clipboard-read': '클립보드 읽기' };
    if (!contents || !isAppUrl(contents.getURL(), home) || !isAppUrl(details.requestingUrl || contents.getURL(), home)) return callback(false);
    if (['fullscreen', 'notifications', 'clipboard-sanitized-write'].includes(permission)) return callback(true);
    if (!labels[permission] || smoke) return callback(false);
    if (approved.has(permission)) return callback(true);
    const parent = ownerWindow(contents);
    if (!parent) return callback(false);
    const { response } = await dialog.showMessageBox(parent, { type: 'question', title: '사용 권한', message: `${labels[permission]}을 허용하시겠습니까?`, buttons: ['허용', '허용 안 함'], defaultId: 1, cancelId: 1 });
    if (response === 0) approved.add(permission);
    callback(response === 0);
  });
  session.defaultSession.on('will-download', (_, item, contents) => {
    if (smoke) return;
    item.setSaveDialogOptions({ title: '파일 저장', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())), properties: ['showOverwriteConfirmation'] });
    const parent = ownerWindow(contents);
    item.once('done', (_, state) => {
      if (state !== 'interrupted' || !parent || parent.isDestroyed()) return;
      void dialog.showMessageBox(parent, { type: 'error', message: '파일 다운로드를 완료하지 못했습니다.', detail: '연결을 확인한 후 다시 다운로드해주세요.' });
    });
  });
}

async function runAction(action, window = BrowserWindow.getFocusedWindow() || mainWindow) {
  if (!window || window.isDestroyed()) return;
  const contents = pageContents(window);
  if (!contents || contents.isDestroyed()) return;
  if (action !== 'menu') contents.focus();
  switch (action) {
    case 'home': await pageView.webContents.loadURL(home).catch(() => {}); break;
    case 'reload':
      if (window === mainWindow && !isAppUrl(contents.getURL(), home)) await contents.loadURL(home).catch(() => {});
      else contents.reload();
      break;
    case 'forceReload': contents.reloadIgnoringCache(); break;
    case 'print': case 'pdf': await printPreviews.open(contents); break;
    case 'downloads': await shell.openPath(app.getPath('downloads')); break;
    case 'browser': await shell.openExternal(home); break;
    case 'zoomIn': contents.setZoomLevel(Math.min(5, contents.getZoomLevel() + 0.5)); break;
    case 'zoomOut': contents.setZoomLevel(Math.max(-5, contents.getZoomLevel() - 0.5)); break;
    case 'resetZoom': contents.setZoomLevel(0); break;
    case 'fullscreen': window.setFullScreen(!window.isFullScreen()); break;
    case 'undo': case 'redo': case 'cut': case 'copy': case 'paste': case 'selectAll': contents[action](); break;
    case 'devtools': if (!app.isPackaged) contents.toggleDevTools(); break;
    case 'quit': app.quit(); break;
    case 'update': await webUpdater?.activate(); break;
    case 'programUpdate': await updater?.activate(); break;
    case 'menu': applicationMenu.popup({ window, x: Math.max(0, window.getContentBounds().width - 390), y: CHROME_HEIGHT - 4 }); break;
    case 'about': await dialog.showMessageBox(window, { type: 'info', icon: path.join(__dirname, 'assets/app.png'), title: '프로그램 정보', message: '욱림건설 통합관리 ' + app.getVersion(), detail: '닫기(X)를 누르면 트레이로 숨겨집니다.\n완전히 종료하려면 트레이 메뉴에서 선택해주세요.\n로그인 중에는 숨긴 상태에서도 메신저 알림을 받습니다.' }); break;
  }
}

function installMenu() {
  const item = (label, action, accelerator) => ({ label, ...(accelerator ? { accelerator } : {}), click: () => void runAction(action) });
  applicationMenu = Menu.buildFromTemplate([
    item('처음 화면', 'home'),
    { type: 'separator' },
    item('인쇄', 'print', 'Ctrl+P'), item('PDF로 저장', 'pdf', 'Ctrl+Shift+S'), item('다운로드 폴더 열기', 'downloads'),
    { type: 'separator' },
    { label: '보기', submenu: [item('확대', 'zoomIn', 'Ctrl+='), item('축소', 'zoomOut', 'Ctrl+-'), item('원래 크기', 'resetZoom', 'Ctrl+0'), item('전체 화면', 'fullscreen', 'F11'), item('강력 새로고침', 'forceReload', 'Ctrl+F5')] },
    { label: '편집', submenu: [item('실행 취소', 'undo', 'Ctrl+Z'), item('다시 실행', 'redo', 'Ctrl+Y'), item('잘라내기', 'cut', 'Ctrl+X'), item('복사', 'copy', 'Ctrl+C'), item('붙여넣기', 'paste', 'Ctrl+V'), item('전체 선택', 'selectAll', 'Ctrl+A')] },
    { type: 'separator' }, item('웹 브라우저로 열기', 'browser'), { ...item('프로그램 업데이트 확인 / 적용', 'programUpdate'), id: 'program-update' }, item('프로그램 정보', 'about'),
    ...(!app.isPackaged ? [item('개발자 도구', 'devtools')] : []),
    { type: 'separator' }, item('완전히 종료', 'quit'),
  ]);
  Menu.setApplicationMenu(null);
  ipcMain.on('desktop-print-preview', event => {
    if (event.senderFrame !== event.sender.mainFrame) return;
    const allowed = (event.sender === pageView?.webContents && isAppUrl(event.senderFrame.url, home)) ||
      (notificationWindows.has(event.sender) && isInternalPopup(event.senderFrame.url, home));
    if (allowed) void printPreviews.open(event.sender);
  });
  ipcMain.on('desktop-chrome-action', (event, action) => {
    // Only the local title bar's top frame can request these bounded actions.
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || event.senderFrame.url !== chromeUrl) return;
    if (!['reload', 'print', 'pdf', 'menu', 'update'].includes(action)) return;
    void runAction(action, mainWindow);
  });
}

async function createMainWindow() {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({ title: '욱림건설 통합관리', width: Math.min(1600, workArea.width), height: Math.min(1000, workArea.height), minWidth: 900, minHeight: 600, show: false,
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#101e33', symbolColor: '#dbe9f8', height: CHROME_HEIGHT - 1 },
    backgroundColor: '#101e33', icon: path.join(__dirname, 'assets/app.ico'),
    webPreferences: { ...preferences, preload: path.join(__dirname, 'chrome/preload.cjs') },
  });
  mainWindow.setMenu(null);
  setTaskbarIdentity(mainWindow);
  pageView = new WebContentsView({ webPreferences: { ...preferences, preload: notificationPreload } });
  mainWindow.contentView.addChildView(pageView);
  const layout = () => {
    if (mainWindow.isDestroyed()) return;
    const [width, height] = mainWindow.getContentSize();
    pageView.setBounds({ x: 0, y: CHROME_HEIGHT, width, height: Math.max(0, height - CHROME_HEIGHT) });
  };
  mainWindow.on('resize', layout);
  layout();
  mainWindow.on('close', event => {
    if (!quitting && tray && !tray.isDestroyed()) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
  });
  mainWindow.on('closed', () => { if (!pageView.webContents.isDestroyed()) pageView.webContents.close(); });
  const publishState = state => { if (!mainWindow.isDestroyed()) mainWindow.webContents.send('desktop-chrome-state', state); };
  pageView.webContents.on('did-start-loading', () => publishState('loading'));
  pageView.webContents.on('did-stop-loading', () => publishState(isAppUrl(pageView.webContents.getURL(), home) ? 'ready' : 'offline'));
  if (!smoke) {
    pageView.webContents.on('did-fail-load', (_, code, _description, url, isMainFrame) => {
      if (isMainFrame && code !== -3 && isAppUrl(url, home)) void pageView.webContents.loadFile(path.join(__dirname, 'offline.html'));
    });
    pageView.webContents.on('render-process-gone', () => { if (!mainWindow.isDestroyed()) void pageView.webContents.loadFile(path.join(__dirname, 'offline.html')); });
  }
  await mainWindow.loadFile(path.join(__dirname, 'chrome/index.html'));
  if (!smoke) { mainWindow.maximize(); mainWindow.show(); }
  await pageView.webContents.loadURL(home).catch(error => { if (smoke) throw error; });
  pageView.webContents.focus();
}

if (!smoke && !app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showMainWindow);
  app.on('before-quit', event => {
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) {
      if (!smoke) {
        const answer = dialog.showMessageBoxSync(mainWindow, { type: 'question', message: '프로그램을 완전히 종료하시겠습니까?', detail: '저장하지 않은 내용은 사라지며 메신저 알림 수신도 종료됩니다.', buttons: ['취소', '종료'], defaultId: 0, cancelId: 0, noLink: true });
        if (answer !== 1) { event.preventDefault(); return; }
      }
      quitting = true;
    }
  });
  app.on('will-quit', () => {
    tray?.destroy();
    if (pendingUpdateInstall) updater?.installDownloaded();
  });
  app.on('web-contents-created', (_, contents) => secureContents(contents));
  app.on('window-all-closed', () => app.quit());
  app.whenReady().then(async () => {
    configureSession();
    printPreviews = createPrintPreview({ preferences, setTaskbarIdentity, smoke });
    installNotifications();
    installMenu();
    installTray();
    await createMainWindow();
    updater = createUpdater({
      autoUpdater: require('electron-updater').autoUpdater,
      enabled: app.isPackaged && !smoke,
      publish: publishUpdateState,
      confirmRestart: async version => {
        const answer = await dialog.showMessageBox(mainWindow, { type: 'question', title: '프로그램 업데이트',
          message: `${version} 버전으로 지금 업데이트하시겠습니까?`,
          detail: '작성 중인 내용을 저장한 후 진행해주세요. 업데이트 후 프로그램이 다시 열립니다.',
          buttons: ['재시작하여 업데이트', '나중에'], defaultId: 1, cancelId: 1, noLink: true });
        return answer.response === 0;
      },
      requestRestart: () => { pendingUpdateInstall = true; quitting = true; app.quit(); },
    });
    webUpdater = createWebUpdater({
      readLoaded: async () => {
        if (!isAppUrl(pageView.webContents.getURL(), home)) throw new Error('Application page is not loaded');
        const head = await pageView.webContents.executeJavaScript('document.head.innerHTML');
        return buildFingerprint(head, home);
      },
      readLatest: async () => {
        const url = new URL(home);
        url.searchParams.set('_desktop_version_check', String(Date.now()));
        const response = await net.fetch(url.href, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error('Deployment check failed');
        return buildFingerprint(await response.text(), home);
      },
      publish: publishUpdateState,
      confirmReload: async () => {
        const answer = await dialog.showMessageBox(mainWindow, { type: 'question', title: '화면 업데이트',
          message: '새로고침하여 최신 화면으로 업데이트하시겠습니까?',
          detail: '작성 중인 내용을 먼저 저장해주세요. 적용하면 화면이 새로고침되며 저장하지 않은 내용은 사라질 수 있습니다.',
          buttons: ['확인', '취소'], defaultId: 1, cancelId: 1, noLink: true });
        return answer.response === 0;
      },
      reload: () => { if (!pageView.webContents.isDestroyed()) pageView.webContents.reloadIgnoringCache(); },
    });
    pageView.webContents.on('did-finish-load', () => void webUpdater.loadedPage());
    mainWindow.on('focus', () => void webUpdater.check());
    await webUpdater.loadedPage();
    if (!smoke) setInterval(() => void webUpdater.check(), 30000).unref();
    if (app.isPackaged && !smoke) {
      setTimeout(() => void updater.check(), 12000).unref();
      setInterval(() => void updater.check(), 4 * 60 * 60 * 1000).unref();
    }
    if (smoke) await require('./tests/smoke.cjs')({ app, mainWindow, home, contents: pageView.webContents, pageView, tray, notifications, printPreviews, webUpdater, updater });
  }).catch(error => {
    if (smoke) { process.stderr.write(`${error.stack}\n`); app.exit(1); }
    else { dialog.showErrorBox('프로그램 시작 오류', '프로그램을 다시 실행해주세요.\n' + error.message); app.quit(); }
  });
}
