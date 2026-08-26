const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.44';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.44');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      '5282871c3629b68d2ec9689da83e08d50068002332a7a4e0b83578e2010e6787',
    ],
    releaseHash:
      'cc590b591b911e7d692aaa92bbf360795168028d48f543e20de4984ee66d1058',
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
    fail(`v52.48.5.44.43 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.44_${timestamp}`,
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
console.log('- iframe/innerHTML 출력 복제 제거');
console.log('- 현재 문서의 MUI/Emotion 스타일을 그대로 사용하는 DOM clone 출력으로 변경');
console.log('- 필로티 SVG 대각선 비정상 확대 방지');
console.log('- A4 가로 1페이지 자동 축소/중앙 정렬 유지');
console.log('- 화면 줌/이동 상태와 무관하게 원본 골구도 기준 출력');
console.log('- 새 Supabase SQL 없음');
