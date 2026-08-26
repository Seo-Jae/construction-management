const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.37';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.37');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const files = [
  {
    relativePath: 'src/page/MultiProcessProgress.jsx',
    baseHashes: ['5f98f5c9f3204172fa2ce14a815dfc5456c1c0736ed98211ce4c1c3ac8c5ef92'],
    releaseHash: 'f1ac47a236bcba6dbacb0cbdc49d8108e51ad20cc97f369dc21561a517ab17d1',
  },
  {
    relativePath: 'src/page/MaterialInputStatus.jsx',
    baseHashes: ['f71084b3899f2b2f24325521233071c4a6c7d9bdc742a9fcfbcb2adc3cbce00e'],
    releaseHash: 'e06298416499071c9235f1e52727571971f44df7fb4ac34a7169d1d5b1a0358e',
  },
  {
    relativePath: 'src/page/HouseholdQuantityManagement.jsx',
    baseHashes: ['2c58ebb4af05f331c1092c5a9bcbcd4adba5e0c3bb7a655b51e5023baff61aad'],
    releaseHash: '104b5b6582dc79d24eb97ec59945ebd96182b1cfa56f53886b430b1d21134ef4',
  },
  {
    relativePath: 'src/utils/householdQuantityExcel.js',
    baseHashes: ['6057bd496f4e846e77af4d8c2d91a78dc944045044c44dcf0730ac13a535df20'],
    releaseHash: '9536a0c4091231270ca999103a0f9e4064a33a45c42c14a872c8545a46e74ff5',
  },
  {
    relativePath: 'src/components/ScaleAwareAutocompletePopper.jsx',
    baseHashes: [],
    releaseHash: '2f1193095faf38a05abbbb7fd6a4a55248e8e056ff49d91b38b392ad6dcf01e2',
    createIfMissing: true,
  },
  {
    relativePath: 'src/index.css',
    baseHashes: ['df8276eb242885f4de3cc62bc0b2b1d5a0bdc1d1aadc4f22455002ead194940f'],
    releaseHash: '078631800499d29dad159b179226421d6f76878cbcd22ab8c451495cfaeaa74e',
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
    if (file.createIfMissing) return;
    fail(`대상 파일을 찾을 수 없습니다: ${file.relativePath}`);
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
      `backup_v52.48.5.44.37_${timestamp}`,
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
console.log('- 다중 공종 및 자재 입고업체 Autocomplete를 화면배율 독립 좌표로 보정');
console.log('- 타입별 기본물량에 소계·공제물량·자동합계(소계-공제물량) 추가');
console.log('- 공제물량 Excel 다운로드·업로드·저장 및 총 예정물량 계산 연결');
console.log('- 물량 셀 우측정렬, 텍스트 셀 가운데정렬');
console.log('- 새 Supabase SQL 없음');
