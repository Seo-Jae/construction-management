const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.39';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.39');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      '03c07c1cc3fe8edef369b03b01c3101a82364f0b6cfd6f8a7b1f9c0e6817b87f',
    ],
    releaseHash:
      '1df066ebd88b407abbf3571d007ca57553368eebcdfc9099d3675b6c826e29d4',
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: [
      '7074a7a8e6ef408734cbe0ab3702557019bde3c8c4e73c459b6bc545556b2e15',
    ],
    releaseHash:
      'fb71ef9f4e0d8cdec66d00805a97a4703967c24e351178f0dd84f015b68d5276',
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
    `backup_v52.48.5.44.39_${timestamp}`,
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
console.log('- 자동합계 계산을 소계 + 부호 포함 증감물량으로 수정');
console.log('- 예: 4,743.52 + (-42.86) = 4,700.66');
console.log('- 하단 표를 상단과 같은 9열 너비로 정렬');
console.log('- 하단 자동합계 명칭을 소계로 변경하고 뒤 2개 열 공란 처리');
console.log('- Excel 계산식과 9열 구조 동일 적용');
console.log('- 새 Supabase SQL 없음');
