const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.9.5';
const BASE_HASH =
  'bdf93aaf7881b83913803396f6cc0ae8ef91b4e6c14de9ea218a21dbb8bc9845';
const RELEASE_HASH =
  'f014698697d3cf43f15436af55ef4c8acf3651dde269e12be0eb91dbd5e0d182';
const BASE_MARKER =
  '// v52.48.5.44.9.4 계약 노무비 인라인 묶음 셀 우측정렬';
const VERSION_MARKER =
  '// v52.48.5.44.9.5 계약품목 선택 노무비 단가열·열폭 조정';

const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.9.5');
const target = path.resolve(projectRoot, 'src/page/LaborCostManagement.jsx');
const source = path.resolve(
  releaseRoot,
  'files/src/page/LaborCostManagement.jsx',
);

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

if (!fs.existsSync(target) || !fs.existsSync(source)) {
  fail('화면 대상 파일 또는 릴리스 파일을 찾을 수 없습니다.');
}

if (sha256(source) !== RELEASE_HASH) {
  fail('릴리스 화면 파일이 변경되었습니다. 적용을 중단합니다.');
}

const targetText = fs.readFileSync(target, 'utf8');

if (!targetText.includes(VERSION_MARKER)) {
  if (!targetText.includes(BASE_MARKER) || sha256(target) !== BASE_HASH) {
    fail(
      'v52.48.5.44.9.4 기준 화면 파일과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.9.5_${timestamp}/src/page/LaborCostManagement.jsx`,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target, backupPath);
  fs.copyFileSync(source, target);
}

if (sha256(target) !== RELEASE_HASH) {
  fail('화면 파일 적용 후 해시가 일치하지 않습니다.');
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- 최초계약 품목 선택 팝업에 노무비 단가 열 추가');
console.log('- 노무비 단가 = 계약 노무비 / 계약수량');
console.log('- 단위 및 계약수량 열 폭 축소');
console.log('- 새 SQL 실행 없음');

