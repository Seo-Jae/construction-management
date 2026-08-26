const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.18';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.18');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const fileDefinitions = [
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash: '5c73bf9de7ae4a3e6925b866ce6408decf33a065d234192829576c949950496a',
    releaseHash: '204d6f0df23f96c4337ec4d598d52d87b39c39b50dc3ed4f8a039be1c55ce70e',
  },
  {
    relativePath: 'src/utils/optionSelectionExcel.js',
    baseHash: '4747ad4eb5cee4bafbdd651f64e79871d0f87786a3c991f260174983fe720766',
    releaseHash: 'b3c426b6ba009ef1e0b148f7d82486bd862d6cbfe5d935bf7497184a036e9392',
  },
  {
    relativePath: 'public/templates/selection_option_template.xlsx',
    baseHash: '67a628ab1b53bbecc88918ca442c4fb1ac4ea37ce19a1e2a477aecdb8d81ba80',
    releaseHash: 'b12cc327a9e1d9391bd721b9780458b99a75a291f472b088ce44db26a134ed32',
  },
];

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const preparedFiles = fileDefinitions.map((definition) => {
  const target = path.resolve(projectRoot, definition.relativePath);
  const source = path.resolve(releaseRoot, 'files', definition.relativePath);
  if (!fs.existsSync(target) || !fs.existsSync(source)) {
    fail(`대상 또는 릴리스 파일을 찾을 수 없습니다: ${definition.relativePath}`);
  }
  if (sha256(source) !== definition.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${definition.relativePath}`);
  }

  const targetHash = sha256(target);
  if (targetHash === definition.releaseHash) {
    return { ...definition, target, source, alreadyApplied: true };
  }
  if (targetHash !== definition.baseHash) {
    fail(`v52.48.5.44.17 기준 파일과 달라 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`);
  }
  return { ...definition, target, source, alreadyApplied: false };
});

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.18_${timestamp}`,
    definition.relativePath,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(definition.target, backupPath);
  fs.copyFileSync(definition.source, definition.target);
});

preparedFiles.forEach((definition) => {
  if (sha256(definition.target) !== definition.releaseHash) {
    fail(`적용 후 해시가 일치하지 않습니다: ${definition.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 선택옵션 양식 좌측 구분을 동·호·타입 3개로 축소');
console.log('- 동·호·타입은 골구도 기본값 제공 후 담당자 수정 가능');
console.log('- 수정한 세대정보를 옵션결과와 함께 저장·재다운로드');
console.log('- 유상옵션 입력열을 D5:U5로 이동하고 18개 유지');
console.log('- 새 Supabase SQL 실행 없음');
