const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.33';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.33');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      'dabb28b30f80af8382286cf44a55879f7311af009695481448d8454a707a5329',
    ],
    releaseHash: '1e24521b307cecbab745e71526c3b9fb687b9ebc037c4d2b54eb069207866d1d',
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: [
      '3488adfd24eecd73541c85d4f16da481264fc458f7c69e7bac0c4028d97b057f',
    ],
    releaseHash: '6057bd496f4e846e77af4d8c2d91a78dc944045044c44dcf0730ac13a535df20',
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
    `backup_v52.48.5.44.33_${timestamp}`,
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
console.log('- 선택 공정 탭 밑줄 배율 오차 수정');
console.log('- 화면·Excel 단열 기준 명칭을 기본옵션으로 통일');
console.log('- 비단열 공정 기본옵션 값은 - 유지');
console.log('- 새 Supabase SQL 없음');
