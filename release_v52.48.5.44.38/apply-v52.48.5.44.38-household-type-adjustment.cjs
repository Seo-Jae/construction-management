const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.38';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.38');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      '104b5b6582dc79d24eb97ec59945ebd96182b1cfa56f53886b430b1d21134ef4',
    ],
    releaseHash:
      '03c07c1cc3fe8edef369b03b01c3101a82364f0b6cfd6f8a7b1f9c0e6817b87f',
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: [
      '9536a0c4091231270ca999103a0f9e4064a33a45c42c14a872c8545a46e74ff5',
    ],
    releaseHash:
      '7074a7a8e6ef408734cbe0ab3702557019bde3c8c4e73c459b6bc545556b2e15',
  },
];

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex');
}

const resolvedFiles = files.map((file) => ({
  ...file,
  target: path.resolve(projectRoot, file.relativePath),
  source: path.resolve(releaseRoot, 'files', file.relativePath),
}));

resolvedFiles.forEach((file) => {
  if (!fs.existsSync(file.source)) {
    fail(`릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }
  if (sha256(file.source) !== file.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  }
  if (!fs.existsSync(file.target)) {
    fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.38_${timestamp}`,
    file.relativePath,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.copyFileSync(file.source, file.target);
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) {
    fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 상단 공제물량 명칭을 증감물량으로 변경');
console.log('- 하단 옵션 자동합계를 타입별로 합산하여 상단 증감물량에 자동 반영');
console.log('- 상단 자동합계 = 소계 - 증감물량');
console.log('- Excel도 SUMIF 타입별 집계와 동일 계산식 적용');
console.log('- 새 Supabase SQL 없음');
