// Only the local application shell controls updates; no URL or token comes from the web page.
module.exports = function createUpdater({ autoUpdater, enabled, publish, confirmRestart, requestRestart }) {
  let state = { phase: 'idle' };
  let checking = false;
  let confirming = false;
  const send = value => { state = { ...state, ...value }; publish(state); };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.on('checking-for-update', () => send({ phase: 'checking' }));
  autoUpdater.on('update-available', info => send({ phase: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', info => send({ phase: 'downloading', percent: Math.floor(info.percent) }));
  autoUpdater.on('update-not-available', () => send({ phase: 'current' }));
  autoUpdater.on('update-downloaded', info => send({ phase: 'ready', version: info.version, percent: 100 }));
  autoUpdater.on('error', () => send({ phase: 'error' }));
  async function check() {
    if (!enabled) { send({ phase: 'development' }); return; }
    if (checking || ['downloading', 'ready', 'installing'].includes(state.phase)) return;
    checking = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
    } catch { send({ phase: 'error' }); }
    finally { checking = false; }
  }
  async function activate() {
    if (state.phase !== 'ready') return check();
    if (confirming) return;
    confirming = true;
    try {
      if (await confirmRestart(state.version)) requestRestart();
    } finally { confirming = false; }
  }
  function installDownloaded() {
    if (state.phase !== 'ready' || !enabled) return;
    send({ phase: 'installing' });
    autoUpdater.quitAndInstall(true, true);
  }
  return { check, activate, installDownloaded, getState: () => state };
};
