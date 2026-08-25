const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VERSION = 'v52.48.5.42.3.1';
const BASE_VERSION = 'v52.48.5.42.3';
const target = path.join(process.cwd(), 'src', 'page', 'UnitPriceAnalysis.jsx');
const baseScript = path.join(
  __dirname,
  'base',
  'apply-v52.48.5.42.3-unit-price-default-rounding.cjs',
);

if (!fs.existsSync(target)) {
  console.error(`[${VERSION}] src/page/UnitPriceAnalysis.jsx 파일을 찾지 못했습니다.`);
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('// v52.48.5.42.3.1 기본 잡자재 가산액 500원')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

const backupDir = path.join(
  process.cwd(),
  `backup_${VERSION}_${new Date().toISOString().replace(/[:.]/g, '-')}`,
  'src',
  'page',
);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(target, path.join(backupDir, 'UnitPriceAnalysis.jsx'));

// v52.48.5.42.3이 아직 적용되지 않은 상태라면 같은 패키지에 포함된
// 기준 패치를 먼저 실행합니다. 사용자는 42.3을 별도로 적용할 필요가 없습니다.
if (!source.includes('// v52.48.5.42.3 기본 잡자재 단수정리')) {
  if (!fs.existsSync(baseScript)) {
    console.error(`[${VERSION}] 기준 패치 파일을 찾지 못했습니다: ${baseScript}`);
    process.exit(1);
  }

  console.log(`[${VERSION}] ${BASE_VERSION} 기본 잡자재 규칙이 없어 먼저 적용합니다.`);
  const result = spawnSync(process.execPath, [baseScript], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.error(`[${VERSION}] ${BASE_VERSION} 기준 패치 적용에 실패했습니다.`);
    process.exit(result.status || 1);
  }

  source = fs.readFileSync(target, 'utf8');
}

const helperStart = source.indexOf('const makeDefaultRoundingRow = (sortOrder = 0) => ({');
const helperEnd = source.indexOf('const ensureDefaultRoundingRow = (rows) => {', helperStart);

if (helperStart < 0 || helperEnd < 0) {
  console.error(`[${VERSION}] 기본 잡자재 생성 함수 위치를 찾지 못했습니다.`);
  console.error('기존 변경을 보호하기 위해 자동 적용을 중단합니다.');
  process.exit(1);
}

let helperBlock = source.slice(helperStart, helperEnd);
const helperBefore = helperBlock;
helperBlock = helperBlock.replace(/unitPrice:\s*(?:0|100|500),/, 'unitPrice: 500,');

if (helperBlock === helperBefore && !/unitPrice:\s*500,/.test(helperBlock)) {
  console.error(`[${VERSION}] 기본 가산액 위치를 찾지 못했습니다.`);
  process.exit(1);
}

source = source.slice(0, helperStart) + helperBlock + source.slice(helperEnd);

// 사용자가 일반행을 재료비(단수정리)로 바꾸는 경우에도 기본 가산액은 500원으로 시작합니다.
source = source.replace(
  /(if \(value === 'material_rounding'\) \{[\s\S]*?unitPrice:\s*)(?:0|100|500)(,)/g,
  '$1500$2',
);

// 버전 표시를 기준 helper 앞에 추가합니다.
const markerAnchor = "// v52.48.5.42.3 기본 잡자재 단수정리";
if (!source.includes(markerAnchor)) {
  console.error(`[${VERSION}] ${BASE_VERSION} 적용 표시를 찾지 못했습니다.`);
  process.exit(1);
}
source = source.replace(
  markerAnchor,
  `${markerAnchor}\n// v52.48.5.42.3.1 기본 잡자재 가산액 500원`,
);

// 최종 검증
const finalHelperStart = source.indexOf('const makeDefaultRoundingRow = (sortOrder = 0) => ({');
const finalHelperEnd = source.indexOf('const ensureDefaultRoundingRow = (rows) => {', finalHelperStart);
const finalHelperBlock = source.slice(finalHelperStart, finalHelperEnd);

if (!/unitPrice:\s*500,/.test(finalHelperBlock)) {
  console.error(`[${VERSION}] 기본 잡자재 가산액 500원 검증에 실패했습니다.`);
  process.exit(1);
}

if (!source.includes("const DEFAULT_ROUNDING_ITEM_NAME = '잡자재';")) {
  console.error(`[${VERSION}] 기본 품명 '잡자재' 검증에 실패했습니다.`);
  process.exit(1);
}

if (!source.includes("const DEFAULT_ROUNDING_SPECIFICATION = '피스 외';")) {
  console.error(`[${VERSION}] 기본 규격 '피스 외' 검증에 실패했습니다.`);
  process.exit(1);
}

fs.writeFileSync(target, source, 'utf8');

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log('- 재료비(단수정리) 기본 품명: 잡자재');
console.log('- 기본 규격: 피스 외');
console.log('- 기본 가산액: 500원');
console.log('- 기존 사용자가 직접 변경한 저장문서의 가산액은 강제로 덮어쓰지 않습니다.');
console.log('- 새로 자동 생성되는 잡자재 행과 새 단수정리 행의 시작값만 500원으로 설정합니다.');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${backupDir}`);
