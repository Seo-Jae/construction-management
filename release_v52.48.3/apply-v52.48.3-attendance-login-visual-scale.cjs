const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);
const EXPECTED_SHA = '93fd82ecb554af5202a118de5106c5379f88d608';

function fail(message) {
  console.error('\n[v52.48.3 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header = Buffer.from(
    `blob ${buffer.length}\0`,
  );

  return crypto
    .createHash('sha1')
    .update(
      Buffer.concat([
        header,
        buffer,
      ]),
    )
    .digest('hex');
}

function replaceUnique(
  source,
  oldText,
  newText,
  label,
) {
  const first = source.indexOf(oldText);

  if (first < 0) {
    fail(`${label}: 기준 코드를 찾지 못했습니다.`);
  }

  if (
    source.indexOf(
      oldText,
      first + oldText.length,
    ) >= 0
  ) {
    fail(`${label}: 기준 코드가 2개 이상 발견되었습니다.`);
  }

  return source.replace(
    oldText,
    newText,
  );
}

if (!fs.existsSync(TARGET)) {
  fail(
    `대상 파일을 찾을 수 없습니다: ${TARGET}`,
  );
}

const currentBuffer =
  fs.readFileSync(TARGET);

let source =
  currentBuffer.toString('utf8');

if (
  source.includes(
    "'v52.48.3'",
  )
) {
  console.log(
    '[v52.48.3] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

if (
  !source.includes(
    "'v52.48.2.1'",
  ) ||
  !source.includes(
    "cleanLogin={mode === 'login'}",
  )
) {
  fail(
    'v52.48.2.1까지 반영된 최신 로그인 화면이 필요합니다.',
  );
}

const actualSha =
  blobSha(currentBuffer);

if (
  actualSha !== EXPECTED_SHA
) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 최신 main 기준과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    'git status를 확인한 뒤 다시 시도해주세요.',
  );
}

// 기존 marker는 그대로 두고 실제 확대 marker를 추가한다.
source = replaceUnique(
  source,
`        data-attendance-login-scale={
          mode === 'login'
            ? 'v52.48.2.1'
            : undefined
        }`,
`        data-attendance-login-scale={
          mode === 'login'
            ? 'v52.48.2.1'
            : undefined
        }
        data-attendance-login-visual-scale={
          mode === 'login' && appMode
            ? 'v52.48.3'
            : undefined
        }`,
  'v52.48.3 marker',
);

// 핵심:
// 설치앱 로그인 화면에서 Paper 자체의 layout width를 1/1.35로 줄이고,
// transform scale(1.35)하여 최종 보이는 가로폭은 현재와 거의 동일하게 유지한다.
// 대신 텍스트/입력/버튼/간격은 전부 눈에 보이게 35% 확대된다.
source = replaceUnique(
  source,
`          bgcolor: '#ffffff',
          boxShadow: 'none',
        }}`,
`          bgcolor: '#ffffff',
          boxShadow: 'none',
          width:
            mode === 'login' && appMode
              ? '74.074%'
              : '100%',
          mx: 'auto',
          transform:
            mode === 'login' && appMode
              ? 'scale(1.35)'
              : 'none',
          transformOrigin: 'top center',
        }}`,
  '로그인 전체 1.35배 확대',
);

// 1.35배 확대 후 화면 상단 시작점이 너무 내려가지 않도록
// cleanLogin top padding을 조금 더 줄인다.
source = replaceUnique(
  source,
`                xs: 'calc(28px + env(safe-area-inset-top))',
                sm: 5,`,
`                xs: 'calc(18px + env(safe-area-inset-top))',
                sm: 4,`,
  '로그인 시작 위치 조정',
);

// 원하는 레퍼런스처럼 제목과 첫 입력의 간격을 조금 줄인다.
source = replaceUnique(
  source,
`              mb: appMode ? 4.7 : 4.2,`,
`              mb: appMode ? 3.6 : 4.2,`,
  '브랜드-입력 간격 조정',
);

// 레퍼런스 화면에는 별도 서비스명 설명이 없기 때문에,
// 설치앱에서는 작은 보조 문구를 더 작고 짧게 유지하여
// 로그인 자체에 시선이 모이도록 한다.
source = replaceUnique(
  source,
`                fontSize: appMode
                  ? '1.02rem'
                  : '0.92rem',
                fontWeight: 700,`,
`                fontSize: appMode
                  ? '0.86rem'
                  : '0.92rem',
                fontWeight: 700,`,
  '보조문구 비중 조정',
);

for (const marker of [
  "'v52.48.3'",
  "scale(1.35)",
  "'74.074%'",
  "xs: 'calc(18px + env(safe-area-inset-top))'",
]) {
  if (!source.includes(marker)) {
    fail(
      `적용 결과 필수 마커 누락: ${marker}`,
    );
  }
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backup =
  path.join(
    ROOT,
    `backup_v52.48.3_${stamp}`,
    'src',
    'page',
    'AttendanceWorkerPortal.jsx',
  );

fs.mkdirSync(
  path.dirname(backup),
  { recursive: true },
);

fs.copyFileSync(
  TARGET,
  backup,
);

fs.writeFileSync(
  TARGET,
  source,
  'utf8',
);

console.log('\n[v52.48.3 적용 완료]');
console.log('- 미세 px 조정을 중단하고 설치앱 로그인 UI 전체 1.35배 확대');
console.log('- 최종 가로폭은 기존과 거의 동일하게 유지');
console.log('- W/로그인/입력칸/버튼/간격 모두 35% 확대');
console.log('- 로그인 시작 위치 추가 상향');
console.log('- 관리자 QR/가입/로그인 로직 변경 없음');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
