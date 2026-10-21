const PRODUCTION_URL = 'https://wooklim-construction-management.vercel.app';

function appUrl(packaged, devUrl) {
  if (packaged || !devUrl) return PRODUCTION_URL;
  const url = new URL(devUrl);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.username || url.password) {
    throw new Error('개발 서버는 localhost 또는 127.0.0.1만 사용할 수 있습니다.');
  }
  return url.origin;
}

function isAppUrl(value, home) {
  try {
    const url = new URL(value);
    return !url.username && !url.password && ['https:', 'http:'].includes(url.protocol) && url.origin === new URL(home).origin;
  } catch { return false; }
}

function isInternalPopup(value, home) {
  if (value === 'about:blank' || value === '') return true;
  if (isAppUrl(value, home)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'blob:' && isAppUrl(url.pathname, home);
  } catch { return false; }
}

function externalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

module.exports = { PRODUCTION_URL, appUrl, isAppUrl, isInternalPopup, externalUrl };
