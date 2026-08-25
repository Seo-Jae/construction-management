const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);

function fail(message) {
  console.error('\n[v52.48.1 적용 중단]');
  console.error(message);
  process.exit(1);
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

  return source.replace(oldText, newText);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (
  source.includes(
    'data-attendance-login-ui="v52.48.1"',
  )
) {
  console.log('[v52.48.1] 이미 적용된 상태입니다.');
  process.exit(0);
}

for (const marker of [
  'AttendanceMobileAdminQr',
  "if (mode === 'admin')",
  'contentMaxWidth',
  '관리자 모드',
]) {
  if (!source.includes(marker)) {
    fail(
      `v52.48 선행 적용 확인 실패: ${marker}`,
    );
  }
}

// ---------------------------------------------------------
// 1. MobileShell에 로그인 전용 cleanLogin 모드 추가
// ---------------------------------------------------------
source = replaceUnique(
  source,
`function MobileShell({
  children,
  appMode = false,
  topBanner = null,
  headerAction = null,
  contentMaxWidth = null,
}) {`,
`function MobileShell({
  children,
  appMode = false,
  topBanner = null,
  headerAction = null,
  contentMaxWidth = null,
  cleanLogin = false,
}) {`,
  'MobileShell cleanLogin 옵션',
);

source = replaceUnique(
  source,
`    <Box sx={{ minHeight: '100dvh', bgcolor: appMode ? '#f5f7f6' : '#eef3f8' }}>`,
`    <Box
      sx={{
        minHeight: '100dvh',
        bgcolor: cleanLogin
          ? '#ffffff'
          : appMode
            ? '#f5f7f6'
            : '#eef3f8',
      }}
    >`,
  '로그인 흰 배경',
);

source = replaceUnique(
  source,
`        sx={{
          bgcolor: appMode ? APP_BRAND_GREEN : '#0f4c81',
          pt: appMode ? 'env(safe-area-inset-top)' : 0,
        }}`,
`        sx={{
          display: cleanLogin ? 'none' : 'flex',
          bgcolor: appMode ? APP_BRAND_GREEN : '#0f4c81',
          pt: appMode ? 'env(safe-area-inset-top)' : 0,
        }}`,
  '로그인 상단 헤더 숨김',
);

source = replaceUnique(
  source,
`          px: appMode ? 0.75 : 2,
          pt: appMode ? 2.5 : 2,
          pb: appMode ? 'calc(24px + env(safe-area-inset-bottom))' : 2,`,
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
              : 2,
          pb: cleanLogin
            ? 'calc(36px + env(safe-area-inset-bottom))'
            : appMode
              ? 'calc(24px + env(safe-area-inset-bottom))'
              : 2,`,
  '로그인 화면 여백 조정',
);

// ---------------------------------------------------------
// 2. 최종 로그인/가입 화면에서 login만 cleanLogin 사용
// ---------------------------------------------------------
source = replaceUnique(
  source,
`    <MobileShell
      appMode={appMode}
      contentMaxWidth={
        appMode
          ? 'none'
          : mode === 'login'
            ? 1040
            : 720
      }
    >`,
`    <MobileShell
      appMode={appMode}
      cleanLogin={mode === 'login'}
      contentMaxWidth={
        appMode
          ? 'none'
          : mode === 'login'
            ? 1040
            : 720
      }
    >`,
  '로그인 cleanLogin 연결',
);

// ---------------------------------------------------------
// 3. 로그인/가입 공통 Paper: login이면 카드 테두리 제거
// ---------------------------------------------------------
source = replaceUnique(
  source,
`      <Paper variant="outlined" sx={{ p: appMode ? 3 : 2.25, borderRadius: appMode ? 3.5 : 3 }}>`,
`      <Paper
        data-attendance-login-ui={
          mode === 'login'
            ? 'v52.48.1'
            : undefined
        }
        variant={
          mode === 'login'
            ? undefined
            : 'outlined'
        }
        elevation={0}
        sx={{
          p:
            mode === 'login'
              ? 0
              : appMode
                ? 3
                : 2.25,
          borderRadius:
            mode === 'login'
              ? 0
              : appMode
                ? 3.5
                : 3,
          border:
            mode === 'login'
              ? 'none'
              : undefined,
          bgcolor: '#ffffff',
          boxShadow: 'none',
        }}
      >`,
  '로그인 카드 테두리 제거',
);

// ---------------------------------------------------------
// 4. 로그인/가입 헤더: login은 W 로그인 형태
// ---------------------------------------------------------
source = replaceUnique(
  source,
`        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          {mode === 'signup' && <IconButton size="small" onClick={() => setMode('login')}><ArrowBackRoundedIcon /></IconButton>}
          <Box>
            <Typography sx={{ fontSize: appMode ? '1.4rem' : '1.15rem', fontWeight: 900 }}>{mode === 'signup' ? '근로자 가입 신청' : '근로자 로그인'}</Typography>
            <Typography sx={{ mt: appMode ? 0.45 : 0, color: '#64748b', fontSize: appMode ? '0.92rem' : '0.74rem' }}>별도의 사내 ERP 계정 없이 이용합니다.</Typography>
          </Box>
        </Stack>`,
`        {mode === 'login' ? (
          <Box sx={{ mb: appMode ? 6 : 5 }}>
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
                    ? '3rem'
                    : '2.7rem',
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
                    ? '2.15rem'
                    : '2rem',
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
                mt: 1.1,
                color: '#64748b',
                fontSize: appMode
                  ? '0.95rem'
                  : '0.86rem',
                fontWeight: 700,
              }}
            >
              욱림건설 근태시스템
            </Typography>
          </Box>
        ) : (
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: 2 }}
          >
            <IconButton
              size="small"
              onClick={() => setMode('login')}
            >
              <ArrowBackRoundedIcon />
            </IconButton>

            <Box>
              <Typography
                sx={{
                  fontSize: appMode
                    ? '1.4rem'
                    : '1.15rem',
                  fontWeight: 900,
                }}
              >
                근로자 가입 신청
              </Typography>

              <Typography
                sx={{
                  mt: appMode ? 0.45 : 0,
                  color: '#64748b',
                  fontSize: appMode
                    ? '0.92rem'
                    : '0.74rem',
                }}
              >
                별도의 사내 ERP 계정 없이 이용합니다.
              </Typography>
            </Box>
          </Stack>
        )}`,
  '로그인 W 브랜드 헤더',
);

// ---------------------------------------------------------
// 5. 로그인 branch 전체 교체
// ---------------------------------------------------------
const loginStart =
`        {mode === 'login' ? (
          <Stack spacing={1.5}>`;

const signupBoundary =
`        ) : (
          <Stack spacing={1.5}>`;

const loginIndex = source.indexOf(loginStart);
if (loginIndex < 0) {
  fail('로그인 branch 시작을 찾지 못했습니다.');
}

const boundaryIndex = source.indexOf(
  signupBoundary,
  loginIndex + loginStart.length,
);

if (boundaryIndex < 0) {
  fail('가입신청 branch 경계를 찾지 못했습니다.');
}

const newLoginBranch =
`        {mode === 'login' ? (
          <Stack
            spacing={0}
            sx={{
              width: '100%',
            }}
          >
            <TextField
              fullWidth
              variant="standard"
              placeholder="휴대폰번호"
              value={formatPhone(login.phone)}
              onChange={(event) =>
                setLogin((prev) => ({
                  ...prev,
                  phone: normalizePhone(
                    event.target.value,
                  ),
                }))
              }
              inputMode="tel"
              autoComplete="tel"
              InputProps={{
                disableUnderline: false,
              }}
              inputProps={{
                'aria-label': '휴대폰번호',
              }}
              sx={{
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 70
                    : 66,
                  px: 1,
                  fontSize: appMode
                    ? '1.18rem'
                    : '1.08rem',
                },
                '& .MuiInputBase-input::placeholder': {
                  color: '#6b7280',
                  opacity: 1,
                },
                '& .MuiInput-underline:before': {
                  borderBottomColor: '#e5e7eb',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottomColor: '#cbd5e1',
                },
                '& .MuiInput-underline:after': {
                  borderBottomColor: APP_BRAND_GREEN,
                },
              }}
            />

            <TextField
              fullWidth
              variant="standard"
              type="password"
              placeholder="비밀번호"
              value={login.password}
              onChange={(event) =>
                setLogin((prev) => ({
                  ...prev,
                  password:
                    event.target.value,
                }))
              }
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleLogin();
                }
              }}
              InputProps={{
                disableUnderline: false,
              }}
              inputProps={{
                'aria-label': '비밀번호',
              }}
              sx={{
                mt: appMode ? 2.4 : 2,
                '& .MuiInputBase-root': {
                  minHeight: appMode
                    ? 70
                    : 66,
                  px: 1,
                  fontSize: appMode
                    ? '1.18rem'
                    : '1.08rem',
                },
                '& .MuiInputBase-input::placeholder': {
                  color: '#6b7280',
                  opacity: 1,
                },
                '& .MuiInput-underline:before': {
                  borderBottomColor: '#e5e7eb',
                },
                '& .MuiInput-underline:hover:not(.Mui-disabled):before': {
                  borderBottomColor: '#cbd5e1',
                },
                '& .MuiInput-underline:after': {
                  borderBottomColor: APP_BRAND_GREEN,
                },
              }}
            />

            <Button
              fullWidth
              variant="contained"
              size="large"
              onClick={handleLogin}
              disabled={loading}
              sx={{
                mt: appMode ? 5.2 : 4.5,
                minHeight: appMode
                  ? 64
                  : 60,
                borderRadius: 2.2,
                bgcolor: APP_BRAND_GREEN,
                color: '#ffffff',
                fontSize: appMode
                  ? '1.15rem'
                  : '1.05rem',
                fontWeight: 1000,
                boxShadow: 'none',
                '&:hover': {
                  bgcolor: '#02b853',
                  boxShadow: 'none',
                },
              }}
            >
              로그인
            </Button>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<HowToRegRoundedIcon />}
              onClick={() =>
                setMode('signup')
              }
              sx={{
                mt: 1.5,
                minHeight: appMode
                  ? 58
                  : 54,
                borderRadius: 2.2,
                borderColor: '#e5e7eb',
                bgcolor: '#f8fafc',
                color: '#1f2937',
                fontSize: appMode
                  ? '1rem'
                  : '0.94rem',
                fontWeight: 900,
                '&:hover': {
                  borderColor: '#d1d5db',
                  bgcolor: '#f3f4f6',
                },
              }}
            >
              처음 이용하시나요? 가입 신청
            </Button>

            <Button
              fullWidth
              variant="text"
              startIcon={
                <AdminPanelSettingsRoundedIcon />
              }
              onClick={() =>
                setMode('admin')
              }
              sx={{
                mt: 1.15,
                minHeight: appMode
                  ? 54
                  : 50,
                color: '#475569',
                fontSize: appMode
                  ? '0.98rem'
                  : '0.92rem',
                fontWeight: 900,
              }}
            >
              관리자 모드
            </Button>
          </Stack>
