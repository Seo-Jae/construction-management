const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.16';
const projectRoot = process.cwd();
const entry = {
  relativePath: 'src/page/MonthlyWorkerStatus.jsx',
  baseHash: 'e26acd9021107973d76b01a08eaf4afd0fb00e2e',
  targetHash: '25f7409f35d30b8c035b8e7c56f2367cb6745a4f',
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
console.log('- 금월 투입현황 날짜 영역을 매월 31칸으로 고정');
console.log('- 28·29·30일로 끝나는 달은 남은 칸에 다음 달 날짜 표시');
console.log('- 다음 달 날짜 칸은 회색 배경으로 구분하고 근태 숫자 제외');
console.log('- 다음 달 날짜는 해당 월로 이동했을 때만 정상 근태 표시');
console.log('- 소계 행의 다음 달 날짜 칸도 회색 빈칸으로 유지');
console.log('- Windows CRLF 줄바꿈 파일도 안전하게 기준 버전으로 인식');
console.log(`- 원본 백업: ${backupRoot}`);
