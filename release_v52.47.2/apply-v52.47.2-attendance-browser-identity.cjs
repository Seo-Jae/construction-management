const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'main.jsx');
const SOURCE = path.join(__dirname, 'src', 'main.jsx');
const EXPECTED_SHA = '9ad031f71e81874bd7260019916340c1df9453c3';

function fail(message) {
  console.error('\n[v52.47.2 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

if (!fs.existsSync(SOURCE)) {
  fail(`릴리즈 원본 파일을 찾을 수 없습니다: ${SOURCE}`);
}

const currentBuffer = fs.readFileSync(TARGET);
const currentText = currentBuffer.toString('utf8');

if (
  currentText.includes("'욱림건설 근태시스템'") &&
  currentText.includes("'/attendance-icon-192.png'") &&
  currentText.includes('syncBrowserIdentity')
) {
  console.log('[v52.47.2] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = blobSha(currentBuffer);
if (actualSha !== EXPECTED_SHA) {
  fail(
    '현재 src/main.jsx가 최신 main 기준과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    'git status를 확인한 뒤 다시 시도해주세요.'
  );
}

const nextText = fs.readFileSync(SOURCE, 'utf8');

for (const marker of [
  "queryParams.get('view') === 'attendance-worker'",
  "'욱림건설 근태시스템'",
  "'/attendance-icon-192.png'",
  "'/wooklim-favicon.png'",
  'syncBrowserIdentity()',
]) {
  if (!nextText.includes(marker)) {
    fail(`릴리즈 파일 검증 실패: ${marker}`);
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const backup = path.join(
  ROOT,
  `backup_v52.47.2_${stamp}`,
  'src',
  'main.jsx',
);

fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(TARGET, backup);
fs.copyFileSync(SOURCE, TARGET);

console.log('\n[v52.47.2 적용 완료]');
console.log('- 근태앱 브라우저 탭 제목: 욱림건설 근태시스템');
console.log('- 근태앱 브라우저 탭 아이콘: attendance-icon-192.png');
console.log('- 설치 앱 manifest 이름/아이콘은 기존 근태앱 전용 설정 유지');
console.log('- 일반 통합관리시스템은 기존 제목/빨간 욱림 파비콘 유지');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
