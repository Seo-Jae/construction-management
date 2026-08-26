const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.40';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.40');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/BuildingGrid.jsx',
    baseHashes: [
      '28c43d1b9d42bc3c7fb775710938a7efc98b468a1e2afb13f06590bf9a1ff318',
    ],
    releaseHash:
      'e55b849d5d57f52a138f00d2836c97d1e55e0045383c30f84dab02cbd4ac89a4',
  },
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: [
      '1df066ebd88b407abbf3571d007ca57553368eebcdfc9099d3675b6c826e29d4',
    ],
    releaseHash:
      '27fc134e65bf91a332a5a129612070f551ac7202a76f836e0e18af88a63ac5bf',
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: [
      'fb71ef9f4e0d8cdec66d00805a97a4703967c24e351178f0dd84f015b68d5276',
    ],
    releaseHash:
      'f959c41fa3445479494da7db3b438a0f1006bef236e3e46c55a9586b25cfd71e',
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
    `backup_v52.48.5.44.40_${timestamp}`,
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
console.log('- 공정별옵션연결 왼쪽에 골구도보기 버튼 추가');
console.log('- 단열: 타입 + 단열옵션 기준 기본물량 표시');
console.log('- 기타 공정: 타입 기본물량 + 해당 세대 선택옵션 증감물량 표시');
console.log('- 미입력 세대는 골구도에서 별도 색상으로 표시');
console.log('- 새 Supabase SQL 없음');
