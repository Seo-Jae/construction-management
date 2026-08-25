const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');

function fail(message) {
  console.error('\n[v52.48.4 적용 중단]');
  console.error(message);
  process.exit(1);
}

function replaceUnique(source, oldText, newText, label) {
  const first = source.indexOf(oldText);
  if (first < 0) {
    fail(`${label}: 기준 코드를 찾지 못했습니다.`);
  }
  if (source.indexOf(oldText, first + oldText.length) >= 0) {
    fail(`${label}: 기준 코드가 2개 이상 발견되었습니다.`);
  }
  return source.replace(oldText, newText);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (source.includes("'v52.48.4'")) {
  console.log('[v52.48.4] 이미 적용된 상태입니다.');
  process.exit(0);
}

if (
  !source.includes("'v52.48.3'") ||
  !source.includes("width:\n            mode === 'login' && appMode\n              ? '74.074%'") ||
  !source.includes("transform:\n            mode === 'login' && appMode\n              ? 'scale(1.35)'")
) {
  fail('v52.48.3이 반영된 최신 근태앱 로그인 화면이 필요합니다.');
}

source = replaceUnique(
  source,
`        data-attendance-login-visual-scale={
          mode === 'login' && appMode
            ? 'v52.48.3'
            : undefined
        }`,
`        data-attendance-login-visual-scale={
          mode === 'login' && appMode
            ? 'v52.48.3'
            : undefined
        }
        data-attendance-login-layout-ratio={
          mode === 'login' && appMode
            ? 'v52.48.4'
            : undefined
        }`,
  'v52.48.4 marker',
);

source = replaceUnique(
  source,
`          width:
            mode === 'login' && appMode
              ? '74.074%'
              : '100%',
          mx: 'auto',
          transform:
            mode === 'login' && appMode
              ? 'scale(1.35)'
              : 'none',`,
`          width:
            mode === 'login' && appMode
              ? '67.5%'
              : '100%',
          mx: 'auto',
          transform:
            mode === 'login' && appMode
              ? 'scale(1.36)'
              : 'none',`,
  '네이버 비율 폭 조정',
);

source = replaceUnique(
  source,
`                xs: 'calc(18px + env(safe-area-inset-top))',
                sm: 4,`,
`                xs: 'calc(26px + env(safe-area-inset-top))',
                sm: 4.5,`,
  '상단 여백 보정',
);

source = replaceUnique(
  source,
`              mb: appMode ? 3.6 : 4.2,`,
`              mb: appMode ? 4.4 : 4.2,`,
  '브랜드와 입력 간격 보정',
);

source = replaceUnique(
  source,
`                fontSize: appMode
                  ? '0.86rem'
                  : '0.92rem',
                fontWeight: 700,`,
`                fontSize: appMode
                  ? '0.82rem'
                  : '0.92rem',
                fontWeight: 700,`,
  '보조 서비스명 비율 보정',
);

for (const marker of [
  "'v52.48.4'",
  "'67.5%'",
  "scale(1.36)",
  "xs: 'calc(26px + env(safe-area-inset-top))'",
  "mb: appMode ? 4.4 : 4.2",
]) {
  if (!source.includes(marker)) {
    fail(`적용 후 필수 마커 누락: ${marker}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(
  ROOT,
  `backup_v52.48.4_${stamp}`,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);

fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(TARGET, backup);
fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.48.4 적용 완료]');
console.log('- 근태앱 로그인 화면을 네이버 로그인에 가까운 비율로 재정렬');
console.log('- 전체 시각 확대 유지 + 가로폭 축소');
console.log('- 좌우 여백 확대');
console.log('- 상단 시작 위치 및 제목/입력 간격 재조정');
console.log('- 하단 기능은 기존 근태시스템 로직 유지');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
