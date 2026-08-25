const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;

const TARGET = path.join(
  ROOT,
  'src',
  'page',
  'WorkerMasterManagement.jsx'
);

const SOURCE = path.join(
  RELEASE,
  'src',
  'page',
  'WorkerMasterManagement.jsx'
);

const EXPECTED =
  '954625e51ef98b5bc4da3f297b43548f58db43be';

function fail(message) {
  console.error('\n[v52.34 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header =
    Buffer.from(
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
  fail(
    `대상 파일을 찾을 수 없습니다: ${TARGET}`,
  );
}

if (!fs.existsSync(SOURCE)) {
  fail(
    `릴리즈 파일을 찾을 수 없습니다: ${SOURCE}`,
  );
}

const current =
  fs.readFileSync(TARGET);

const currentText =
  current.toString('utf8');

if (
  currentText.includes(
    'labor_worker_master_secure_upsert_v52_34',
  ) &&
  currentText.includes(
    'labor_worker_master_list_v52_34',
  )
) {
  console.log(
    '[v52.34] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

const actual =
  blobSha(current);

if (actual !== EXPECTED) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/WorkerMasterManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 v52.33 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

const sourceText =
  fs.readFileSync(
    SOURCE,
    'utf8',
  );

const required = [
  'labor_worker_master_list_v52_34',
  'labor_worker_master_secure_upsert_v52_34',
  '주민등록번호',
  '계좌번호',
  '기존 보호정보의 원문은 웹 화면에',
];

for (const marker of required) {
  if (!sourceText.includes(marker)) {
    fail(
      `릴리즈 파일 검증 실패: ${marker}`,
    );
  }
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backupTarget =
  path.join(
    ROOT,
    `backup_v52.34_${stamp}`,
    'src',
    'page',
    'WorkerMasterManagement.jsx',
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

console.log('\n[v52.34 적용 완료]');
console.log('- 근로자 보호정보 입력 UI 추가');
console.log('- 주민번호/외국인번호/전체연락처/주소/국적/계좌정보');
console.log('- 기존 원문은 웹에 재표시하지 않음');
console.log('- v52.34 암호화 저장 RPC 연결');
console.log(`- 백업: ${backupTarget}`);
console.log('');
console.log('중요: Supabase v52.34 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
