const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.9';
const BASE_HASH =
  '6ae5169fbc2725735fb1f651524d5296907d772e576c55e471b058d0f605cefe';
const RELEASE_HASH =
  '726254d6908d53bb642dae7478da1bb672cceae86b7e8190264bac54e87e97c9';
const VERSION_MARKER =
  '// v52.48.5.44.9 공정별 노임단가-최초계약 품목 연결';

const projectRoot = process.cwd();
const releaseRoot = path.resolve(
  projectRoot,
  'release_v52.48.5.44.9',
);
const target = path.resolve(
  projectRoot,
  'src/page/LaborCostManagement.jsx',
);
const source = path.resolve(
  releaseRoot,
  'files/src/page/LaborCostManagement.jsx',
);
const sqlSource = path.resolve(
  releaseRoot,
  'supabase/v52.48.5.44.9_labor_contract_item_links.sql',
);
const sqlTarget = path.resolve(
  projectRoot,
  'supabase/v52.48.5.44.9_labor_contract_item_links.sql',
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

if (!fs.existsSync(target)) {
  fail(`대상 파일을 찾을 수 없습니다: ${target}`);
}

if (!fs.existsSync(source) || !fs.existsSync(sqlSource)) {
  fail('릴리스의 화면 파일 또는 SQL 파일이 누락되었습니다.');
}

if (sha256(source) !== RELEASE_HASH) {
  fail('릴리스 화면 파일이 변경되었습니다. 적용을 중단합니다.');
}

const targetText = fs.readFileSync(target, 'utf8');
const targetHash = sha256(target);

if (!targetText.includes(VERSION_MARKER) && targetHash !== BASE_HASH) {
  fail(
    '사용자 제공 최신본과 다른 LaborCostManagement.jsx입니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
  );
}

if (!targetText.includes(VERSION_MARKER)) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.9_${timestamp}/src/page/LaborCostManagement.jsx`,
  );

  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target, backupPath);
  fs.copyFileSync(source, target);
}

if (sha256(target) !== RELEASE_HASH) {
  fail('화면 파일 적용 후 해시가 일치하지 않습니다.');
}

fs.mkdirSync(path.dirname(sqlTarget), { recursive: true });
fs.copyFileSync(sqlSource, sqlTarget);

console.log(`[${VERSION}] 소스 적용 완료`);
console.log('- 공정별 노임단가의 계약 노무비 우측에 최초계약 품목 선택 추가');
console.log('- 선택 품목의 계약 노무비와 계약수량을 자동 합산');
console.log('- 선택 품목 ID와 저장 당시 계약값 스냅샷 보존');
console.log('- 실행 노임총액은 이번 단계에서 기존 수동 입력 유지');
console.log('- Supabase SQL Editor에서 SQL 전체 실행 필요');
