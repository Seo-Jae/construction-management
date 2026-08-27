const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.56';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.56');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const files = [
  {
    relativePath: 'src/utils/systemGuidePopup.js',
    baseHashes: ['c333de0060794531e3c3020a95ef8966e3eb8d7735e9939d79cc127cca86571b'],
    releaseHash: '7cdcf16ced6282ed419c5302f9b64a10bafbc941fb88ccb55bf40f4577e56be6',
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
  const backupPath = path.resolve(projectRoot, `backup_v52.48.5.44.56_${timestamp}`, file.relativePath);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(file.target, backupPath);
  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolved.forEach((file) => {
  if (sha256(file.target) !== file.releaseHash) fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 가이드 목차의 최하단 상세항목 활성 표시 오류 수정');
console.log('- 마지막 가이드에서는 페이지가 더 내려가지 못하더라도 마지막 목차가 활성 상태로 유지');
console.log('- 기존 목차 클릭/부드러운 이동/스크롤 위치 추적은 그대로 유지');
console.log('- 추가 Supabase SQL 없음');
