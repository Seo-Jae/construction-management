// End-to-end public release download in a throwaway profile. Never installs.
const { app } = require('electron');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');
app.setPath('userData', path.join(os.tmpdir(), `wooklim-update-check-${process.pid}`));
app.whenReady().then(async () => {
  let server;
  let configPath = path.join(__dirname, '../out/win-unpacked/resources/app-update.yml');
  if (process.argv.includes('--local')) {
    // Loopback-only fixture; no artifact is uploaded or made public.
    const http = require('node:http');
    const out = path.join(__dirname, '../out');
    const version = require('../package.json').version;
    const allowed = new Set(['latest.yml', `Wooklim-Setup-${version}-x64.exe`, `Wooklim-Setup-${version}-x64.exe.blockmap`]);
    server = http.createServer((request, response) => {
      const name = new URL(request.url, 'http://127.0.0.1').pathname.slice(1);
      if (!allowed.has(name)) { response.writeHead(404).end(); return; }
      const file = path.join(out, name);
      response.writeHead(200, { 'Content-Length': fs.statSync(file).size });
      fs.createReadStream(file).pipe(response);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    configPath = path.join(app.getPath('userData'), 'update-test.yml');
    fs.writeFileSync(configPath, `provider: generic\nurl: http://127.0.0.1:${server.address().port}/\nupdaterCacheDirName: isolated-test\n`);
  }
  const { NsisUpdater } = require('electron-updater');
  const updater = new NsisUpdater();
  Object.defineProperty(updater.app, 'baseCachePath', { value: app.getPath('userData') });
  const updaterRequire = require('node:module').createRequire(require.resolve('electron-updater'));
  updater.currentVersion = updaterRequire('semver').parse('0.1.8');
  updater.forceDevUpdateConfig = true;
  updater.updateConfigPath = configPath;
  updater.autoInstallOnAppQuit = false;
  updater.disableWebInstaller = true;
  updater.disableDifferentialDownload = true;
  updater.quitAndInstall = () => { throw new Error('Test must never install'); };
  updater.logger = null;
  const result = await updater.checkForUpdates();
  const files = await result.downloadPromise;
  const actual = crypto.createHash('sha512').update(fs.readFileSync(files[0])).digest('base64');
  if (actual !== result.updateInfo.files[0].sha512) throw new Error('Downloaded checksum mismatch');
  console.log(JSON.stringify({ passed: true, version: result.updateInfo.version, downloaded: fs.statSync(files[0]).size, checksumVerified: true, installed: false }));
  server?.close();
  app.exit(0);
}).catch(error => { console.error(error.message); app.exit(1); });
