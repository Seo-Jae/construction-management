const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.24';
const projectRoot = process.cwd();

const entries = [
  {
    relativePath: 'src/page/UnitPriceAnalysis.jsx',
    baseHash: 'c50aac0f574588ee6bf44e3ede9da4f543cc13d5',
    targetHash: 'd837c710fba2d0d5e49a931ad5505dbb87eb150e',
  },
];

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

const states = entries.map((entry) => {
  const payloadPath = path.join(__dirname, 'files', entry.relativePath);
  const destinationPath = path.join(projectRoot, entry.relativePath);

  if (!fs.existsSync(payloadPath)) {
    fail(`패키지 안의 적용 파일이 없습니다: ${entry.relativePath}`);
  }
  if (gitBlobHash(payloadPath) !== entry.targetHash) {
    fail(`패키지 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
  if (!fs.existsSync(destinationPath)) {
    fail(`v52.48.5.23 기준 파일이 없습니다: ${entry.relativePath}`);
  }

  const currentHash = gitBlobHash(destinationPath);
  if (currentHash === entry.targetHash) {
    return { ...entry, payloadPath, destinationPath, state: 'applied' };
  }
  if (currentHash !== entry.baseHash) {
    fail(
      `${entry.relativePath} 내용이 v52.48.5.23 기준과 다릅니다. ` +
        '기존 변경을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
  }

  return { ...entry, payloadPath, destinationPath, state: 'replace' };
});

if (states.every((entry) => entry.state === 'applied')) {
  console.log(`${VERSION} 수정이 이미 적용되어 있습니다. 추가 작업은 필요하지 않습니다.`);
  process.exit(0);
}

const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(projectRoot, `backup_${VERSION}_${safeTimestamp}`);

states.forEach((entry) => {
  if (entry.state !== 'replace') return;
  const backupPath = path.join(backupRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(entry.destinationPath, backupPath);
});

states.forEach((entry) => {
  if (entry.state === 'applied') return;
  fs.mkdirSync(path.dirname(entry.destinationPath), { recursive: true });
  fs.copyFileSync(entry.payloadPath, entry.destinationPath);
  if (gitBlobHash(entry.destinationPath) !== entry.targetHash) {
    fail(`적용 후 파일 검증에 실패했습니다: ${entry.relativePath}`);
  }
});

console.log(`\n${VERSION} 코드 적용 완료`);
console.log('- 항목할증률을 제출수량이 아닌 제출금액에 적용');
console.log('- 할증이 있어도 제출수량은 정미수량과 동일하게 유지');
console.log('- 기존 문서의 구 방식 자동 할증수량을 새 계산 기준으로 보정');
console.log('- 하단 기본 할증률 및 문서 비고 입력 영역 제거');
console.log(`- 원본 백업: ${backupRoot}`);
console.log('- SQL 실행은 필요하지 않습니다.');
