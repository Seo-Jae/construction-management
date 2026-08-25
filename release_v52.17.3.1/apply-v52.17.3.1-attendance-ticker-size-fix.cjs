const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');

function fail(message) {
  console.error('\n[v52.17.3.1 적용 중단]');
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

const source = fs.readFileSync(TARGET, 'utf8');

const replacements = [
  {
    name: '티커 전체 높이',
    before: "minHeight: appMode ? 44 : 38,",
    after: "minHeight: appMode ? 56 : 42,",
  },
  {
    name: '공지 라벨 좌우 여백',
    before: "px: appMode ? 1.6 : 1.3,",
    after: "px: appMode ? 2 : 1.5,",
  },
  {
    name: '공지 라벨 글씨',
    before: "fontSize: appMode ? '0.82rem' : '0.7rem',",
    after: "fontSize: appMode ? '1rem' : '0.78rem',",
  },
  {
    name: '흐르는 공지 글씨',
    before: "fontSize: appMode ? '0.9rem' : '0.76rem',",
    after: "fontSize: appMode ? '1.08rem' : '0.84rem',",
  },
];

const alreadyApplied = replacements.every(({ after }) => source.includes(after));
if (alreadyApplied) {
  console.log('[v52.17.3.1] 티커 확대가 이미 적용된 상태입니다.');
  process.exit(0);
}

const requiredMarkers = [
  "bgcolor: '#ffeb3b',",
  "borderBottom: '1px solid #eab308',",
  "animation: `attendanceNoticeTicker ${durationSeconds}s linear infinite`,",
  "px: appMode ? 0.75 : 2",
  "maxWidth: appMode ? 'none' : 520",
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    fail(
      '현재 AttendanceWorkerPortal.jsx가 예상한 v52.17.2 기준과 다릅니다.\n' +
      `누락 기준: ${marker}\n` +
      '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
    );
  }
}

for (const item of replacements) {
  const count = source.split(item.before).length - 1;
  if (count !== 1) {
    fail(`${item.name} 기준 문자열이 ${count}개 발견되었습니다. 예상값은 정확히 1개입니다.`);
  }
}

// v52.17.3의 버그 수정:
// copyFile 대상인 backup/.../src/page 폴더 자체를 먼저 만든다.
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.17.3.1_${stamp}`);
const backupPageDir = path.join(backupDir, 'src', 'page');
fs.mkdirSync(backupPageDir, { recursive: true });
fs.copyFileSync(TARGET, path.join(backupPageDir, 'AttendanceWorkerPortal.jsx'));

let next = source;
for (const item of replacements) {
  next = next.replace(item.before, item.after);
}

for (const { after, name } of replacements) {
  if (!next.includes(after)) {
    fail(`적용 후 검증 실패: ${name}`);
  }
}

fs.writeFileSync(TARGET, next, 'utf8');

console.log('\n[v52.17.3.1 적용 완료]');
console.log('- 티커 높이(앱): 44px -> 56px');
console.log('- 공지 라벨 글씨(앱): 0.82rem -> 1.00rem');
console.log('- 흐르는 공지 글씨(앱): 0.90rem -> 1.08rem');
console.log('- 공지 라벨 좌우 여백 확대');
console.log('- 기존 진한 노란색 유지');
console.log(`- 백업: ${backupDir}`);
console.log('\n다음 순서: npm install --legacy-peer-deps -> npm run build');
