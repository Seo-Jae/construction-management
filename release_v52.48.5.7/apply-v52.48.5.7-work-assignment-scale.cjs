const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.7';
const projectRoot = process.cwd();
const relativePath = 'src/components/AttendanceWorkAssignmentDialog.jsx';
const payloadPath = path.join(__dirname, 'files', relativePath);
const destinationPath = path.join(projectRoot, relativePath);
const baseHash = 'af4468fb14a6814069b0f2f739aa29752556173a';
const targetHash = '384e31accf8ae76f845e3a1a9f4a783002102c76';

function gitBlobHash(filePath) {
  const contents = fs.readFileSync(filePath);
  const header = Buffer.from(`blob ${contents.length}\0`);
  return crypto.createHash('sha1').update(header).update(contents).digest('hex');
}

function fail(message) {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(payloadPath)) {
  fail(`패키지 안의 교체 파일이 없습니다: ${relativePath}`);
}
if (gitBlobHash(payloadPath) !== targetHash) {
  fail(`패키지 파일 검증에 실패했습니다: ${relativePath}`);
}
if (!fs.existsSync(destinationPath)) {
  fail(`기준 파일이 없습니다: ${relativePath}`);
}

const currentHash = gitBlobHash(destinationPath);
if (currentHash === targetHash) {
  console.log(`${VERSION} 수정이 이미 적용되어 있습니다. 추가 작업은 필요하지 않습니다.`);
  process.exit(0);
}
if (currentHash !== baseHash) {
  fail(
    `${relativePath} 내용이 예상 버전(v52.48.5.6)과 다릅니다. ` +
      '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
  );
}

const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = path.join(
  projectRoot,
  `backup_${VERSION}_${safeTimestamp}`,
  relativePath,
);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(destinationPath, backupPath);
fs.copyFileSync(payloadPath, destinationPath);

if (gitBlobHash(destinationPath) !== targetHash) {
  fail(`적용 후 파일 검증에 실패했습니다: ${relativePath}`);
}

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 출근 작업정보 입력 화면의 제목과 시작 위치 확대');
console.log('- 안내문·체크박스·선택값·항목 간격 확대');
console.log('- 펼친 선택 목록과 하단 버튼 확대');
console.log(`- 원본 백업: ${backupPath}`);
console.log('- 이번 버전은 추가 Supabase SQL이 없습니다.');
