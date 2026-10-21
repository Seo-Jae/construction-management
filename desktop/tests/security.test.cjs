const test = require('node:test');
const assert = require('node:assert/strict');
const { PRODUCTION_URL: home, appUrl, isAppUrl, isInternalPopup, externalUrl } = require('../security.cjs');

test('packaged app cannot be redirected by a development environment variable', () => {
  assert.equal(appUrl(true, 'http://attacker.example'), home);
  assert.equal(appUrl(false, 'http://127.0.0.1:5174'), 'http://127.0.0.1:5174');
  for (const url of ['http://attacker.example', 'file:///C:/test', 'https://localhost', 'http://user@localhost:5174']) assert.throws(() => appUrl(false, url));
});
test('only the exact site origin can navigate within the application', () => {
  assert.ok(isAppUrl(`${home}/?view=messenger`, home));
  for (const url of [`${home}.evil.example`, `${home.replace('https:', 'http:')}`, 'https://wooklim-construction-management.vercel.app@evil.example', 'file:///C:/Windows', 'javascript:alert(1)', 'data:text/html,test']) assert.equal(isAppUrl(url, home), false);
});
test('existing blank print/edit windows and same-origin blob previews are supported', () => {
  for (const url of ['about:blank', '', `${home}/?view=messenger`, `blob:${home}/example`]) assert.ok(isInternalPopup(url, home));
  for (const url of ['blob:https://evil.example/example', 'blob:null/example', 'file:///C:/secret', 'data:text/html,test']) assert.equal(isInternalPopup(url, home), false);
});
test('external opening never sends local files or OS protocols to the shell', () => {
  assert.equal(externalUrl('https://example.com/document.pdf'), 'https://example.com/document.pdf');
  for (const url of ['file:///C:/test.exe', 'ms-settings:privacy', 'javascript:alert(1)', 'https://user:pass@example.com', 'http://example.com']) assert.equal(externalUrl(url), null);
});
