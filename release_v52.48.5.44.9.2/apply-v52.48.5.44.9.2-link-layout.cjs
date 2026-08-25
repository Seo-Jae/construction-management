const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.9.2';
const BASE_HASH =
  '75506b47ad0a398eaf276e294753fe1de6a98087955203640b85f18e2a220850';
const RELEASE_HASH =
  '0b1f1c21a53626066ae9d6182f54653535614fa9425e93a12024ddbe9b56c909';
const BASE_MARKER =
  '// v52.48.5.44.9.1 계약품목 검색 normalizeText 참조오류 긴급수정';
const VERSION_MARKER =
  '// v52.48.5.44.9.2 계약 노무비 링크 아이콘 단일행 전면배치';

const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.9.2');
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
      'v52.48.5.44.9.1 기준 화면 파일과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.9.2_${timestamp}/src/page/LaborCostManagement.jsx`,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target, backupPath);
  fs.copyFileSync(source, target);
}

if (sha256(target) !== RELEASE_HASH) {
  fail('화면 파일 적용 후 해시가 일치하지 않습니다.');
}

console.log(`[${VERSION}] 적용 완료`);
console.log('- 계약 노무비 링크 아이콘을 금액 앞으로 이동');
console.log('- 링크 아이콘과 금액을 같은 줄에 고정');
console.log('- N개 품목 및 직접입력 안내문구 제거');
console.log('- 새 SQL 실행 없음');

