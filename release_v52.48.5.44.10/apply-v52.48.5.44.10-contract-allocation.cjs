const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.10';
const BASE_HASH =
  'f014698697d3cf43f15436af55ef4c8acf3651dde269e12be0eb91dbd5e0d182';
const RELEASE_HASH =
  '047ff91d126e7d9ba55aa87b9bfb586c3903fa057cef702147e297e096e7ad63';
const BASE_MARKER =
  '// v52.48.5.44.9.5 계약품목 선택 노무비 단가열·열폭 조정';
const VERSION_MARKER =
  '// v52.48.5.44.10 복합공정 계약품목 노무비 단가 배분';

const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.10');
const target = path.resolve(projectRoot, 'src/page/LaborCostManagement.jsx');
const source = path.resolve(
  releaseRoot,
  'files/src/page/LaborCostManagement.jsx',
);
const sqlSource = path.resolve(
  releaseRoot,
  'supabase/v52.48.5.44.10_labor_contract_allocations.sql',
);
const sqlTarget = path.resolve(
  projectRoot,
  'supabase/v52.48.5.44.10_labor_contract_allocations.sql',
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

if (!targetText.includes(VERSION_MARKER)) {
  if (!targetText.includes(BASE_MARKER) || targetHash !== BASE_HASH) {
    fail(
      'v52.48.5.44.9.5 기준 화면 파일과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.10_${timestamp}/src/page/LaborCostManagement.jsx`,
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
console.log('- 복합공정 품목을 공정 조합과 원 단가 기준으로 그룹화');
console.log('- 공정별 노무비 단가 입력 및 체크 품목 일괄 저장');
console.log('- 배분합계와 원 단가의 차액 0원 검증');
console.log('- 계약 노무비에 현재 공정의 배분금액만 반영');
console.log('- Supabase SQL Editor에서 SQL 전체 실행 필요');
