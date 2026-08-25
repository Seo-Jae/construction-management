const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'utils', 'laborWorkerExcelImport.js');
const SOURCE = path.join(__dirname, 'src', 'utils', 'laborWorkerExcelImport.js');
const EXPECTED_SHA = '70011bc2ead8522ce6eba12d2e892bc9d9af9cbe';

function fail(message) {
  console.error('\n[v52.47.1 적용 중단]');
  console.error(message);
  process.exit(1);
}

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1')
    .update(Buffer.concat([header, buffer]))
    .digest('hex');
}

if (!fs.existsSync(TARGET)) fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
if (!fs.existsSync(SOURCE)) fail(`패치 원본 파일을 찾을 수 없습니다: ${SOURCE}`);

const current = fs.readFileSync(TARGET);
const currentText = current.toString('utf8');

if (
  currentText.includes("domesticForeign !== '내국인'") &&
  currentText.includes("['소계', '합계', '총계', '계']")
) {
  console.log('[v52.47.1] 이미 적용된 상태입니다.');
  process.exit(0);
}

const actualSha = blobSha(current);
if (actualSha !== EXPECTED_SHA) {
  fail(
    '현재 laborWorkerExcelImport.js가 v52.47 최신 main 기준과 다릅니다.\n' +
    `예상 Git blob SHA: ${EXPECTED_SHA}\n` +
    `현재 Git blob SHA: ${actualSha}\n\n` +
    'git status를 확인한 뒤 다시 시도해주세요.'
  );
}

const nextText = fs.readFileSync(SOURCE, 'utf8');
for (const marker of [
  "domesticForeign !== '내국인'",
  "domesticForeign !== '외국인'",
  "['소계', '합계', '총계', '계']",
  '소계/합계/총계',
]) {
  if (!nextText.includes(marker)) fail(`패치 결과 필수 마커 누락: ${marker}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(
  ROOT,
  `backup_v52.47.1_${stamp}`,
  'src',
  'utils',
  'laborWorkerExcelImport.js',
);
fs.mkdirSync(path.dirname(backup), { recursive: true });
fs.copyFileSync(TARGET, backup);
fs.writeFileSync(TARGET, nextText, 'utf8');

console.log('\n[v52.47.1 적용 완료]');
console.log('- D열 내/외국인 값이 내국인 또는 외국인인 행만 근로자로 인식');
console.log('- 소계/합계/총계/계 행 2차 제외');
console.log('- A:H 병합 소계행이 근로자 미리보기에 나타나는 문제 수정');
console.log(`- 백업: ${backup}`);
console.log('');
console.log('SQL 변경 없음. 다음 명령: npm run build');
