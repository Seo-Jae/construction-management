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

const EXPECTED =
  'f2f07bc99f991e4e1cba336b7b316599519b71dc';

function fail(message) {
  console.error('\n[v52.42 적용 중단]');
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
    'BIRTH_YEAR_OPTIONS',
  ) &&
  currentText.includes(
    'newWorker.birthYear',
  ) &&
  !currentText.includes(
    'newWorker.birthDate',
  )
) {
  console.log(
    '[v52.42] 이미 적용된 상태입니다.',
  );
  process.exit(0);
}

const actual =
  blobSha(current);

if (actual !== EXPECTED) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/MonthlyLaborManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 v52.41 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

const next =
  fs.readFileSync(
    SOURCE,
    'utf8',
  );

for (const marker of [
  'BIRTH_YEAR_OPTIONS',
  'BIRTH_MONTH_OPTIONS',
  'getBirthDayOptions',
  'buildBirthDate',
  'label="생년"',
  'label="월"',
  'label="일"',
  'p_birth_date:\n              birthDate',
]) {
  if (!next.includes(marker)) {
    fail(
      `릴리즈 파일 검증 실패: ${marker}`,
    );
  }
}

for (const marker of [
  'type="date"',
  'newWorker.birthDate',
]) {
  if (next.includes(marker)) {
    fail(
      `기존 생년월일 입력 방식이 남아있습니다: ${marker}`,
    );
  }
}

const stamp =
  new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

const backup = path.join(
  ROOT,
  `backup_v52.42_${stamp}`,
  'src',
  'page',
  'MonthlyLaborManagement.jsx',
);

fs.mkdirSync(
  path.dirname(backup),
  { recursive: true },
);

fs.copyFileSync(
  TARGET,
  backup,
);

fs.copyFileSync(
  SOURCE,
  TARGET,
);

console.log('\n[v52.42 적용 완료]');
console.log('- 월별 노임작성 신규 근로자 등록의 생년월일 겹침 문제 제거');
console.log('- 브라우저 기본 date picker 제거');
console.log('- 근로자 정보관리와 동일한 생년/월/일 방식으로 통일');
console.log('- 생년은 검색형, 월/일은 선택형');
console.log('- 윤년 및 월별 말일 자동 반영');
console.log('- RPC에는 기존과 동일하게 YYYY-MM-DD 형식 전달');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('다음 명령: npm run build');
