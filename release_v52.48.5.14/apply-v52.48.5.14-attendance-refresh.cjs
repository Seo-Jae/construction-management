const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.14';
const projectRoot = process.cwd();
const entry = {
  relativePath: 'src/page/AttendanceManagement.jsx',
  baseHash: '848ba1b489b9f942ef8c2ded823519ae96ecc2f4',
  targetHash: '8936aaee80ca1e1ce5d315842f1ee6bd9a042498',
};

function normalizedTextContents(filePath) {
  const contents = fs.readFileSync(filePath);
  const normalized = contents
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  return Buffer.from(normalized, 'utf8');
}

function gitBlobHash(filePath) {
  const contents = normalizedTextContents(filePath);
  const header = Buffer.from(`blob ${contents.length}\0`);
  return crypto.createHash('sha1').update(header).update(contents).digest('hex');
}

function fail(message) {
  console.error(`\n[적용 중단] ${message}`);
  process.exit(1);
}

const payloadPath = path.join(__dirname, 'files', entry.relativePath);
const destinationPath = path.join(projectRoot, entry.relativePath);

if (!fs.existsSync(payloadPath)) {
  fail(`패키지 안의 교체 파일이 없습니다: ${entry.relativePath}`);
}
if (gitBlobHash(payloadPath) !== entry.targetHash) {
  fail(`패키지 파일 검증에 실패했습니다: ${entry.relativePath}`);
}
if (!fs.existsSync(destinationPath)) {
  fail(`기준 파일이 없습니다: ${entry.relativePath}`);
}

const currentHash = gitBlobHash(destinationPath);
if (currentHash === entry.targetHash) {
  console.log(`${VERSION} 수정이 이미 적용되어 있습니다. 추가 작업은 필요하지 않습니다.`);
  process.exit(0);
}
if (currentHash !== entry.baseHash) {
  fail(
    `${entry.relativePath} 내용이 예상 기준 버전과 다릅니다. ` +
      '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
  );
}

const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_${VERSION}_${safeTimestamp}`);
const backupPath = path.join(backupRoot, entry.relativePath);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(destinationPath, backupPath);

fs.copyFileSync(payloadPath, destinationPath);
if (gitBlobHash(destinationPath) !== entry.targetHash) {
  fail(`적용 후 파일 검증에 실패했습니다: ${entry.relativePath}`);
}

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 근태관리 각 탭의 새로고침을 동일한 원형 아이콘으로 통일');
console.log('- 기기 변경·근태 기록·변경 이력 새로고침 추가');
console.log('- 진척 승인 새로고침을 공통 아이콘 형태로 변경');
console.log('- 근태 기록 날짜 좌우에 이전일·다음일 이동 버튼 추가');
console.log('- 날짜 이동 시 해당 일자 근태자료 자동 조회');
console.log('- Windows CRLF 줄바꿈 파일도 안전하게 기준 버전으로 인식');
console.log(`- 원본 백업: ${backupRoot}`);
