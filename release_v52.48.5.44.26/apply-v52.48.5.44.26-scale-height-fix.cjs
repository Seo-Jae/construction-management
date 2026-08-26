const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.26';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.26');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash: '5371c33f4022e32550d3f159882e9f56b73429e2ca8d7776c2bc8f7fe16d8fef',
    releaseHash: 'a10a71aa01ab8f37f6d55714ed6c2ddac500944e800ae111d83d1b963ce8f240',
  },
  {
    relativePath: 'src/index.css',
    baseHash: '3477af99ac5fdb1caa0cd502933dfcb83911ce150c458b52bdcf78314f7bebc7',
    releaseHash: '867655feb48429a8ac556575c7eb75f592c1db66d637a40333f827b289d9c411',
  },
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash: '71cce4f68be56799b170e84dfcf7cf489522e1211d548ce57a78bfbd877e608e',
    releaseHash: 'a14518c394bd2d8394ed7218d6c6f8deeb8a0a88646aba96eda0c8c6bfb4b6c2',
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
    fail(`v52.48.5.44.25 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;

  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.26_${timestamp}`,
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
console.log('- 90% 화면배율 가용높이 역보정');
console.log('- 대시보드·본문·좌측 메뉴·팝업 전체높이 적용');
console.log('- 옵션선택 카드 높이 축소');
console.log('- 옵션선택 영역 불필요 세로스크롤 제거');
console.log('- 새 Supabase SQL 실행 없음');
