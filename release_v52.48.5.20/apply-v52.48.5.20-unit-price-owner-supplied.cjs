const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.20';
const projectRoot = process.cwd();

const entries = [
  {
    relativePath: 'src/page/UnitPriceAnalysis.jsx',
    baseHash: 'b10f817e75d8b999374d257ec92abafb828eb505',
    targetHash: '3c9c8a78e2c76ea330b5a09ee9f10f48aee0915d',
  },
  {
    relativePath: 'supabase/v52.48.5.20_unit_price_owner_supplied.sql',
    baseHash: null,
    targetHash: '67b84b64002f0ae437828683d09d7cff9cc38378',
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
    if (entry.baseHash) {
      fail(`v52.48.5.19 기준 파일이 없습니다: ${entry.relativePath}`);
    }
    return { ...entry, payloadPath, destinationPath, state: 'create' };
  }

  const currentHash = gitBlobHash(destinationPath);
  if (currentHash === entry.targetHash) {
    return { ...entry, payloadPath, destinationPath, state: 'applied' };
  }
  if (!entry.baseHash) {
    fail(
      `${entry.relativePath} 파일이 이미 있지만 이번 패키지 내용과 다릅니다. ` +
        '기존 파일을 보호하기 위해 자동 덮어쓰기를 하지 않았습니다.',
    );
  }
  if (currentHash !== entry.baseHash) {
    fail(
      `${entry.relativePath} 내용이 v52.48.5.19 기준과 다릅니다. ` +
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
console.log('- 구성표의 모든 머리글 가운데 정렬');
console.log('- 기존 비고 영역을 지급자재 여부와 비고로 분할');
console.log('- 지급자재 체크 시 재료비 정미·제출금액 및 합계에서 제외');
console.log('- 지급자재 상태 저장·불러오기·기본값·출력·Excel 연동');
console.log('- 다음 단계: Supabase SQL Editor에서 v52.48.5.20 SQL 파일 전체 실행');
if (states.some((entry) => entry.state === 'replace')) {
  console.log(`- 원본 백업: ${backupRoot}`);
}
