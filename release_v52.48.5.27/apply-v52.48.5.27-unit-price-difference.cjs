const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.27';
const projectRoot = process.cwd();
const relativePath = 'src/page/UnitPriceAnalysis.jsx';
const destinationPath = path.join(projectRoot, relativePath);
const baseHash = '062bdccea5b86ed03c8311597683bf68d5c2dbb3';
const targetHash = '0a99e1109b6d1481edfcbc586c3afc1af60c587c';

function normalize(contents) {
  return contents
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
}

function gitBlobHash(contents) {
  const buffer = Buffer.from(contents, 'utf8');
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1').update(header).update(buffer).digest('hex');
}

function fail(message) {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
}

function replaceOnce(contents, before, after, label) {
  const firstIndex = contents.indexOf(before);
  if (firstIndex < 0) fail(`${label} 수정 위치를 찾을 수 없습니다.`);
  if (contents.indexOf(before, firstIndex + before.length) >= 0) {
    fail(`${label} 수정 위치가 여러 곳 발견되어 안전하게 적용할 수 없습니다.`);
  }
  return contents.slice(0, firstIndex) + after + contents.slice(firstIndex + before.length);
}

if (!fs.existsSync(destinationPath)) {
  fail(`적용 대상 파일이 없습니다: ${relativePath}`);
}

let contents = normalize(fs.readFileSync(destinationPath));
const currentHash = gitBlobHash(contents);

if (currentHash === targetHash) {
  console.log(`${VERSION} 수정이 이미 적용되어 있습니다. 추가 작업은 필요하지 않습니다.`);
  process.exit(0);
}

if (currentHash !== baseHash) {
  fail(
    `${relativePath} 내용이 v52.48.5.26 기준과 다릅니다. ` +
      '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
  );
}

contents = replaceOnce(
  contents,
  `  const grandSubmitted = (\n    totals.material.submitted + totals.labor.submitted + totals.expense.submitted\n  );\n\n  const resetDocument`,
  `  const grandSubmitted = (\n    totals.material.submitted + totals.labor.submitted + totals.expense.submitted\n  );\n  const grandDifference = grandSubmitted - grandNet;\n  const grandMarkupRate = grandNet === 0\n    ? 0\n    : (grandDifference / grandNet) * 100;\n\n  const resetDocument`,
  '차액 및 할증률 계산',
);

contents = replaceOnce(
  contents,
  `                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800 }}>제출</Typography>\n                      <Typography sx={{ textAlign: 'right', fontSize: '0.92rem', fontWeight: 950 }}>{formatMoney(grandSubmitted)}원</Typography>`,
  `                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800 }}>제출</Typography>\n                      <Typography sx={{ textAlign: 'right', fontSize: '0.92rem', fontWeight: 950 }}>{formatMoney(grandSubmitted)}원</Typography>\n                      <Typography sx={{ mt: 0.2, pt: 0.45, borderTop: '1px solid rgba(255,255,255,0.18)', fontSize: '0.66rem', opacity: 0.8 }}>차액</Typography>\n                      <Typography sx={{ mt: 0.2, pt: 0.45, borderTop: '1px solid rgba(255,255,255,0.18)', textAlign: 'right', fontSize: '0.76rem', fontWeight: 850, color: grandDifference > 0 ? '#fca5a5' : grandDifference < 0 ? '#93c5fd' : '#fff' }}>\n                        {grandDifference > 0 ? '+' : ''}{formatMoney(grandDifference)}원\n                      </Typography>\n                      <Typography sx={{ fontSize: '0.66rem', opacity: 0.8 }}>할증률</Typography>\n                      <Typography sx={{ textAlign: 'right', fontSize: '0.76rem', fontWeight: 850, color: grandMarkupRate > 0 ? '#fca5a5' : grandMarkupRate < 0 ? '#93c5fd' : '#fff' }}>\n                        {grandMarkupRate > 0 ? '+' : ''}{grandMarkupRate.toFixed(2)}%\n                      </Typography>`,
  '총 일위대가 차액 표시',
);

if (gitBlobHash(contents) !== targetHash) {
  fail('수정 결과 검증에 실패했습니다. 원본 파일은 변경하지 않았습니다.');
}

const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  projectRoot,
  `backup_${VERSION}_${safeTimestamp}`,
  relativePath,
);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(destinationPath, backupPath);

fs.writeFileSync(destinationPath, contents, 'utf8');
if (gitBlobHash(normalize(fs.readFileSync(destinationPath))) !== targetHash) {
  fail(`적용 후 파일 검증에 실패했습니다. 백업 위치: ${backupPath}`);
}

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 1㎡당 총 일위대가 아래에 차액 표시');
console.log('- 정미 대비 제출 할증률을 소수점 둘째 자리까지 표시');
console.log('- 입력값 변경 시 차액과 할증률 실시간 재계산');
console.log('- 이번 버전은 Supabase SQL 실행 불필요');
console.log(`- 원본 백업: ${path.dirname(path.dirname(path.dirname(backupPath)))}`);
