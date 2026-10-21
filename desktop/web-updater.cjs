// Compare the actual loaded Vite entry assets with the current public deployment.
// Never navigate or discard a draft while checking for updates.
function buildFingerprint(html, home) {
  const assets = [];
  let hasEntry = false;
  for (const tag of String(html).match(/<(?:script|link)\b[^>]*>/gi) || []) {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]]));
    const script = /^<script\b/i.test(tag) && attrs.type === 'module';
    const style = /^<link\b/i.test(tag) && attrs.rel === 'stylesheet';
    if (!script && !style) continue;
    const url = new URL(script ? attrs.src || '' : attrs.href || '', home);
    if (url.origin !== new URL(home).origin || !url.pathname.startsWith('/assets/')) continue;
    assets.push(url.pathname + url.search);
    if (script) hasEntry = true;
  }
  if (!hasEntry) throw new Error('Deployment entry asset is missing');
  return JSON.stringify([...new Set(assets)].sort());
}

function createWebUpdater({ readLoaded, readLatest, publish, confirmReload, reload }) {
  let state = { phase: 'unknown' };
  let loaded = null;
  let generation = 0;
  let checking = false;
  let confirming = false;
  const send = value => { state = { ...state, ...value }; publish(state); };
  async function check() {
    if (checking || !loaded) return;
    const expectedGeneration = generation;
    checking = true;
    try {
      const latest = await readLatest();
      if (generation === expectedGeneration) send({ phase: latest === loaded ? 'current' : 'available' });
    } catch {
      // Keep a known pending update visible while offline.
      if (generation === expectedGeneration && state.phase !== 'available') send({ phase: 'unknown' });
    } finally { checking = false; }
  }
  async function loadedPage() {
    const expectedGeneration = ++generation;
    loaded = null;
    send({ phase: 'unknown' });
    try {
      const version = await readLoaded();
      if (generation !== expectedGeneration) return;
      loaded = version;
      await check();
    } catch {
      if (generation === expectedGeneration) send({ phase: 'unknown' });
    }
  }
  async function activate() {
    if (state.phase !== 'available') return check();
    if (confirming) return;
    confirming = true;
    try {
      if (await confirmReload()) await reload();
    } finally { confirming = false; }
  }
  return { check, loadedPage, activate, getState: () => state };
}

module.exports = { buildFingerprint, createWebUpdater };