`;

source =
  source.slice(0, loginIndex) +
  newLoginBranch +
  source.slice(boundaryIndex);

// ---------------------------------------------------------
// 6. 비앱 설치 버튼은 로그인에서는 살짝 아래로
// ---------------------------------------------------------
source = replaceUnique(
  source,
`      {!appMode && <Button fullWidth variant="text" startIcon={<AddToHomeScreenRoundedIcon />} onClick={handleInstall} sx={{ mt: 1.5 }}>근태앱 설치</Button>}`,
`      {!appMode && (
        <Button
          fullWidth
          variant="text"
          startIcon={<AddToHomeScreenRoundedIcon />}
          onClick={handleInstall}
          sx={{
            mt: mode === 'login'
              ? 3
              : 1.5,
            color: '#64748b',
          }}
        >
          근태앱 설치
        </Button>
      )}`,
  '근태앱 설치 버튼 정리',
);

for (const marker of [
  'data-attendance-login-ui',
  'cleanLogin={mode === \'login\'}',
  'display: cleanLogin ? \'none\' : \'flex\'',
  '욱림건설 근태시스템',
  'placeholder="휴대폰번호"',
  'placeholder="비밀번호"',
  '관리자 모드',
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

const backup = path.join(
  ROOT,
  `backup_v52.48.1_${stamp}`,
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

console.log('\n[v52.48.1 적용 완료]');
console.log('- 로그인 화면에서 상단 초록 AppBar 숨김');
console.log('- 흰 배경 + W 로그인 브랜드 헤더 적용');
console.log('- 휴대폰/비밀번호 입력창 대형 밑줄형으로 변경');
console.log('- 로그인 버튼 높이/글씨 확대');
console.log('- 가입 신청/관리자 모드 정리');
console.log('- v52.48 관리자 QR 기능 그대로 유지');
console.log('- 가입신청 화면은 기존 구조 유지');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
