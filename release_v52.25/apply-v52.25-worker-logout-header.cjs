const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'AttendanceWorkerPortal.jsx');

const ACCEPTED_GIT_BLOB_SHAS = new Set([
  // v52.22 / v52.21 worker
  '9d8d5b700cb26c16069903fdf89259b3ae9bcdfa',
  // v52.23
  'f78bc584bfe64f98591310a22b32f7fb1efde43a',
  // v52.24
  '2b848b4d06d4dbaf28f422ace83cd84a55559517',
]);

function fail(message) {
  console.error('\n[v52.25 적용 중단]');
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

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    fail(`${label}: 기준 문자열이 ${count}개 발견되었습니다. 예상값은 정확히 1개입니다.`);
  }
  return source.replace(before, after);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

const alreadyApplied =
  source.includes('headerAction = null') &&
  source.includes('{headerAction}') &&
  source.includes('aria-label="로그아웃"') &&
  source.includes('title="로그아웃"') &&
  !source.includes('<Button fullWidth variant="text" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>로그아웃</Button>');

if (alreadyApplied) {
  console.log('[v52.25] 이미 로그아웃 버튼 위치가 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = gitBlobSha(source);
if (!ACCEPTED_GIT_BLOB_SHAS.has(actualSha)) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 확인한 운영 기준과 다릅니다.\n' +
    '허용 기준: v52.22 / v52.23 / v52.24\n' +
    `현재 Git blob SHA: ${actualSha}\n` +
    '기존 기능 보호를 위해 자동 적용하지 않았습니다.'
  );
}

/* =========================================================
   1. MobileShell에 우측 헤더 액션 영역 추가
   ========================================================= */

source = replaceOnce(
  source,
`function MobileShell({ children, appMode = false, topBanner = null }) {`,
`function MobileShell({
  children,
  appMode = false,
  topBanner = null,
  headerAction = null,
}) {`,
  'MobileShell headerAction prop 추가',
);

source = replaceOnce(
  source,
`        <Toolbar sx={{ minHeight: appMode ? '72px !important' : '58px !important', px: appMode ? 0.75 : 2 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">`,
`        <Toolbar
          sx={{
            minHeight: appMode ? '72px !important' : '58px !important',
            px: appMode ? 0.75 : 2,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 1,
          }}
        >
          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            sx={{ minWidth: 0 }}
          >`,
  '상단 헤더 좌우 배치',
);

source = replaceOnce(
  source,
`          </Stack>
        </Toolbar>
      </AppBar>`,
`          </Stack>

          {headerAction && (
            <Box
              sx={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              {headerAction}
            </Box>
          )}
        </Toolbar>
      </AppBar>`,
  '상단 우측 액션 렌더',
);

/* =========================================================
   2. 로그인 완료 화면에서만 상단 로그아웃 표시
   ========================================================= */

source = replaceOnce(
  source,
`      <MobileShell
        appMode={appMode}
        topBanner={<AttendanceNoticeTicker notices={attendanceNotices} appMode={appMode} />}
      >`,
`      <MobileShell
        appMode={appMode}
        topBanner={<AttendanceNoticeTicker notices={attendanceNotices} appMode={appMode} />}
        headerAction={
          <IconButton
            aria-label="로그아웃"
            title="로그아웃"
            onClick={handleLogout}
            sx={{
              width: appMode ? 44 : 40,
              height: appMode ? 44 : 40,
              color: '#ffffff',
              bgcolor: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.28)',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.2)',
              },
            }}
          >
            <LogoutRoundedIcon />
          </IconButton>
        }
      >`,
  '작업자 상단 로그아웃 버튼 추가',
);

/* =========================================================
   3. 기존 하단 로그아웃 제거
   브라우저에서만 남아 있던 앱 설치 버튼은 유지
   ========================================================= */

source = replaceOnce(
  source,
`        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          {!appMode && <Button fullWidth variant="outlined" startIcon={<AddToHomeScreenRoundedIcon />} onClick={handleInstall}>앱으로 설치</Button>}
          <Button fullWidth variant="text" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>로그아웃</Button>
        </Stack>`,
`        {!appMode && (
          <Button
            fullWidth
            variant="outlined"
            startIcon={<AddToHomeScreenRoundedIcon />}
            onClick={handleInstall}
            sx={{ mt: 2 }}
          >
            앱으로 설치
          </Button>
        )}`,
  '하단 로그아웃 제거',
);

/* =========================================================
   사후 검증
   ========================================================= */

const requiredMarkers = [
  'headerAction = null',
  '{headerAction}',
  'aria-label="로그아웃"',
  'title="로그아웃"',
  "bgcolor: 'rgba(255,255,255,0.12)'",
  'onClick={handleLogout}',
  'topBanner={<AttendanceNoticeTicker notices={attendanceNotices} appMode={appMode} />}',
];

for (const marker of requiredMarkers) {
  if (!source.includes(marker)) {
    fail(`적용 후 검증 실패: ${marker}`);
  }
}

if (source.includes('<Button fullWidth variant="text" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={handleLogout}>로그아웃</Button>')) {
  fail('기존 하단 로그아웃 버튼이 남아 있습니다.');
}

// 로그인 전 MobileShell에는 headerAction을 전달하지 않으므로 상단 로그아웃이 표시되지 않습니다.
const workerHeaderCount = source.split('aria-label="로그아웃"').length - 1;
if (workerHeaderCount !== 1) {
  fail(`상단 로그아웃 버튼이 ${workerHeaderCount}개 발견되었습니다. 예상값은 1개입니다.`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_v52.25_${stamp}`);
const backupTarget = path.join(
  backupDir,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);
fs.mkdirSync(path.dirname(backupTarget), { recursive: true });
fs.copyFileSync(TARGET, backupTarget);

fs.writeFileSync(TARGET, source, 'utf8');

console.log('\n[v52.25 적용 완료]');
console.log('- 작업자 로그인 완료 화면의 로그아웃을 상단 우측으로 이동');
console.log('- 초록색 헤더 우측 끝에 로그아웃 아이콘 표시');
console.log('- 기존 화면 하단 로그아웃 버튼 제거');
console.log('- 로그인 전 화면에는 로그아웃 아이콘 미표시');
console.log('- 브라우저용 앱 설치 버튼은 기존 위치 유지');
console.log('- 공지 티커/로그인 유지/QR 기능 변경 없음');
console.log(`- 백업: ${backupDir}`);
console.log('\nSQL 변경 없음');
console.log('다음 명령: npm run build');
