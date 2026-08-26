const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.17';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.17');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const fileDefinitions = [
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash:
      'bedfd0f38c96c0de6b803ed1f2356e3519d3660dfbdc96812afae58aecb84a1a',
    releaseHash:
      '5c73bf9de7ae4a3e6925b866ce6408decf33a065d234192829576c949950496a',
    isNew: false,
  },
  {
    relativePath: 'src/utils/optionSelectionExcel.js',
    releaseHash:
      '4747ad4eb5cee4bafbdd651f64e79871d0f87786a3c991f260174983fe720766',
    isNew: true,
  },
  {
    relativePath: 'public/templates/selection_option_template.xlsx',
    releaseHash:
      '67a628ab1b53bbecc88918ca442c4fb1ac4ea37ce19a1e2a477aecdb8d81ba80',
    isNew: true,
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

const preparedFiles = fileDefinitions.map((definition) => {
  const target = path.resolve(projectRoot, definition.relativePath);
  const source = path.resolve(releaseRoot, 'files', definition.relativePath);

  if (!fs.existsSync(source)) {
    fail(`릴리스 파일을 찾을 수 없습니다: ${definition.relativePath}`);
  }
  if (sha256(source) !== definition.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${definition.relativePath}`);
  }

  if (!fs.existsSync(target)) {
    if (!definition.isNew) {
      fail(`기준 파일을 찾을 수 없습니다: ${definition.relativePath}`);
    }
    return { ...definition, target, source, alreadyApplied: false };
  }

  const targetHash = sha256(target);
  if (targetHash === definition.releaseHash) {
    return { ...definition, target, source, alreadyApplied: true };
  }
  if (definition.isNew) {
    fail(`동일한 경로에 다른 파일이 있어 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`);
  }
  if (targetHash !== definition.baseHash) {
    fail(`v52.48.5.44.16 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`);
  }
  return { ...definition, target, source, alreadyApplied: false };
});

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;

  if (fs.existsSync(definition.target)) {
    const backupPath = path.resolve(
      projectRoot,
      `backup_v52.48.5.44.17_${timestamp}`,
      definition.relativePath,
    );
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(definition.target, backupPath);
  }

  fs.mkdirSync(path.dirname(definition.target), { recursive: true });
  fs.copyFileSync(definition.source, definition.target);
});

preparedFiles.forEach((definition) => {
  if (
    !fs.existsSync(definition.target) ||
    sha256(definition.target) !== definition.releaseHash
  ) {
    fail(`적용 후 해시가 일치하지 않습니다: ${definition.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 제공된 선택옵션 양식의 A6:E6 이하에 골구도 세대정보 자동입력');
console.log('- F5:W5 유상옵션명, F6:W 선택/빈칸 입력 방식 적용');
console.log('- 현장·세대정보·옵션명·선택값 검증 후 업로드');
console.log('- 골구도에 세대별 선택 건수 표시 및 Supabase 저장');
console.log('- 새 Supabase SQL 실행 없음');
