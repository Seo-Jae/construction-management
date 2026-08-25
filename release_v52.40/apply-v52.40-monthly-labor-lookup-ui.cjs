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

const EXPECTED = '484174dea0007144693de00fb03317ddc093bf62';

function fail(message) {
  console.error('\n[v52.40 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header = Buffer.from(
    `blob ${buffer.length}\0`,
  );

  return crypto
    .createHash('sha1')
    .update(Buffer.concat([header, buffer]))
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
  currentText.includes('RemoveCircleOutlineRoundedIcon') &&
  currentText.includes(
    '실제 출역일자·일급·노임금액 입력과 노임 계산은',
  ) &&
  !currentText.includes('출역·노임 입력')
) {
  console.log('[v52.40] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actual = blobSha(current);

if (actual !== EXPECTED) {
  fail(
    '기존 기능 보호를 위해 적용하지 않았습니다.\n' +
    'src/page/MonthlyLaborManagement.jsx\n' +
    `예상 Git blob SHA: ${EXPECTED}\n` +
    `현재 Git blob SHA: ${actual}\n\n` +
    '현재 파일이 v52.39 최신 main 기준과 다릅니다. git status를 확인해주세요.',
  );
}

const next = fs.readFileSync(SOURCE, 'utf8');

const required = [
  'RemoveCircleOutlineRoundedIcon',
  'CheckBoxOutlineBlankRoundedIcon',
  '근로자 위로 이동',
  'whiteSpace: \'nowrap\'',
  '실제 출역일자·일급·노임금액 입력과 노임 계산은',
];

for (const marker of required) {
  if (!next.includes(marker)) {
    fail(`릴리즈 파일 검증 실패: ${marker}`);
  }
}

for (const marker of [
  '출역·노임 입력',
  '노임입력',
  '총 출역',
  '실지급 예상',
]) {
  if (next.includes(marker)) {
    fail(`불필요 노임작성 UI가 남아있습니다: ${marker}`);
  }
}

const stamp = new Date()
  .toISOString()
  .replace(/[:.]/g, '-');

const backup = path.join(
  ROOT,
  `backup_v52.40_${stamp}`,
  'src',
  'page',
  'MonthlyLaborManagement.jsx',
);

fs.mkdirSync(
  path.dirname(backup),
  { recursive: true },
);

fs.copyFileSync(TARGET, backup);
fs.copyFileSync(SOURCE, TARGET);

console.log('\n[v52.40 적용 완료]');
console.log('- 월별 노임작성 화면을 근로자 조회/선별/Excel 다운로드 준비 용도로 정리');
console.log('- 출역/일급/총지급/공제/실지급/노임입력 UI 제거');
console.log('- 체크박스 깨짐 보정');
console.log('- 순번 줄바꿈 방지');
console.log('- +/삭제/↑/↓를 공정별 노임작성과 같은 스타일/아이콘으로 통일');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('Supabase v52.40 SQL도 실행해야 Excel 준비검사가 새 업무방향과 일치합니다.');
console.log('다음 명령: npm run build');
