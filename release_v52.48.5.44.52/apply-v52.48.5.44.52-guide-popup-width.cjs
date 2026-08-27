const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.52';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.52');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const files = [
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['013fba73727981b53a7e079d35c4abb09644009cd645ec135c5d7eae03cce210'],
    releaseHash: 'ded74644e6cf75b33279d4b8974f3aa92a8b669396c6013e68b59b887e7cc62c',
  },
];

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}
function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const resolved = files.map((file) => ({
  ...file,
  target: path.resolve(projectRoot, file.relativePath),
  source: path.resolve(releaseRoot, 'files', file.relativePath),
}));

resolved.forEach((file) => {
  if (!fs.existsSync(file.source)) fail(`릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  if (sha256(file.source) !== file.releaseHash) fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  if (!fs.existsSync(file.target)) fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolved.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.52_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 가이드 팝업 최대 폭을 축소해 좌우 빈 여백 최소화');
console.log('- 본문/가이드 이미지 크기를 강제로 확대하지 않고 팝업 창 자체를 축소');
console.log('- 고해상도 화면에서도 팝업 폭 최대 1360px 기준');
console.log('- 화면 가용 폭 약 76% 기준으로 중앙 배치');
console.log('- 기존 가이드 내용/주석/DB 데이터 변경 없음');
