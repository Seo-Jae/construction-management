const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.53';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.53');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const files = [
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['ded74644e6cf75b33279d4b8974f3aa92a8b669396c6013e68b59b887e7cc62c'],
    releaseHash: '5e3615a1305f3b2da6b36b3f7a9d411c0d14f19b818ec24a293726dd0482538b',
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
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.53_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 가이드 좌측에 고정 목차 패널 추가');
console.log('- 스크롤 시 목차 패널은 화면에 고정되어 따라옴');
console.log('- 목차 클릭 시 사용 순서/각 상세 가이드 위치로 부드럽게 이동');
console.log('- 현재 보고 있는 항목을 목차에서 강조 표시');
console.log('- 가이드 본문을 우측 영역에 배치해 기존 좌우 여백 활용');
console.log('- 기존 이미지/주석/가이드 데이터 변경 없음');
