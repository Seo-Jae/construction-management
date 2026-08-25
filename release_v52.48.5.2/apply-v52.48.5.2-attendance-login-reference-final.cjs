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
const EXPECTED_SHA = 'a7529df6abf019f074ea621945de7c2e9c641e96';

function fail(message) {
  console.error('\n[v52.48.5.2 적용 중단]');
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

function replaceAfterAnchor(
  source,
  anchor,
  oldText,
  newText,
  label,
) {
  const anchorIndex = source.indexOf(anchor);

  if (anchorIndex < 0) {
    fail(`${label}: 기준 입력칸을 찾지 못했습니다.`);
  }

  const targetIndex = source.indexOf(
    oldText,
    anchorIndex,
  );

  if (targetIndex < 0) {
    fail(`${label}: 입력칸 내부 스타일을 찾지 못했습니다.`);
  }

  return (
    source.slice(0, targetIndex) +
    newText +
    source.slice(
      targetIndex + oldText.length,
    )
  );
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

const currentBuffer = fs.readFileSync(TARGET);
let source = currentBuffer.toString('utf8');

if (source.includes("'v52.48.5.2'")) {
  console.log('[v52.48.5.2] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = blobSha(currentBuffer);

if (actualSha !== EXPECTED_SHA) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 최신 main 기준과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    'git status를 확인한 뒤 다시 시도해주세요.'
  );
}

if (
  !source.includes("'v52.48.4'") ||
  !source.includes("cleanLogin={mode === 'login'}")
) {
  fail('v52.48.4가 반영된 로그인 화면이 필요합니다.');
}

// 1. 로그인 화면에서는 MobileShell의 공통 appMode 입력/버튼 크기를 제외.
source = replaceUnique(
  source,
`          ...(appMode && {
            '& .MuiInputBase-root': { minHeight: 56, fontSize: '1rem' },
            '& .MuiInputLabel-root': { fontSize: '1rem' },
            '& .MuiButton-root': { minHeight: 52, fontSize: '0.96rem' },
            '& .MuiFormControlLabel-label': { fontSize: '1rem' },
            '& .MuiAlert-message': { fontSize: '0.92rem', lineHeight: 1.65 },
            '& .MuiChip-label': { fontSize: '0.86rem' },
          }),`,
`          ...(appMode && !cleanLogin && {
            '& .MuiInputBase-root': { minHeight: 56, fontSize: '1rem' },
            '& .MuiInputLabel-root': { fontSize: '1rem' },
            '& .MuiButton-root': { minHeight: 52, fontSize: '0.96rem' },
            '& .MuiFormControlLabel-label': { fontSize: '1rem' },
            '& .MuiAlert-message': { fontSize: '0.92rem', lineHeight: 1.65 },
            '& .MuiChip-label': { fontSize: '0.86rem' },
          }),`,
  '로그인 부모 강제크기 해제',
);

// 2. 로그인일 때 Android/PWA 상태바 흰색.
source = replaceUnique(
  source,
`  const primaryActionColor = appMode ? APP_BRAND_GREEN : '#0f6fae';

  const handleScannerVideoRef = useCallback((node) => {`,
`  const primaryActionColor = appMode ? APP_BRAND_GREEN : '#0f6fae';

  useEffect(() => {
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) return undefined;

    const previousColor =
      metaTheme.getAttribute('content') ||
      APP_BRAND_GREEN;

    metaTheme.setAttribute(
      'content',
      appMode && mode === 'login'
        ? '#ffffff'
        : APP_BRAND_GREEN,
    );

    return () => {
      metaTheme.setAttribute(
        'content',
        previousColor,
      );
    };
  }, [appMode, mode]);

  const handleScannerVideoRef = useCallback((node) => {`,
  '로그인 상태바 흰색 전환',
);

// 3. cleanLogin 바깥 padding 제거.
source = replaceUnique(
  source,
`          px: cleanLogin
            ? { xs: 2.5, sm: 4 }
            : appMode
              ? 0.75
              : 2,
          pt: cleanLogin
            ? {
                xs: 'calc(26px + env(safe-area-inset-top))',
                sm: 4.5,
              }
            : appMode
              ? 2.5
              : 2,`,
`          px: cleanLogin
            ? 0
            : appMode
              ? 0.75
              : 2,
          pt: cleanLogin
            ? 0
            : appMode
              ? 2.5
              : 2,`,
  '로그인 외부 여백 초기화',
);

// 4. 새 버전 marker.
source = replaceUnique(
  source,
`        data-attendance-login-layout-ratio={
          mode === 'login' && appMode
            ? 'v52.48.4'
            : undefined
        }`,
`        data-attendance-login-layout-ratio={
          mode === 'login' && appMode
            ? 'v52.48.4'
            : undefined
        }
        data-attendance-login-reference-layout={
          mode === 'login' && appMode
            ? 'v52.48.5.2'
            : undefined
        }`,
  'v52.48.5.1 marker',
);

// 5. scale 편법 제거 + 직접 폭 지정.
source = replaceUnique(
  source,
`          width:
            mode === 'login' && appMode
              ? '67.5%'
              : '100%',
          mx: 'auto',
          transform:
            mode === 'login' && appMode
              ? 'scale(1.36)'
              : 'none',
          transformOrigin: 'top center',`,
`          width:
            mode === 'login' && appMode
              ? 'calc(100% - 32px)'
              : '100%',
          maxWidth:
            mode === 'login' && appMode
              ? 520
              : 'none',
          minHeight:
            mode === 'login' && appMode
              ? 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'
              : 'auto',
          mx: 'auto',
          position: 'relative',
          transform: 'none',
          transformOrigin: 'top center',`,
  '레퍼런스 가로폭과 scale 제거',
);

// 6. 로그인 제목 영역 전체 재배치.
source = replaceUnique(
  source,
`        {mode === 'login' ? (
          <Box
            sx={{
              mb: appMode ? 4.4 : 4.2,
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1.3}
            >
              <Box
                aria-hidden="true"
                sx={{
                  color: APP_BRAND_GREEN,
                  fontSize: appMode
                    ? '3.35rem'
                    : '3rem',
                  lineHeight: 1,
                  fontWeight: 1000,
                  letterSpacing: '-0.14em',
                  pr: '0.14em',
                }}
              >
                W
              </Box>

              <Typography
                sx={{
                  color: '#111827',
                  fontSize: appMode
                    ? '2.4rem'
                    : '2.2rem',
                  lineHeight: 1.1,
                  fontWeight: 1000,
                  letterSpacing: '-0.04em',
                }}
              >
                로그인
              </Typography>
            </Stack>

            <Typography
              sx={{
                mt: 0.85,
                color: '#64748b',
                fontSize: appMode
                  ? '0.82rem'
                  : '0.92rem',
                fontWeight: 700,
              }}
            >
              욱림건설 근태시스템
            </Typography>
          </Box>`,
`        {mode === 'login' ? (
          <Box>
            {appMode ? (
              <IconButton
                aria-label="뒤로가기"
                onClick={() => window.history.back()}
                sx={{
                  mt: 1.25,
                  ml: -0.75,
                  width: 46,
                  height: 46,
                  color: '#111827',
                }}
              >
                <ArrowBackRoundedIcon
                  sx={{ fontSize: 34 }}
                />
              </IconButton>
            ) : null}

            <Stack
              direction="row"
              alignItems="center"
              spacing={1.1}
              sx={{
                mt: appMode ? 4.4 : 3,
                mb: appMode ? 7.2 : 4.2,
                pl: appMode ? 0.5 : 0,
              }}
            >
              <Box
                aria-hidden="true"
                sx={{
                  color: APP_BRAND_GREEN,
                  fontSize: appMode
                    ? '3.2rem'
                    : '3rem',
                  lineHeight: 1,
                  fontWeight: 1000,
                  letterSpacing: '-0.14em',
                  pr: '0.14em',
                }}
              >
                W
              </Box>

              <Typography
                sx={{
                  color: '#111827',
                  fontSize: appMode
                    ? '2.45rem'
                    : '2.2rem',
                  lineHeight: 1.05,
                  fontWeight: 1000,
                  letterSpacing: '-0.045em',
                }}
              >
                로그인
              </Typography>
            </Stack>
          </Box>`,
  '레퍼런스 로그인 헤더 재배치',
);

// 7. 휴대폰 입력칸은 휴대폰 placeholder 뒤에서만 수정.
source = replaceAfterAnchor(
  source,
  'placeholder="휴대폰번호"',
`                  minHeight: appMode
                    ? 78
                    : 74,
                  px: 0.75,
                  fontSize: appMode
                    ? '1.3rem'
                    : '1.2rem',`,
`                  minHeight: appMode
                    ? 72
                    : 74,
                  px: 0.5,
                  fontSize: appMode
                    ? '1.28rem'
                    : '1.2rem',`,
  '휴대폰 실제 크기',
);

// 8. 비밀번호 입력칸은 비밀번호 placeholder 뒤에서만 수정.
source = replaceAfterAnchor(
  source,
  'placeholder="비밀번호"',
`                mt: appMode ? 2.05 : 1.8,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 78
                    : 74,
                  px: 0.75,
                  fontSize: appMode
                    ? '1.3rem'
                    : '1.2rem',`,
`                mt: appMode ? 2.6 : 1.8,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 72
                    : 74,
                  px: 0.5,
                  fontSize: appMode
                    ? '1.28rem'
                    : '1.2rem',`,
  '비밀번호 실제 크기',
);

// 9. 로그인 버튼.
source = replaceUnique(
  source,
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
`                mt: appMode ? 6.4 : 4,
                minHeight: appMode
                  ? 58
                  : 68,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                bgcolor: APP_BRAND_GREEN,
                color: '#ffffff',
                fontSize: appMode
                  ? '1.18rem'
                  : '1.16rem',`,
  '로그인 버튼 위치와 크기',
);

// 10. 가입신청 버튼.
source = replaceUnique(
  source,
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
`                mt: appMode ? 1.4 : 1.35,
                minHeight: appMode
                  ? 58
                  : 62,
                borderRadius: appMode
                  ? 2.3
                  : 2.1,
                borderColor: '#eeeeee',
                bgcolor: '#f7f7f7',
                color: '#1f2937',
                fontSize: appMode
                  ? '1.08rem'
                  : '1rem',`,
  '가입신청 버튼 위치와 크기',
);

// 11. 관리자 모드.
source = replaceUnique(
  source,
`                mt: 1,
                minHeight: appMode
                  ? 60
                  : 56,
                color: '#475569',
                fontSize: appMode
                  ? '1.06rem'
                  : '0.98rem',`,
`                mt: appMode ? 3.6 : 1,
                minHeight: appMode
                  ? 44
                  : 56,
                color: '#334155',
                fontSize: appMode
                  ? '1.02rem'
                  : '0.98rem',`,
  '관리자모드 하단 위치',
);

for (const marker of [
  "'v52.48.5.2'",
  'appMode && !cleanLogin',
  "? '#ffffff'",
  "'calc(100% - 32px)'",
  'window.history.back()',
  'mb: appMode ? 7.2 : 4.2',
  'mt: appMode ? 6.4 : 4',
]) {
  if (!source.includes(marker)) {
    fail(`적용 후 필수 마커 누락: ${marker}`);
  }
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backup = path.join(
  ROOT,
  `backup_v52.48.5.2_${stamp}`,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);

fs.mkdirSync(
  path.dirname(backup),
  { recursive: true },
);

fs.copyFileSync(TARGET, backup);
fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.48.5.2 적용 완료]');
console.log('- v52.48.5 휴대폰 입력 중복검사 오류 수정');
console.log('- 휴대폰/비밀번호를 placeholder 기준으로 각각 수정');
console.log('- 로그인 공통 부모 강제크기 해제');
console.log('- 로그인 상태바 흰색');
console.log('- scale 편법 제거');
console.log('- 레퍼런스 비율로 세로 레이아웃 재배치');
console.log('- 뒤로가기 추가 / 보조 시스템명 제거');
console.log('- 로그인/가입/관리자모드 위치 재정렬');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
