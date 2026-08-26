const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.22';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.22');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const relativePath = 'src/page/OptionManagementOverview.jsx';
const baseHash = '5e7854390d23074b0fc8b1ef118b4a62cb56dc69897c7190f887842c61bb7b90';
const releaseHash = '1668fa5ef4105f86eb005a2c99997e04105835fde80b113380a1a42cbb36af6b';

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
    fail(`v52.48.5.44.21 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${relativePath}`);
  }
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.22_${timestamp}`,
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
console.log('- 옵션별 비교 상단에 파스텔 색상 옵션선택 박스 6개 배치');
console.log('- 기존 기준 옵션/비교 옵션 비활성 입력칸 제거');
console.log('- 파란색 임시 안내문 제거');
console.log('- 등록 동/전체 세대/비교 옵션 미선택 현황칩 제거');
console.log('- 새 Supabase SQL 실행 없음');
