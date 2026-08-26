const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.25';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.25');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash: 'e2e222a1f1b67861c1a55715f4fcb28b00fac566eb6f11bacbc52cf8b68671c1',
    releaseHash: '71cce4f68be56799b170e84dfcf7cf489522e1211d548ce57a78bfbd877e608e',
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
  if (!fs.existsSync(file.target) || !fs.existsSync(file.source)) {
    fail(`대상 또는 릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }

  if (sha256(file.source) !== file.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  }

  const targetHash = sha256(file.target);

  if (targetHash !== file.baseHash && targetHash !== file.releaseHash) {
    fail(`v52.48.5.44.24 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;

  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.25_${timestamp}`,
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
console.log('- 옵션현황(선택) 기존 요약행 삭제');
console.log('- 선택 옵션 기준 세대수 단일 표시');
console.log('- 비교 카드 옵션명·해당 세대수 표시');
console.log('- 비교 카드 X 즉시 해제');
console.log('- 새 Supabase SQL 실행 없음');
