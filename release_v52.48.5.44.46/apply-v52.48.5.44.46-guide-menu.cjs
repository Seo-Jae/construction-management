const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.46';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.46');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHashes: ['670c784e9fee31b6d91fc1682916e6901c2efd423eb98923a0cf8ede3d5f6606'],
    releaseHash: '7e1f28db00411bb29bb2141ba698dafc5833b14dfc18878bb80a8c278c3acd03',
    allowMissingTarget: false,
  },
  {
    relativePath: 'src/components/Sidebar.jsx',
    baseHashes: ['c75637cc9feff40f45074297455fb568fd7cbead12ef7c51ea26c7d182da80bb'],
    releaseHash: '36a53dd3443e279ffb5fc5ad81b74ebc42cf63846dd50f93a38d016b48237265',
    allowMissingTarget: false,
  },
  {
    relativePath: 'src/page/Guide.jsx',
    baseHashes: [],
    releaseHash: '7fc71b53d0600a4e155f4ba487f356dcdc7b6d43ee73ab20bca5244e5ee64802',
    allowMissingTarget: true,
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
  if (!fs.existsSync(file.source)) {
    fail(`릴리스 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }
  if (sha256(file.source) !== file.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${file.relativePath}`);
  }

  if (!fs.existsSync(file.target)) {
    if (file.allowMissingTarget) return;
    fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }

  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`v52.48.5.44.45 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (fs.existsSync(file.target) && sha256(file.target) === file.releaseHash) return;

  if (fs.existsSync(file.target)) {
    const backupPath = path.resolve(
      projectRoot,
      `backup_v52.48.5.44.46_${timestamp}`,
      file.relativePath,
    );
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(file.target, backupPath);
  }

  fs.mkdirSync(path.dirname(file.target), { recursive: true });
  fs.copyFileSync(file.source, file.target);
});

resolvedFiles.forEach((file) => {
  if (!fs.existsSync(file.target) || sha256(file.target) !== file.releaseHash) {
    fail(`적용 후 해시가 일치하지 않습니다: ${file.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 좌측 메뉴 하단에 가이드 메뉴 추가');
console.log('- 실제 시스템 메뉴 구조를 반영한 가이드 기본 화면 추가');
console.log('- 미작성 가이드는 준비중으로 표시');
console.log('- 실제 기능 자체가 준비중인 메뉴는 기능 준비중으로 별도 표시');
console.log('- 새 Supabase SQL 없음');
