const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.36';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.36');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/MultiProcessProgress.jsx',
    baseHashes: [
      '9a1bec2d898e616018cc033686512da421bc5557104873d8cb2d6a8f3538b362',
    ],
    releaseHash: '5f98f5c9f3204172fa2ce14a815dfc5456c1c0736ed98211ce4c1c3ac8c5ef92',
  },
  {
    relativePath: 'src/page/MaterialInputStatus.jsx',
    baseHashes: [
      '9a0dc8e33fda15c063777a9f9f0c3bf26e2cf0c377bebcebf00c2932a2efe44c',
    ],
    releaseHash: 'f71084b3899f2b2f24325521233071c4a6c7d9bdc742a9fcfbcb2adc3cbce00e',
  },
  {
    relativePath: 'src/index.css',
    baseHashes: [
      '2eb73fca6d0a616e4fd7ff6e46d6d2fcee2c6a837672f8c880f1321ddbec0f5d',
    ],
    releaseHash: 'df8276eb242885f4de3cc62bc0b2b1d5a0bdc1d1aadc4f22455002ead194940f',
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
    fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
  }
  const targetHash = sha256(file.target);
  if (![...file.baseHashes, file.releaseHash].includes(targetHash)) {
    fail(`기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${file.relativePath}`);
  }
});

resolvedFiles.forEach((file) => {
  if (sha256(file.target) === file.releaseHash) return;
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.36_${timestamp}`,
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
console.log('- 다중 공종 공종선택 Autocomplete 입력창 기준 좌표 고정');
console.log('- 자재투입현황 입고업체 Autocomplete 입력창 기준 좌표 고정');
console.log('- disablePortal 목록의 전역 역배율 중복 적용 제외');
console.log('- 새 Supabase SQL 없음');
