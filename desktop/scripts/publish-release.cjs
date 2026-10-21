// Run only for an explicitly requested desktop release. Credentials stay in memory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const yaml = require('js-yaml');
const root = path.join(__dirname, '..');
const version = require('../package.json').version;
const repo = 'Seo-Jae/construction-management';
async function main() {
  const out = path.join(root, 'out');
  const manifest = yaml.load(fs.readFileSync(path.join(out, 'latest.yml'), 'utf8'));
  const installer = `Wooklim-Setup-${version}-x64.exe`;
  const bytes = fs.readFileSync(path.join(out, installer));
  const expected = crypto.createHash('sha512').update(bytes).digest('base64');
  if (manifest.version !== version || manifest.files?.[0]?.url !== installer || manifest.files[0].sha512 !== expected || !manifest.files[0].isAdminRightsRequired) throw new Error('Release metadata or administrator elevation is invalid.');
  const raw = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }, stdio: ['pipe', 'pipe', 'ignore'] });
  const credential = Object.fromEntries(raw.trim().split('\n').map(line => { const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)]; }));
  if (!credential.password) throw new Error('GitHub publishing authentication is unavailable.');
  const headers = { Authorization: `Bearer ${credential.password}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Wooklim-Desktop-Release' };
  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) throw new Error(`GitHub release request failed (${response.status})`);
    return response.json();
  }
  const releases = await api(`https://api.github.com/repos/${repo}/releases?per_page=100`);
  const tag = `v${version}`;
  if (releases.some(item => item.tag_name === tag)) throw new Error(`${tag} already exists; existing releases are never overwritten.`);
  const release = await api(`https://api.github.com/repos/${repo}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tag_name: tag, target_commitish: 'main', name: `욱림건설 통합관리 ${version}`, draft: true, prerelease: false, body: '웹 화면 배포 변경을 30초 간격으로 확인하여 상단에 업데이트 필요를 표시합니다. 자동 새로고침 없이 작업 저장 안내와 사용자 확인 후 새 화면을 적용합니다. 0.1.9 사용자는 프로그램의 업데이트 확인 기능으로 설치할 수 있습니다.' }) });
  for (const name of [installer, `${installer}.blockmap`, 'latest.yml']) {
    const body = fs.readFileSync(path.join(out, name));
    await api(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body });
    console.log(`Uploaded ${name}`);
  }
  const result = await api(release.url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, make_latest: 'true' }) });
  console.log(`Published ${result.html_url}`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
