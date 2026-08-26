const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.24';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.24');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash: '249eaf8865719fe50299db46410dda397bd1f25c4ca3b021b0a861936394d690',
    releaseHash: '5371c33f4022e32550d3f159882e9f56b73429e2ca8d7776c2bc8f7fe16d8fef',
  },
  {
    relativePath: 'src/main.jsx',
    baseHash: '07a760da366379313a690284014497d28ca4ca23f0087169ebb5ef66e5c785d4',
    releaseHash: '2ca2c1ab477f2dd5558e5b75ff5e9d061457617ed2a97af7cf29a55ab3aae2f1',
  },
  {
    relativePath: 'src/index.css',
    baseHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    releaseHash: '3477af99ac5fdb1caa0cd502933dfcb83911ce150c458b52bdcf78314f7bebc7',
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
    fail(`v52.48.5.44.23 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;

  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.24_${timestamp}`,
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
console.log('- 대시보드 기본 화면 배율 90%');
console.log('- 상단 우측에서 90% / 100% 선택');
console.log('- 사용자별 브라우저 선택값 저장');
console.log('- 로그인·근태 전용 화면 제외');
console.log('- 인쇄 시 100% 자동 적용');
console.log('- 새 Supabase SQL 실행 없음');
