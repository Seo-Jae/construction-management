const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;

const MONTHLY_TARGET = path.join(
  ROOT,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);
const MONTHLY_SOURCE = path.join(
  RELEASE,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);

const AUTH_TARGET = path.join(
  ROOT,
  'src',
  'components',
  'LaborDownloadAuthDialog.jsx'
);
const AUTH_SOURCE = path.join(
  RELEASE,
  'src',
  'components',
  'LaborDownloadAuthDialog.jsx'
);

const EXPECTED_MONTHLY =
  '8fa2d7d52cb9e5a01f8fc2d24540571d86281a62';

function fail(message) {
  console.error('\n[v52.39 적용 중단]');
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

if (!fs.existsSync(MONTHLY_TARGET)) {
  fail(
    `대상 파일을 찾을 수 없습니다: ${MONTHLY_TARGET}`,
  );
}

if (
  !fs.existsSync(MONTHLY_SOURCE) ||
  !fs.existsSync(AUTH_SOURCE)
) {
  fail(
    '릴리즈 패키지의 변경 파일이 누락되었습니다.',
  );
}

const current =
  fs.readFileSync(MONTHLY_TARGET);
const currentText =
  current.toString('utf8');

if (
  currentText.includes(
    'LaborDownloadAuthDialog',
  ) &&
  currentText.includes(
    '다운로드 인증 준비',
  ) &&
  fs.existsSync(AUTH_TARGET)
) {
  console.log(
    '[v52.39] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

const actual =
  blobSha(current);

if (actual !== EXPECTED_MONTHLY) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/MonthlyLaborManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED_MONTHLY}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 v52.38.1 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

const monthlyText =
  fs.readFileSync(
    MONTHLY_SOURCE,
    'utf8',
  );

const authText =
  fs.readFileSync(
    AUTH_SOURCE,
    'utf8',
  );

const monthlyMarkers = [
  'LaborDownloadAuthDialog',
  '다운로드 인증 준비',
  'LaborSecurityPhoneDialog',
  'Excel 생성 준비',
];

for (const marker of monthlyMarkers) {
  if (!monthlyText.includes(marker)) {
    fail(
      `월별 노임 파일 검증 실패: ${marker}`,
    );
  }
}

const authMarkers = [
  'labor_download_auth_preflight_v52_39',
  'labor_download_otp_request_v52_39',
  'labor_download_otp_verify_v52_39',
  '실제 노임 Excel 다운로드',
];

for (const marker of authMarkers) {
  if (!authText.includes(marker)) {
    fail(
      `다운로드 인증 파일 검증 실패: ${marker}`,
    );
  }
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backupRoot =
  path.join(
    ROOT,
    `backup_v52.39_${stamp}`,
  );

for (const target of [
  MONTHLY_TARGET,
  AUTH_TARGET,
]) {
  if (!fs.existsSync(target)) {
    continue;
  }

  const relative =
    path.relative(
      ROOT,
      target,
    );

  const backupTarget =
    path.join(
      backupRoot,
      relative,
    );

  fs.mkdirSync(
    path.dirname(backupTarget),
    { recursive: true },
  );

  fs.copyFileSync(
    target,
    backupTarget,
  );
}

fs.mkdirSync(
  path.dirname(AUTH_TARGET),
  { recursive: true },
);

fs.copyFileSync(
  MONTHLY_SOURCE,
  MONTHLY_TARGET,
);
fs.copyFileSync(
  AUTH_SOURCE,
  AUTH_TARGET,
);

console.log('\n[v52.39 적용 완료]');
console.log('- 다운로드 인증 준비 버튼 추가');
console.log('- Excel/보안휴대폰/SMS provider 통합 사전점검 UI');
console.log('- OTP challenge 요청/검증 UI 기반');
console.log('- 실제 Excel 다운로드 버튼은 아직 비활성');
console.log(`- 백업: ${backupRoot}`);
console.log('');
console.log('중요: Supabase v52.39 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
