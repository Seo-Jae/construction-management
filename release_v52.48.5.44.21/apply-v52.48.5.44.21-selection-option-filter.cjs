const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.21';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.21');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const relativePath = 'src/page/OptionManagementOverview.jsx';
const baseHash = '204d6f0df23f96c4337ec4d598d52d87b39c39b50dc3ed4f8a039be1c55ce70e';
const releaseHash = '5e7854390d23074b0fc8b1ef118b4a62cb56dc69897c7190f887842c61bb7b90';

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
    fail(`v52.48.5.44.20 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${relativePath}`);
  }
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.21_${timestamp}`,
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
console.log('- 옵션현황(선택) 상단 우측에 표시 옵션 선택창 1개 추가');
console.log('- 옵션 목록은 Excel D:AG 입력 순서대로 표시');
console.log('- 선택한 옵션에 해당하는 세대만 파란색으로 강조');
console.log('- 골구도 셀의 선택 개수 문구를 제거하고 호수 표시');
console.log('- 새 Supabase SQL 실행 없음');
