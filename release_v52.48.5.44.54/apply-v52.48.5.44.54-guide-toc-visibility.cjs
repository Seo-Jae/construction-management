const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.54';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.54');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const files = [
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['5e3615a1305f3b2da6b36b3f7a9d411c0d14f19b818ec24a293726dd0482538b'],
    releaseHash: '695b9242906e773388c5716145160d49e0a01c8e94341e7f25e8a26403932a6a',
  },
  {
    relativePath: 'src/page/Guide.jsx',
    baseHashes: ['76c8564a0ca857db007e8eb0793a18534273efdc2ab2c7c5b69a6d712e22d854'],
    releaseHash: '667a5ea7b6c0b819a380741263a328a47ba2fa817fb47298e88b29a53c633903',
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
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.54_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 현재 스크롤 위치에 맞춰 좌측 목차 활성 항목 정확도 개선');
console.log('- 팝업 전체 배경을 시스템 가이드 상단과 같은 네이비 색상으로 통일');
console.log('- 목차 글씨 크기 및 가독성 확대');
console.log('- 각 상세 화면 설명/하단 대표 안내 문구 글씨 크기 확대');
console.log('- 가이드 설정 화면/순서 제목에서 Shift+Enter 줄바꿈 지원');
console.log('- 목차/상세 제목/한눈에 보기 제목에 줄바꿈 그대로 반영');
console.log('- 추가 Supabase SQL 없음');
