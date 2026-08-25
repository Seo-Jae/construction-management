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

const PHONE_TARGET = path.join(
  ROOT,
  'src',
  'components',
  'LaborSecurityPhoneDialog.jsx'
);
const PHONE_SOURCE = path.join(
  RELEASE,
  'src',
  'components',
  'LaborSecurityPhoneDialog.jsx'
);

const EXPECTED_MONTHLY =
  '95e6a11fee60dd34aae885aa83e53a7052d7bf41';

function fail(message) {
  console.error('\n[v52.38.1 적용 중단]');
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

if (
  !fs.existsSync(MONTHLY_TARGET)
) {
  fail(
    `대상 파일을 찾을 수 없습니다: ${MONTHLY_TARGET}`,
  );
}

if (
  !fs.existsSync(MONTHLY_SOURCE) ||
  !fs.existsSync(PHONE_SOURCE)
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
    'LaborSecurityPhoneDialog',
  ) &&
  currentText.includes(
    'labor_monthly_export_readiness_v52_37',
  ) &&
  fs.existsSync(PHONE_TARGET)
) {
  console.log(
    '[v52.38.1] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

const actual =
  blobSha(current);

if (
  actual !==
  EXPECTED_MONTHLY
) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/MonthlyLaborManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED_MONTHLY}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 v52.37 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

const monthlyText =
  fs.readFileSync(
    MONTHLY_SOURCE,
    'utf8',
  );

const phoneText =
  fs.readFileSync(
    PHONE_SOURCE,
    'utf8',
  );

const requiredMonthly = [
  'labor_monthly_export_readiness_v52_37',
  'LaborSecurityPhoneDialog',
  '보안 휴대폰',
];

for (
  const marker
  of requiredMonthly
) {
  if (
    !monthlyText.includes(
      marker,
    )
  ) {
    fail(
      `월별 노임 파일 검증 실패: ${marker}`,
    );
  }
}

const requiredPhone = [
  'labor_security_phone_status_v52_38',
  'labor_security_phone_register_pending_v52_38',
  '인증 대기 번호 등록',
];

for (
  const marker
  of requiredPhone
) {
  if (
    !phoneText.includes(
      marker,
    )
  ) {
    fail(
      `보안 휴대폰 파일 검증 실패: ${marker}`,
    );
  }
}

const stamp =
  new Date()
    .toISOString()
    .replace(
      /[:.]/g,
      '-',
    );

const backupRoot =
  path.join(
    ROOT,
    `backup_v52.38_${stamp}`,
  );

for (
  const target
  of [
    MONTHLY_TARGET,
    PHONE_TARGET,
  ]
) {
  if (
    !fs.existsSync(target)
  ) {
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
    path.dirname(
      backupTarget,
    ),
    { recursive: true },
  );

  fs.copyFileSync(
    target,
    backupTarget,
  );
}

fs.mkdirSync(
  path.dirname(
    PHONE_TARGET,
  ),
  { recursive: true },
);

fs.copyFileSync(
  MONTHLY_SOURCE,
  MONTHLY_TARGET,
);

fs.copyFileSync(
  PHONE_SOURCE,
  PHONE_TARGET,
);

console.log('\n[v52.38.1 적용 완료]');
console.log('- v52.37 Excel 생성 사전검증 누적 포함');
console.log('- 보안 휴대폰 상태/등록 UI 추가');
console.log('- 인증 예정 번호 암호화 저장');
console.log('- SENS 실제 SMS/OTP 인증은 아직 미적용');
console.log(`- 백업: ${backupRoot}`);
console.log('');
console.log('중요: Supabase v52.38 누적 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
