const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.23';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.23');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash: '1668fa5ef4105f86eb005a2c99997e04105835fde80b113380a1a42cbb36af6b',
    releaseHash: 'e2e222a1f1b67861c1a55715f4fcb28b00fac566eb6f11bacbc52cf8b68671c1',
  },
  {
    relativePath: 'src/BuildingGrid.jsx',
    baseHash: '321d85f15b6282538a396cef3a01f7526761795053b9b5bd9810e0056220036a',
    releaseHash: 'f52ca94a08175279d04bb6072405a51d81296af9375faecfcc555b33e70c3785',
  },
];

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const resolvedFiles = files.map((file) => ({
  ...file,
  target: path.resolve(projectRoot, file.relativePath),
  source: path.resolve(releaseRoot, 'files', file.relativePath),
}));

resolvedFiles.forEach((file) => {
  if (!fs.existsSync(file.target) || !fs.existsSync(file.source)) {
    fail(`대상 또는 릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }
  if (sha256(file.source) !== file.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  }
  const targetHash = sha256(file.target);
  if (targetHash !== file.baseHash && targetHash !== file.releaseHash) {
    fail(`v52.48.5.44.22 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.23_${timestamp}`,
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
console.log('- 옵션선택 클릭 시 저장된 단열 옵션과 선택 옵션 표시');
console.log('- 비교 옵션 최대 6개 선택·변경·해제 및 중복선택 방지');
console.log('- 선택된 옵션 수만큼 세대 셀 균등 분할');
console.log('- 해당 세대에 적용된 옵션 분할칸만 지정 색상 표시');
console.log('- 새 Supabase SQL 실행 없음');
