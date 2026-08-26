const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.19';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.19');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const relativePath = 'src/utils/optionSelectionExcel.js';
const baseHash = 'b3c426b6ba009ef1e0b148f7d82486bd862d6cbfe5d935bf7497184a036e9392';
const releaseHash = 'b3ab445f11403e8fce1301c530acb39549d5f901c88156fed8c2b5df54097b5f';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const target = path.resolve(projectRoot, relativePath);
const source = path.resolve(releaseRoot, 'files', relativePath);
if (!fs.existsSync(target) || !fs.existsSync(source)) {
  fail(`대상 또는 릴리스 파일을 찾을 수 없습니다: ${relativePath}`);
}
if (sha256(source) !== releaseHash) {
  fail(`릴리스 파일이 변경되었습니다: ${relativePath}`);
}

const targetHash = sha256(target);
if (targetHash !== releaseHash) {
  if (targetHash !== baseHash) {
    fail(`v52.48.5.44.18 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${relativePath}`);
  }
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.19_${timestamp}`,
    relativePath,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target, backupPath);
  fs.copyFileSync(source, target);
}

if (sha256(target) !== releaseHash) {
  fail(`적용 후 해시가 일치하지 않습니다: ${relativePath}`);
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- D5:U5 옵션명 글자색 검정으로 통일');
console.log('- D5:U5 가로·세로 가운데정렬 및 셀에 맞춤 적용');
console.log('- D:U 열너비 12 적용');
console.log('- D6:U 전체 생성 세대행 가로·세로 가운데정렬');
console.log('- 새 Supabase SQL 실행 없음');
