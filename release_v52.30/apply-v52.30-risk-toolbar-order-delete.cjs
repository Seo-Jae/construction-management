const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = path.join(ROOT, 'release_v52.30');
const TARGET = path.join(ROOT, 'src', 'page', 'RiskBroadcastManagement.jsx');
const SOURCE = path.join(RELEASE, 'src', 'page', 'RiskBroadcastManagement.jsx');
const EXPECTED = '2c3a8a0431b42fbeb9dc48db0cfc6fedabe2edd2';

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

function fail(message) {
  console.error('\n[v52.30 적용 중단]');
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

if (!fs.existsSync(SOURCE)) {
  fail(`배포 파일을 찾을 수 없습니다: ${SOURCE}`);
}

const currentText = fs.readFileSync(TARGET, 'utf8');

if (
  currentText.includes('attendance_risk_management_v52_30') &&
  currentText.includes('attendance_move_risk_broadcasts_v52_30') &&
  currentText.includes('attendance_delete_risk_broadcasts_v52_30')
) {
  console.log('[v52.30] 이미 프로그램 파일이 적용된 상태입니다.');
  process.exit(0);
}

const actual = blobSha(fs.readFileSync(TARGET));

if (actual !== EXPECTED) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    `src/page/RiskBroadcastManagement.jsx\n` +
    `예상 Git blob SHA: ${EXPECTED}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 최신 main과 다른 상태입니다. git status를 확인해주세요.'
  );
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.30_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'RiskBroadcastManagement.jsx'
);

fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);
fs.copyFileSync(SOURCE, TARGET);

const nextText = fs.readFileSync(TARGET, 'utf8');

const required = [
  'attendance_risk_management_v52_30',
  'attendance_move_risk_broadcasts_v52_30',
  'attendance_delete_risk_broadcasts_v52_30',
  '중점위험요인 전체 선택',
  '중점위험요인 등록',
  '선택 중점위험요인 삭제',
  '중점위험요인 위로 이동',
  '중점위험요인 아래로 이동',
  '전파 종료',
];

for (const marker of required) {
  if (!nextText.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

console.log('\n[v52.30 적용 완료]');
console.log('- 중점위험요인 관리 상단 바 추가');
console.log('- 추가 / 다중선택 / 삭제 / 위로 / 아래로 기능 추가');
console.log('- 기존 공통/현장 전파 권한 유지');
console.log('- 기존 전파 종료 기능 유지');
console.log(`- 백업: ${backupDir}`);
console.log('');
console.log('주의: Supabase SQL도 실행해야 순서/삭제 기능이 동작합니다.');
console.log('다음 명령: npm run build');
