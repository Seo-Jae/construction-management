const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.17';
const projectRoot = process.cwd();

const entries = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash: '08c77ce4d6926099a53807d4407a67a83dddedaa',
    targetHash: '52cb97e4239797c04718b98dd8ea3b234e8156ad',
  },
  {
    relativePath: 'src/components/Sidebar.jsx',
    baseHash: '705fdc97fceb18f925711c5a4dc798c13d6332a0',
    targetHash: 'a11714a502c2fbb0e1a95f601c76d8bf443adb0d',
  },
  {
    relativePath: 'src/page/UnitPriceAnalysis.jsx',
    baseHash: null,
    targetHash: 'd97a36e8330bf36ed530461111ab949ff92a35b9',
  },
  {
    relativePath: 'supabase/v52.48.5.17_unit_price_analysis.sql',
    baseHash: null,
    targetHash: '8e7c3bca92f08379b8436aed4ebf0e912a4dc65a',
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
      fail(`기준 파일이 없습니다: ${entry.relativePath}`);
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
      `${entry.relativePath} 내용이 예상 기준 버전과 다릅니다. ` +
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
console.log('- 자재관리 > 일위대가작성 메뉴 추가');
console.log('- 벽체·천정 69개 규격 및 Excel 기준 자재 데이터 준비');
console.log('- 정미값/제출용 할증, 항목별 할증과 제출수량 직접 수정');
console.log('- 문서 저장, 버전 이력, 타 현장 복사, 출력/PDF, Excel 다운로드');
console.log('- 자재 단가 개별·일괄 변경과 변경 이력');
console.log('- 기술자료 이미지는 추후 image_url 연결 가능');
console.log('- 다음 단계: Supabase SQL Editor에서 SQL 파일 전체 실행');
if (states.some((entry) => entry.state === 'replace')) {
  console.log(`- 원본 백업: ${backupRoot}`);
}
