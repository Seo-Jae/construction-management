const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 'v52.48.5.26';
const projectRoot = process.cwd();

const entries = [
  {
    relativePath: 'src/page/UnitPriceAnalysis.jsx',
    baseHash: 'af008fd0ea703b41e0f2be5fa4c115503f15768f',
    targetHash: '062bdccea5b86ed03c8311597683bf68d5c2dbb3',
  },
  {
    relativePath: 'supabase/v52.48.5.26_unit_price_material_rounding.sql',
    baseHash: null,
    targetHash: '862d3f3c3df344a258f335839e4eedc8e490de3f',
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
      fail(`v52.48.5.25 기준 파일이 없습니다: ${entry.relativePath}`);
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
      `${entry.relativePath} 내용이 v52.48.5.25 기준과 다릅니다. ` +
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
console.log('- 경비(단수정리)를 재료비(단수정리)로 정정');
console.log('- 단수정리 선택 시 품명과 규격을 빈칸으로 유지');
console.log('- 노무비 정미수량 칸에 계산된 인 수량 표시');
console.log('- 정미수량 클릭 시 작은 ㎡당 노무비 입력 팝업 표시');
console.log('- Enter 또는 적용 버튼으로 계산값 반영');
console.log('- 다음 단계: Supabase SQL Editor에서 v52.48.5.26 SQL 파일 전체 실행');
if (states.some((entry) => entry.state === 'replace')) {
  console.log(`- 원본 백업: ${backupRoot}`);
}
