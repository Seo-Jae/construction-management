const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const RELEASE = __dirname;

const TARGETS = [
  {
    target: path.join(ROOT, 'src', 'page', 'WorkerMasterManagement.jsx'),
    source: path.join(RELEASE, 'src', 'page', 'WorkerMasterManagement.jsx'),
    expected: '4ecc5be9e9896bb2da8aa3b3487f46f3b4fb9b7a',
  },
  {
    target: path.join(ROOT, 'src', 'page', 'MonthlyLaborManagement.jsx'),
    source: path.join(RELEASE, 'src', 'page', 'MonthlyLaborManagement.jsx'),
    expected: '4755195810dbca6b002391eefe90462501b76aca',
  },
];

function fail(message) {
  console.error('\n[v52.41 적용 중단]');
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

const workerTarget = TARGETS[0].target;

if (
  fs.existsSync(workerTarget) &&
  fs.readFileSync(workerTarget, 'utf8').includes(
    'labor_worker_master_secure_upsert_v52_41',
  )
) {
  console.log('[v52.41] 이미 적용된 상태입니다.');
  process.exit(0);
}

for (const item of TARGETS) {
  if (!fs.existsSync(item.target)) {
    fail(`대상 파일을 찾을 수 없습니다: ${item.target}`);
  }
  if (!fs.existsSync(item.source)) {
    fail(`릴리즈 파일을 찾을 수 없습니다: ${item.source}`);
  }

  const actual = blobSha(fs.readFileSync(item.target));
  if (actual !== item.expected) {
    fail(
      '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
      `${path.relative(ROOT, item.target)}\n` +
      `예상 Git blob SHA: ${item.expected}\n` +
      `현재 Git blob SHA: ${actual}\n\n` +
      '현재 main 기준과 다릅니다. git status를 확인해주세요.',
    );
  }
}

const workerSource = fs.readFileSync(TARGETS[0].source, 'utf8');

for (const marker of [
  'labor_worker_master_secure_upsert_v52_41',
  'NATIONALITY_OPTIONS',
  'filterNationalityOptions',
  'BIRTH_YEAR_OPTIONS',
  'hasAccountHolder',
  'IconButton',
]) {
  if (!workerSource.includes(marker)) {
    fail(`근로자 정보관리 검증 실패: ${marker}`);
  }
}

for (const marker of [
  'label="외국인등록번호"',
  'label="사용중"',
]) {
  if (workerSource.includes(marker)) {
    fail(`제거 대상 UI가 남아있습니다: ${marker}`);
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_v52.41_${stamp}`);

for (const item of TARGETS) {
  const relative = path.relative(ROOT, item.target);
  const backup = path.join(backupRoot, relative);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(item.target, backup);
  fs.copyFileSync(item.source, item.target);
}

console.log('\n[v52.41 적용 완료]');
console.log('- 관리열 수정 글자 제거 / 연필 아이콘만 표시');
console.log('- 사용중 UI 제거(기존 DB is_active 값은 보존)');
console.log('- 외국인등록번호 신규입력 UI 제거');
console.log('- 필수 보호정보 * + 서버 필수검증');
console.log('- 국적 표준 선택/검색 + 서버 표준화');
console.log('- 생년월일 년도검색 + 월/일 선택 방식으로 개선');
console.log('- Excel 준비검사 필수항목도 동일 기준으로 변경');
console.log(`- 백업: ${backupRoot}`);
console.log('');
console.log('중요: Supabase v52.41 SQL을 먼저 실행해야 합니다.');
console.log('다음 명령: npm run build');
