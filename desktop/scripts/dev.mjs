import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const root = path.dirname(desktopDir);
const require = createRequire(path.join(desktopDir, 'package.json'));
const electron = require('electron');
const url = 'http://127.0.0.1:5174';
const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5174', '--strictPort'], { cwd: root, stdio: 'inherit', windowsHide: true });
let application;
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  application?.kill();
  server.kill();
  process.exitCode = code;
}
server.on('exit', code => { if (!closing) stop(code || 1); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && !closing; attempt += 1) {
    try { ready = (await fetch(url, { signal: AbortSignal.timeout(500) })).ok; } catch { /* Vite is starting. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!closing) {
    if (!ready) throw new Error('개발 서버를 시작하지 못했습니다.');
    const env = { ...process.env, WOOKLIM_DESKTOP_DEV_URL: url };
    delete env.ELECTRON_RUN_AS_NODE;
    application = spawn(electron, [desktopDir], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    application.on('error', error => { console.error(error.message); stop(1); });
    application.on('exit', code => stop(code || 0));
  }
} catch (error) { console.error(error.message); stop(1); }
