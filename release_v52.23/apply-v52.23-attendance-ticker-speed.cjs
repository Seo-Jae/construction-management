const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');
const EXPECTED_GIT_BLOB_SHA = '9d8d5b700cb26c16069903fdf89259b3ae9bcdfa';

function fail(message) {
  console.error('\n[v52.23 적용 중단]');
  console.error(message);
  process.exit(1);
}

function gitBlobSha(content) {
  const body = Buffer.from(content, 'utf8');
  const header = Buffer.from(`blob ${body.length}\0`, 'utf8');
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, body]))
    .digest('hex');
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

const source = fs.readFileSync(TARGET, 'utf8');

const before = `  const durationSeconds = Math.max(
    20,
    Math.min(70, Math.round((contentLength + spacingWeight) * 0.42)),
  );`;

const after = `  const durationSeconds = Math.max(
    14.3,
    Math.min(50, Math.round((contentLength + spacingWeight) * 0.30)),
  );`;

if (source.includes(after)) {
  console.log('[v52.23] 이미 티커 1.4배 속도가 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = gitBlobSha(source);
if (actualSha !== EXPECTED_GIT_BLOB_SHA) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 확인한 최신 운영본과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_GIT_BLOB_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n` +
    '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
  );
}

const count = source.split(before).length - 1;
if (count !== 1) {
  fail(
    `티커 속도 계산 기준 문자열이 ${count}개 발견되었습니다. ` +
    '예상값은 정확히 1개입니다.'
  );
}

const next = source.replace(before, after);

const preservedMarkers = [
  "gap: appMode ? 8 : 6",
  "fontSize: appMode ? '1.08rem' : '0.84rem'",
  "animation: `attendanceNoticeTicker ${durationSeconds}s linear infinite`",
  "'0%': { transform: 'translateX(100vw)' }",
  "'100%': { transform: 'translateX(-100%)' }",
];

for (const marker of preservedMarkers) {
  if (!next.includes(marker)) {
    fail(`기존 티커 기능 보존 검증 실패: ${marker}`);
  }
}

if (!next.includes(after)) {
  fail('새 티커 속도 계산식 적용 검증에 실패했습니다.');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.23_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx'
);
fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);

fs.writeFileSync(TARGET, next, 'utf8');

console.log('\n[v52.23 적용 완료]');
console.log('- 공지 티커 속도: 기존 대비 약 1.4배');
console.log('- 최소 이동시간: 20초 -> 14.3초');
console.log('- 최대 이동시간: 70초 -> 50초');
console.log('- 길이계수: 0.42 -> 0.30');
console.log('- 공지 간격/글씨크기/색상/이동방향 변경 없음');
console.log(`- 백업: ${backupDir}`);
console.log('\nSQL 변경 없음');
console.log('다음 명령: npm run build');
