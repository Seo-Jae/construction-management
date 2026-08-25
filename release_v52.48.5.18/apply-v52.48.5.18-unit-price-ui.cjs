const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.18';
const projectRoot = process.cwd();

const entries = [
  {
    relativePath: 'src/page/UnitPriceAnalysis.jsx',
    baseHash: 'd97a36e8330bf36ed530461111ab949ff92a35b9',
    targetHash: '953cc7e9fc531d6f6f2adf4d5a7a6f74ad0e6588',
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
    fail(`v52.48.5.17 기준 파일이 없습니다: ${entry.relativePath}`);
  }

  const currentHash = gitBlobHash(destinationPath);
  if (currentHash === entry.targetHash) {
    return { ...entry, payloadPath, destinationPath, state: 'applied' };
  }
  if (currentHash !== entry.baseHash) {
    fail(
      `${entry.relativePath} 내용이 v52.48.5.17 기준과 다릅니다. ` +
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
console.log('- 1㎡당 구성 항목의 글자와 입력 박스 크기 축소');
console.log('- 순서 열을 체크박스로 변경하고 상단에 + / − / ↑ / ↓ 배치');
console.log('- 행 우측의 개별 삭제 버튼 제거');
console.log('- 상단 도움말 제거 및 새 작성·저장·출력·Excel·새로고침 아이콘 배치');
console.log('- 금액 요약 하단의 기존 실행 버튼 제거');
console.log(`- 원본 백업: ${backupRoot}`);
console.log('- SQL 실행은 필요하지 않습니다.');
