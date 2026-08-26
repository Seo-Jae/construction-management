const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.29';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.29');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/components/Sidebar.jsx',
    baseHash: 'c17df3e74090c132990a77205ce6db5d12328162648645526bcac24f374d21de',
    releaseHash: '6f870b560ebf93208ae5a4436bc44d570ff13cff5a610325824019b74e090d0d',
    required: true,
  },
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash: '40933ad84df16dd4d770843f9ec10ae778936ab2ebd4c4c09c36e5e267a1e78b',
    releaseHash: '5e4e1c4ce09669d8273d9b43160128a6613c9ad8202c5e83114a4c54f6f18107',
    required: true,
  },
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHash: null,
    releaseHash: 'dadf734ec860b416243caca5ccbd0f0ccae68188cca7694c5939a1d16e4293b6',
    required: false,
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
    if (file.required) {
      fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
    }
    return;
  }

  const targetHash = sha256(file.target);
  const allowedHashes = [file.baseHash, file.releaseHash].filter(Boolean);
  if (!allowedHashes.includes(targetHash)) {
    fail(`v52.48.5.44.28 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (fs.existsSync(file.target) && sha256(file.target) === file.releaseHash) {
    return;
  }

  if (fs.existsSync(file.target)) {
    const backupPath = path.resolve(
      projectRoot,
      `backup_v52.48.5.44.29_${timestamp}`,
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
console.log('- 옵션관리 하단 세대물량관리 메뉴 추가');
console.log('- 좌측·우측 작업영역 2분할 기본화면 추가');
console.log('- 새 Supabase SQL 실행 없음');
