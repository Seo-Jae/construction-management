// One-time local repair of shortcuts created by this project's old smoke tests.
const { app, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(() => {
  const folder = path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs');
  const backup = path.join(__dirname, '../out/shortcut-backups');
  fs.mkdirSync(backup, { recursive: true });
  const developmentExe = path.resolve(__dirname, '../node_modules/electron/dist/electron.exe');
  const installedExe = path.join(process.env.ProgramFiles, 'WooklimConstruction/WooklimConstruction.exe');
  const fixes = [
    { name: 'Electron.lnk', target: developmentExe, details: { appUserModelId: 'kr.co.wooklim.construction.development', icon: path.resolve(__dirname, '../assets/app.ico'), iconIndex: 0 } },
    { name: '욱림건설 통합관리.lnk', target: installedExe, details: { icon: installedExe, iconIndex: 0 } },
  ];
  for (const fix of fixes) {
    const filename = path.join(folder, fix.name);
    if (!fs.existsSync(filename)) continue;
    const shortcut = shell.readShortcutLink(filename);
    if (shortcut.appUserModelId !== 'kr.co.wooklim.construction' || path.resolve(shortcut.target).toLowerCase() !== fix.target.toLowerCase()) continue;
    fs.copyFileSync(filename, path.join(backup, `${Date.now()}-${fix.name}`));
    if (!shell.writeShortcutLink(filename, 'update', fix.details)) throw new Error(`Shortcut repair failed: ${fix.name}`);
    const checked = shell.readShortcutLink(filename);
    console.log(JSON.stringify({ shortcut: fix.name, appId: checked.appUserModelId, icon: checked.icon }));
  }
  app.exit(0);
}).catch(error => { console.error(error.message); app.exit(1); });
