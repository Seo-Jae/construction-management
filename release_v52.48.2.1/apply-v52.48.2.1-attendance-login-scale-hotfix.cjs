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
const EXPECTED_SHA = 'ec519253552588be530818f66a2ef3f2f307a5cd';

function fail(message) {
  console.error('\n[v52.48.2.1 적용 중단]');
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
    fail(
      `${label}: 기준 코드를 찾지 못했습니다.`,
    );
  }

  if (
    source.indexOf(
      oldText,
      first + oldText.length,
    ) >= 0
  ) {
    fail(
      `${label}: 기준 코드가 2개 이상 발견되었습니다.`,
    );
  }

  return source.replace(
    oldText,
    newText,
  );
}

function replaceAfterAnchor(
  source,
  anchor,
  oldText,
  newText,
  label,
) {
  const anchorIndex =
    source.indexOf(anchor);

  if (anchorIndex < 0) {
    fail(
      `${label}: 기준 입력칸을 찾지 못했습니다.`,
    );
  }

  const nextIndex =
    source.indexOf(
      oldText,
      anchorIndex,
    );

  if (nextIndex < 0) {
    fail(
      `${label}: 입력칸 내부 스타일을 찾지 못했습니다.`,
    );
  }

  return (
    source.slice(0, nextIndex) +
    newText +
    source.slice(
      nextIndex + oldText.length,
    )
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
    "'v52.48.2.1'",
  )
) {
  console.log(
    '[v52.48.2.1] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

if (
  !source.includes(
    "cleanLogin={mode === 'login'}",
  ) ||
  !source.includes(
    "data-attendance-login-ui",
  )
) {
  fail(
    'v52.48.1 로그인 UI가 먼저 반영되어 있어야 합니다.',
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

// 1. 로그인 화면이 화면 폭을 더 많이 사용하도록 조정.
source = replaceUnique(
  source,
`          px: cleanLogin
            ? { xs: 4, sm: 5 }
            : appMode
              ? 0.75
              : 2,
          pt: cleanLogin
            ? {
                xs: 'calc(56px + env(safe-area-inset-top))',
                sm: 7,
              }
            : appMode
              ? 2.5
              : 2,`,
`          px: cleanLogin
            ? { xs: 2.5, sm: 4 }
            : appMode
              ? 0.75
              : 2,
          pt: cleanLogin
            ? {
                xs: 'calc(28px + env(safe-area-inset-top))',
                sm: 5,
              }
            : appMode
              ? 2.5
              : 2,`,
  '로그인 화면 여백',
);

// 2. 버전 marker.
source = replaceUnique(
  source,
`        data-attendance-login-ui={
          mode === 'login'
            ? 'v52.48.1'
            : undefined
        }`,
`        data-attendance-login-ui={
          mode === 'login'
            ? 'v52.48.1'
            : undefined
        }
        data-attendance-login-scale={
          mode === 'login'
            ? 'v52.48.2.1'
            : undefined
        }`,
  'v52.48.2.1 marker',
);

// 3. 상단 브랜드 영역 확대.
source = replaceUnique(
  source,
`          <Box sx={{ mb: appMode ? 6 : 5 }}>`,
`          <Box
            sx={{
              mb: appMode ? 4.7 : 4.2,
            }}
          >`,
  '로그인 헤더 간격',
);

source = replaceUnique(
  source,
`                  fontSize: appMode
                    ? '3rem'
                    : '2.7rem',`,
`                  fontSize: appMode
                    ? '3.35rem'
                    : '3rem',`,
  'W 확대',
);

source = replaceUnique(
  source,
`                  fontSize: appMode
                    ? '2.15rem'
                    : '2rem',`,
`                  fontSize: appMode
                    ? '2.4rem'
                    : '2.2rem',`,
  '로그인 제목 확대',
);

source = replaceUnique(
  source,
`                mt: 1.1,
                color: '#64748b',
                fontSize: appMode
                  ? '0.95rem'
                  : '0.86rem',`,
`                mt: 0.85,
                color: '#64748b',
                fontSize: appMode
                  ? '1.02rem'
                  : '0.92rem',`,
  '근태시스템 제목 확대',
);

// 4. 휴대폰 입력칸.
// 전체 파일에서 같은 style이 2개여도 상관없이
// placeholder="휴대폰번호" 뒤의 첫 style만 수정.
source = replaceAfterAnchor(
  source,
  'placeholder="휴대폰번호"',
`                  minHeight: appMode
                    ? 70
                    : 66,
                  px: 1,
                  fontSize: appMode
                    ? '1.18rem'
                    : '1.08rem',`,
`                  minHeight: appMode
                    ? 78
                    : 74,
                  px: 0.75,
                  fontSize: appMode
                    ? '1.3rem'
                    : '1.2rem',`,
  '휴대폰 입력 확대',
);

// 5. 비밀번호 입력칸.
// 비밀번호 anchor 뒤의 style만 별도로 수정.
source = replaceAfterAnchor(
  source,
  'placeholder="비밀번호"',
`                mt: appMode ? 2.4 : 2,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 70
                    : 66,
                  px: 1,
                  fontSize: appMode
                    ? '1.18rem'
                    : '1.08rem',`,
`                mt: appMode ? 2.05 : 1.8,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 78
                    : 74,
                  px: 0.75,
                  fontSize: appMode
                    ? '1.3rem'
                    : '1.2rem',`,
  '비밀번호 입력 확대',
);

// 6. 로그인 버튼 확대.
source = replaceUnique(
  source,
`                mt: appMode ? 5.2 : 4.5,
                minHeight: appMode
                  ? 64
                  : 60,
                borderRadius: 2.2,
                bgcolor: APP_BRAND_GREEN,
                color: '#ffffff',
                fontSize: appMode
                  ? '1.15rem'
                  : '1.05rem',`,
`                mt: appMode ? 4.6 : 4,
                minHeight: appMode
                  ? 72
                  : 68,
                borderRadius: 2.1,
                bgcolor: APP_BRAND_GREEN,
                color: '#ffffff',
                fontSize: appMode
                  ? '1.28rem'
                  : '1.16rem',`,
  '로그인 버튼 확대',
);

// 7. 가입신청 버튼 확대.
source = replaceUnique(
  source,
`                mt: 1.5,
                minHeight: appMode
                  ? 58
                  : 54,
                borderRadius: 2.2,
                borderColor: '#e5e7eb',
                bgcolor: '#f8fafc',
                color: '#1f2937',
                fontSize: appMode
                  ? '1rem'
                  : '0.94rem',`,
`                mt: 1.35,
                minHeight: appMode
                  ? 66
                  : 62,
                borderRadius: 2.1,
                borderColor: '#e5e7eb',
                bgcolor: '#f8fafc',
                color: '#1f2937',
                fontSize: appMode
                  ? '1.1rem'
                  : '1rem',`,
  '가입신청 버튼 확대',
);

// 8. 관리자모드 확대.
source = replaceUnique(
  source,
`                mt: 1.15,
                minHeight: appMode
                  ? 54
                  : 50,
                color: '#475569',
                fontSize: appMode
                  ? '0.98rem'
                  : '0.92rem',`,
`                mt: 1,
                minHeight: appMode
                  ? 60
                  : 56,
                color: '#475569',
                fontSize: appMode
                  ? '1.06rem'
                  : '0.98rem',`,
  '관리자모드 확대',
);

for (const marker of [
  "'v52.48.2.1'",
  "xs: 'calc(28px + env(safe-area-inset-top))'",
  "? '3.35rem'",
  "placeholder=\"휴대폰번호\"",
  "placeholder=\"비밀번호\"",
  "? 78",
  "? 72",
  "? 66",
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
    `backup_v52.48.2.1_${stamp}`,
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

console.log('\n[v52.48.2.1 적용 완료]');
console.log('- v52.48.2 중복 기준코드 오류 수정');
console.log('- 휴대폰번호/비밀번호를 각각 anchor 기준으로 안전 수정');
console.log('- 좌우 여백 축소 및 시작 위치 위로 이동');
console.log('- W/로그인/입력창/버튼 추가 확대');
console.log('- 관리자 QR 기능 유지');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
