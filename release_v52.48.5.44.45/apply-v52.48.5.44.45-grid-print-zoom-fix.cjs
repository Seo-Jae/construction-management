const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.45';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.45');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      'cc590b591b911e7d692aaa92bbf360795168028d48f543e20de4984ee66d1058',
    ],
    releaseHash:
      '40c4e6208ba9c7db2260ad532e82f5ce3b686f460d9e01335ce2a085c27ccb9b',
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
    fail(`v52.48.5.44.44 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.45_${timestamp}`,
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
console.log('- A4 가로 출력 시 100% 확대 제한 제거');
console.log('- 작은 골구도도 한 페이지 출력영역까지 자동 확대');
console.log('- 화면 줌을 transform: scale() 대신 CSS zoom으로 변경');
console.log('- 이동 좌표를 정수 픽셀로 맞춰 글자/선 흐림 최소화');
console.log('- 출력 시 화면 줌 배율은 강제로 100% 원본 기준으로 초기화');
console.log('- 새 Supabase SQL 없음');
