import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const desktopDir = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(path.join(desktopDir, 'package.json'));
const env = { ...process.env };
// IDE terminals can inherit this flag; Electron must start as an application.
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [desktopDir, ...process.argv.slice(2)], { cwd: desktopDir, env, stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
