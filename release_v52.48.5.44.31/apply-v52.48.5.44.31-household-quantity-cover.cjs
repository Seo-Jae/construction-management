const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.31';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.31');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHashes: [
      '40933ad84df16dd4d770843f9ec10ae778936ab2ebd4c4c09c36e5e267a1e78b',
      '5e4e1c4ce09669d8273d9b43160128a6613c9ad8202c5e83114a4c54f6f18107',
      '7e3df65c965d0804145eea3c4ea7aad3b418c1184a69a83212a3b5bd9fd6f903',
    ],
    releaseHash: '9a1267273aee6ba6c4e7a7ae3cd08b17193526dd23581ba2dfa9cf376ff02d8b',
    required: true,
  },
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      'dadf734ec860b416243caca5ccbd0f0ccae68188cca7694c5939a1d16e4293b6',
      '28f4d3448ded48a6f9be3c9dfc4faa614083eaebedcf081f82d73f8fbe102ed1',
    ],
    releaseHash: 'f005c1c37dd052bc179c1bb8176cb221b59c0f7882c463f57cbd33699f1c85f3',
    required: false,
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: [],
    releaseHash: '40bca5b884f07d17d7143276a372422b4d19cf7d99a26bed190af302358049e0',
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
    if (file.required) fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
    return;
  }
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (fs.existsSync(file.target) && sha256(file.target) === file.releaseHash) return;
  if (fs.existsSync(file.target)) {
    const backupPath = path.resolve(
      projectRoot,
      `backup_v52.48.5.44.31_${timestamp}`,
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
console.log('- 세대물량관리 단일 화면 및 공정별 갑지');
console.log('- 단열 옵션 자동 연결·선택옵션 공정별 연결');
console.log('- Excel 다운로드·업로드·저장 기능');
console.log('- Supabase SQL Editor에서 v52.48.5.44.31 SQL 1회 실행 필요');
