const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const createUpdater = require('../updater.cjs');
function fixture(enabled = true) {
  const engine = new EventEmitter();
  const calls = [];
  engine.checkForUpdates = async () => { calls.push('check'); engine.emit('checking-for-update'); engine.emit('update-not-available'); return {}; };
  engine.quitAndInstall = (...args) => calls.push(['install', ...args]);
  const options = { autoUpdater: engine, enabled, publish: () => {}, confirmRestart: async () => false, requestRestart: () => calls.push('restart') };
  const controller = createUpdater(options);
  return { engine, calls, options, controller };
}
test('development builds never contact the update server or install', async () => {
  const f = fixture(false); await f.controller.check(); f.controller.installDownloaded();
  assert.deepEqual(f.calls, []);
  assert.equal(f.controller.getState().phase, 'development');
});
test('downloaded update waits for explicit restart and never installs on ordinary quit', async () => {
  const f = fixture();
  assert.equal(f.engine.autoInstallOnAppQuit, false);
  assert.equal(f.engine.allowDowngrade, false);
  assert.equal(f.engine.autoDownload, true);
  f.engine.emit('update-available', { version: '0.2.0' });
  f.engine.emit('download-progress', { percent: 42.8 });
  assert.equal(f.controller.getState().percent, 42);
  f.engine.emit('update-downloaded', { version: '0.2.0' });
  await f.controller.activate();
  assert.deepEqual(f.calls, []);
  f.controller.installDownloaded();
  assert.deepEqual(f.calls, [['install', true, true]]);
});
test('check errors remain retryable and concurrent requests do not start duplicate checks', async () => {
  const f = fixture();
  let reject;
  f.engine.checkForUpdates = () => { f.calls.push('check'); return new Promise((_resolve, fail) => { reject = fail; }); };
  const first = f.controller.check(); await f.controller.check();
  reject(new Error('offline')); await first;
  assert.deepEqual(f.calls, ['check']);
  assert.equal(f.controller.getState().phase, 'error');
  f.engine.checkForUpdates = async () => { f.calls.push('retry'); f.engine.emit('update-not-available'); };
  await f.controller.check(); assert.equal(f.controller.getState().phase, 'current');
});
test('restart confirmation requests graceful exit before installer execution', async () => {
  const engine = new EventEmitter(); let restarts = 0; let installs = 0;
  engine.quitAndInstall = () => { installs += 1; };
  const controller = createUpdater({ autoUpdater: engine, enabled: true, publish: () => {}, confirmRestart: async () => true, requestRestart: () => { restarts += 1; } });
  engine.emit('update-downloaded', { version: '0.2.0' });
  await controller.activate(); assert.equal(restarts, 1); assert.equal(installs, 0);
  controller.installDownloaded(); assert.equal(installs, 1);
});
