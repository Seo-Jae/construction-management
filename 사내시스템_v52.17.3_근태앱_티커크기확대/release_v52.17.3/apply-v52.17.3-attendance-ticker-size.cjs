const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');

function fail(message) {
  console.error('\n[v52.17.3 적용 중단]');
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
  console.log('[v52.17.3] 이미 적용된 상태입니다. 추가 변경 없이 종료합니다.');
  process.exit(0);
}

const requiredV52172Markers = [
  "bgcolor: '#ffeb3b',",
  "borderBottom: '1px solid #eab308',",
  "animation: `attendanceNoticeTicker ${durationSeconds}s linear infinite`,",
  "px: appMode ? 0.75 : 2",
  "maxWidth: appMode ? 'none' : 520",
];

for (const marker of requiredV52172Markers) {
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

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.17.3_${stamp}`);
fs.mkdirSync(path.dirname(path.join(backupDir, 'src', 'page')), { recursive: true });
fs.copyFileSync(TARGET, path.join(backupDir, 'src', 'page', 'AttendanceWorkerPortal.jsx'));

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

console.log('\n[v52.17.3 적용 완료]');
console.log('- 티커 높이(앱): 44px -> 56px');
console.log('- 공지 라벨 글씨(앱): 0.82rem -> 1rem');
console.log('- 흐르는 공지 글씨(앱): 0.90rem -> 1.08rem');
console.log('- 공지 라벨 좌우 여백도 함께 확대');
console.log('- 기존 진한 노란색 티커 유지');
console.log(`- 백업: ${backupDir}`);
console.log('\n다음 명령을 실행하세요: npm run build');
