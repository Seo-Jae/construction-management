const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.8';
const projectRoot = process.cwd();
const relativePath = 'src/page/AttendanceWorkerPortal.jsx';
const payloadPath = path.join(__dirname, 'files', relativePath);
const destinationPath = path.join(projectRoot, relativePath);
const baseHash = 'ca6ad7978dc6de60c98893cf508bb5d75e49b3bd';
const targetHash = 'b7dcbf10f74611b3eed7f4f3c0938f9dec3236cd';

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
    `${relativePath} 내용이 예상 버전(v52.48.5.7)과 다릅니다. ` +
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
console.log('- 로그인 후 우측 상단에 Language 선택 추가');
console.log('- Language 선택을 나가기 버튼 왼쪽에 배치');
console.log('- 선택 즉시 작업자 화면의 고정 번역 문구 변경');
console.log('- 좁은 휴대폰에서도 상단 메뉴가 겹치지 않도록 조정');
console.log(`- 원본 백업: ${backupPath}`);
console.log('- 이번 버전은 추가 Supabase SQL이 없습니다.');
