const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFingerprint, createWebUpdater } = require('../web-updater.cjs');
const home = 'https://example.test';
const html = (entry, css = 'one') => `<script type="module" src="/assets/index-${entry}.js"></script><link rel="stylesheet" href="/assets/index-${css}.css">`;

test('fingerprint detects JavaScript and CSS deployments, rejects invalid responses', () => {
  assert.notEqual(buildFingerprint(html('one'), home), buildFingerprint(html('two'), home));
  assert.notEqual(buildFingerprint(html('one'), home), buildFingerprint(html('one', 'two'), home));
  assert.equal(buildFingerprint(html('one'), home), buildFingerprint(html('one') + '<style>body{color:red}</style>', home));
  assert.throws(() => buildFingerprint('<h1>offline</h1>', home));
  assert.throws(() => buildFingerprint('<script type="module" src="https://other.test/assets/index.js"></script>', home));
});

function fixture() {
  let loaded = 'old'; let latest = 'old'; let accept = false; let offline = false;
  const calls = [];
  const controller = createWebUpdater({
    readLoaded: async () => loaded,
    readLatest: async () => { if (offline) throw new Error('offline'); return latest; },
    publish: () => {},
    confirmReload: async () => { calls.push('confirm'); return accept; },
    reload: () => calls.push('reload'),
  });
  return { controller, calls, setLoaded: value => { loaded = value; }, setLatest: value => { latest = value; }, accept: () => { accept = true; }, offline: value => { offline = value; } };
}

test('deployment detection never reloads; cancellation preserves draft until explicit acceptance', async () => {
  const f = fixture(); await f.controller.loadedPage();
  assert.equal(f.controller.getState().phase, 'current');
  f.setLatest('new'); await f.controller.check(); await f.controller.check();
  assert.equal(f.controller.getState().phase, 'available'); assert.deepEqual(f.calls, []);
  await f.controller.activate(); assert.deepEqual(f.calls, ['confirm']);
  assert.equal(f.controller.getState().phase, 'available');
  f.accept(); await f.controller.activate(); assert.deepEqual(f.calls, ['confirm', 'confirm', 'reload']);
  assert.equal(f.controller.getState().phase, 'available', 'Do not claim current until a page actually loads');
  f.setLoaded('new'); await f.controller.loadedPage(); assert.equal(f.controller.getState().phase, 'current');
});

test('offline never claims current and retains known available updates; rollback clears pending state', async () => {
  const f = fixture(); await f.controller.loadedPage(); f.offline(true); await f.controller.check();
  assert.equal(f.controller.getState().phase, 'unknown');
  f.offline(false); f.setLatest('new'); await f.controller.check();
  f.offline(true); await f.controller.check(); assert.equal(f.controller.getState().phase, 'available');
  f.offline(false); f.setLatest('old'); await f.controller.check(); assert.equal(f.controller.getState().phase, 'current');
});

test('a stale check cannot replace state for a newly loaded page', async () => {
  let resolve; let delayed = false; let loaded = 'old';
  const controller = createWebUpdater({ readLoaded: async () => loaded, readLatest: () => delayed ? new Promise(done => { resolve = done; }) : Promise.resolve('old'), publish: () => {}, confirmReload: async () => false, reload: () => assert.fail('Unexpected reload') });
  await controller.loadedPage(); delayed = true; const pending = controller.check();
  loaded = 'new'; await controller.loadedPage(); resolve('old'); await pending;
  assert.equal(controller.getState().phase, 'unknown');
});

test('toolbar shows only web updates even when a native installer is ready', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const button = { dataset: {} };
  let onUpdate;
  vm.runInNewContext(fs.readFileSync(require.resolve('../chrome/toolbar.js'), 'utf8'), {
    document: { querySelectorAll: () => [], getElementById: () => button },
    window: { desktopChrome: { onState: () => {}, onUpdate: callback => { onUpdate = callback; } } },
  });
  onUpdate({ phase: 'current', web: { phase: 'available' } });
  assert.equal(button.textContent, '업데이트 필요'); assert.equal(button.disabled, false); assert.equal(button.dataset.pending, 'true');
  onUpdate({ phase: 'downloading', web: { phase: 'available' } });
  assert.equal(button.textContent, '업데이트 필요'); assert.equal(button.disabled, false);
  onUpdate({ phase: 'current', web: { phase: 'unknown' } }); assert.equal(button.textContent, '업데이트 확인');
  onUpdate({ phase: 'current', web: { phase: 'current' } }); assert.equal(button.textContent, '최신 버전');
  onUpdate({ phase: 'ready', web: { phase: 'available' } }); assert.equal(button.textContent, '업데이트 필요'); assert.equal(button.disabled, false);
  onUpdate({ phase: 'ready', web: { phase: 'current' } }); assert.equal(button.textContent, '최신 버전'); assert.equal(button.dataset.pending, 'false');
});
