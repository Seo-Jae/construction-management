const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;

const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);

const SOURCE = path.join(
  RELEASE,
  'src',
  'page',
  'MonthlyLaborManagement.jsx'
);

const EXPECTED = 'bd7e1008945a13bb56d159dced174f8728c5b6d9';

function fail(message) {
  console.error('\n[v52.35 적용 중단]');
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

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

if (!fs.existsSync(SOURCE)) {
  fail(`릴리즈 파일을 찾을 수 없습니다: ${SOURCE}`);
}

const current = fs.readFileSync(TARGET);
const currentText = current.toString('utf8');

if (
  currentText.includes(
    'labor_monthly_roster_save_v52_35',
  ) &&
  currentText.includes(
    'labor_monthly_roster_get_v52_35',
  )
) {
  console.log('[v52.35] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actual = blobSha(current);

if (actual !== EXPECTED) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/MonthlyLaborManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

const sourceText = fs.readFileSync(
  SOURCE,
  'utf8',
);

const required = [
  'labor_monthly_roster_get_v52_35',
  'labor_monthly_roster_save_v52_35',
  'labor_monthly_worker_create_v52_35',
  '저장되지 않은 변경사항 있음',
  '등록 후 명단 추가',
];

for (const marker of required) {
  if (!sourceText.includes(marker)) {
    fail(`릴리즈 파일 검증 실패: ${marker}`);
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const backupTarget = path.join(
  ROOT,
  `backup_v52.35_${stamp}`,
  'src',
  'page',
  'MonthlyLaborManagement.jsx',
);

fs.mkdirSync(
  path.dirname(backupTarget),
  { recursive: true },
);

fs.copyFileSync(
  TARGET,
  backupTarget,
);

fs.copyFileSync(
  SOURCE,
  TARGET,
);

console.log('\n[v52.35 적용 완료]');
console.log('- 현장/작성월별 노임명단 DB 저장/조회');
console.log('- 명단 순서/공종/비고 저장');
console.log('- 신규 근로자 최소정보 등록 후 명단 즉시 추가');
console.log('- 담당자는 자기 현장 labor.cost.view 범위에서 사용');
console.log('- 개인정보는 월별 명단에 중복 저장하지 않음');
console.log(`- 백업: ${backupTarget}`);
console.log('');
console.log('중요: Supabase v52.35 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
