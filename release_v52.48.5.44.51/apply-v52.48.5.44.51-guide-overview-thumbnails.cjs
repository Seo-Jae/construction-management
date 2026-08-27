const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.51';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.51');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const files = [
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['3dec17330561c06228d38fa1f6c43f14d3279e3f382256c857c42d3d8f9682be'],
    releaseHash: '013fba73727981b53a7e079d35c4abb09644009cd645ec135c5d7eae03cce210',
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
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.51_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 사용 순서 한눈에 보기: 모든 썸네일 박스 16:9 고정');
console.log('- 썸네일 이미지는 박스 안에 object-fit: contain으로 자동 맞춤, 스크롤바 제거');
console.log('- 한눈에 보기에서는 번호/점선박스/화살표/설명박스 주석 미표시');
console.log('- 한눈에 보기 하단은 화면 제목 + 하단 대표 안내 문구만 표시');
console.log('- 상세 이용가이드는 기존 주석/설명 그대로 유지');
console.log('- DB 스키마 변경 없음');
