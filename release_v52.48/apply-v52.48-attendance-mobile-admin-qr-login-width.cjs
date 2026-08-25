const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;
const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);
const COMPONENT_SOURCE = path.join(
  RELEASE,
  'src',
  'components',
  'AttendanceMobileAdminQr.jsx',
);
const COMPONENT_TARGET = path.join(
  ROOT,
  'src',
  'components',
  'AttendanceMobileAdminQr.jsx',
);
const EXPECTED_SHA = 'f986963824f4cdc4cea51ba1e88647296aae0bb6';

function fail(message) {
  console.error('\n[v52.48 적용 중단]');
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
      `${label}: 기준 문자열을 찾지 못했습니다.`,
    );
  }

  if (
    source.indexOf(
      oldText,
      first + oldText.length,
    ) >= 0
  ) {
    fail(
      `${label}: 기준 문자열이 2개 이상 발견되었습니다.`,
    );
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

if (!fs.existsSync(COMPONENT_SOURCE)) {
  fail(
    `관리자모드 컴포넌트를 찾을 수 없습니다: ${COMPONENT_SOURCE}`,
  );
}

const currentBuffer = fs.readFileSync(TARGET);
const currentText = currentBuffer.toString('utf8');

if (
  currentText.includes(
    'AttendanceMobileAdminQr',
  ) &&
  currentText.includes(
    '관리자 모드',
  ) &&
  currentText.includes(
    'contentMaxWidth',
  )
) {
  console.log(
    '[v52.48] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

const actualSha = blobSha(currentBuffer);
if (actualSha !== EXPECTED_SHA) {
  fail(
    '현재 AttendanceWorkerPortal.jsx가 최신 main 기준과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    'git status를 확인한 뒤 다시 시도해주세요.',
  );
}

let next = currentText;

next = replaceUnique(
  next,
  `import AddToHomeScreenRoundedIcon from '@mui/icons-material/AddToHomeScreenRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';`,
  `import AddToHomeScreenRoundedIcon from '@mui/icons-material/AddToHomeScreenRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';`,
  '관리자모드 아이콘 import',
);

next = replaceUnique(
  next,
  `import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { BrowserQRCodeReader } from '@zxing/browser';`,
  `import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { BrowserQRCodeReader } from '@zxing/browser';
import AttendanceMobileAdminQr from '../components/AttendanceMobileAdminQr.jsx';`,
  '관리자모드 컴포넌트 import',
);

next = replaceUnique(
  next,
  `function MobileShell({
  children,
  appMode = false,
  topBanner = null,
  headerAction = null,
}) {`,
  `function MobileShell({
  children,
  appMode = false,
  topBanner = null,
  headerAction = null,
  contentMaxWidth = null,
}) {`,
  'MobileShell 폭 옵션 추가',
);

next = replaceUnique(
  next,
  `          maxWidth: appMode ? 'none' : 520,`,
  `          maxWidth:
            contentMaxWidth ||
            (appMode ? 'none' : 520),`,
  'MobileShell maxWidth 반응형 처리',
);

const finalReturnMarker = `  return (
    <MobileShell appMode={appMode}>`;
const adminReturn = `  if (mode === 'admin') {
    return (
      <MobileShell
        appMode={appMode}
        contentMaxWidth={
          appMode
            ? 'none'
            : 1040
        }
      >
        <AttendanceMobileAdminQr
          appMode={appMode}
          onBack={() => setMode('login')}
        />
      </MobileShell>
    );
  }

  return (
    <MobileShell
      appMode={appMode}
      contentMaxWidth={
        appMode
          ? 'none'
          : mode === 'login'
            ? 1040
            : 720
      }
    >`;

next = replaceUnique(
  next,
  finalReturnMarker,
  adminReturn,
  '관리자모드 화면 + 로그인폭 확대',
);

next = replaceUnique(
  next,
  `            <Button variant="outlined" startIcon={<HowToRegRoundedIcon />} onClick={() => setMode('signup')}>처음 이용하시나요? 가입 신청</Button>`,
  `            <Button variant="outlined" startIcon={<HowToRegRoundedIcon />} onClick={() => setMode('signup')}>처음 이용하시나요? 가입 신청</Button>
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<AdminPanelSettingsRoundedIcon />}
              onClick={() => setMode('admin')}
              sx={{
                borderColor: '#94a3b8',
                color: '#334155',
                fontWeight: 900,
              }}
            >
              관리자 모드
            </Button>`,
  '로그인 화면 관리자모드 버튼 추가',
);

for (const marker of [
  'AttendanceMobileAdminQr',
  'contentMaxWidth',
  "mode === 'admin'",
  '관리자 모드',
  '? 1040',
]) {
  if (!next.includes(marker)) {
    fail(
      `적용 결과 필수 마커 누락: ${marker}`,
    );
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');
const backup = path.join(
  ROOT,
  `backup_v52.48_${stamp}`,
  'src',
  'page',
  'AttendanceWorkerPortal.jsx',
);

fs.mkdirSync(
  path.dirname(backup),
  { recursive: true },
);
fs.copyFileSync(TARGET, backup);
fs.writeFileSync(TARGET, next, 'utf8');

fs.mkdirSync(
  path.dirname(COMPONENT_TARGET),
  { recursive: true },
);
fs.copyFileSync(
  COMPONENT_SOURCE,
  COMPONENT_TARGET,
);

console.log('\n[v52.48 적용 완료]');
console.log('- 근로자 로그인 아래 관리자 모드 버튼 추가');
console.log('- 통합관리시스템 이메일/비밀번호로 관리자 인증');
console.log('- 현장 선택 후 기존 서버 보안 QR 표시 세션 발급');
console.log('- QR 세션 발급 후 현재 탭 관리자 인증 자동 종료');
console.log('- 관리자 휴대폰에서 5초 동적 출퇴근 QR 표시');
console.log('- 근로자 로그인 PC/브라우저 폭 520px → 1040px');
console.log('- 휴대폰은 화면폭을 넘지 않는 반응형 유지');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
