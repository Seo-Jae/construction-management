const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.41';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.41');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      '27fc134e65bf91a332a5a129612070f551ac7202a76f836e0e18af88a63ac5bf',
    ],
    releaseHash:
      '9e3778e7c042222cd293db4730ee28811943be1e36f619a0f3dddd3afa68ed9a',
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: [
      'f959c41fa3445479494da7db3b438a0f1006bef236e3e46c55a9586b25cfd71e',
    ],
    releaseHash:
      'b5119296c0f470796d857f87b70e215f7d77142bbf37119502b9e4d0c125be42',
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
    `backup_v52.48.5.44.41_${timestamp}`,
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
console.log('- 단열·합지: 타입 + 단열옵션별 기본물량 자동 구성');
console.log('- 단열·합지에도 유상 선택옵션 증감 연결 허용');
console.log('- 골구도 마우스 드래그 이동·휠 확대축소·화면맞춤 추가');
console.log('- 골구도 PDF 저장·인쇄 아이콘 및 A4 가로 1장 맞춤');
console.log('- 새 Supabase SQL 없음');
