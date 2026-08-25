const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.9.1';
const BASE_HASH =
  '726254d6908d53bb642dae7478da1bb672cceae86b7e8190264bac54e87e97c9';
const RELEASE_HASH =
  '75506b47ad0a398eaf276e294753fe1de6a98087955203640b85f18e2a220850';
const BASE_MARKER =
  '// v52.48.5.44.9 공정별 노임단가-최초계약 품목 연결';
const VERSION_MARKER =
  '// v52.48.5.44.9.1 계약품목 검색 normalizeText 참조오류 긴급수정';
const MOBILE_META =
  '<meta name="mobile-web-app-capable" content="yes">';

const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.9.1');
const target = path.resolve(projectRoot, 'src/page/LaborCostManagement.jsx');
const source = path.resolve(
  releaseRoot,
  'files/src/page/LaborCostManagement.jsx',
);
const indexTarget = path.resolve(projectRoot, 'index.html');

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

function createBackupPath(relativePath, timestamp) {
  return path.resolve(
    projectRoot,
    `backup_v52.48.5.44.9.1_${timestamp}`,
    relativePath,
  );
}

if (!fs.existsSync(target) || !fs.existsSync(source)) {
  fail('화면 대상 파일 또는 릴리스 파일을 찾을 수 없습니다.');
}

if (sha256(source) !== RELEASE_HASH) {
  fail('릴리스 화면 파일이 변경되었습니다. 적용을 중단합니다.');
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const targetText = fs.readFileSync(target, 'utf8');

if (!targetText.includes(VERSION_MARKER)) {
  if (!targetText.includes(BASE_MARKER) || sha256(target) !== BASE_HASH) {
    fail(
      'v52.48.5.44.9 기준 화면 파일과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
    );
  }

  const backupPath = createBackupPath(
    'src/page/LaborCostManagement.jsx',
    timestamp,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(target, backupPath);
  fs.copyFileSync(source, target);
}

if (sha256(target) !== RELEASE_HASH) {
  fail('긴급 수정 적용 후 화면 파일 해시가 일치하지 않습니다.');
}

let metaResult = 'index.html 없음 · 메타 경고 수정 건너뜀';

if (fs.existsSync(indexTarget)) {
  let indexText = fs.readFileSync(indexTarget, 'utf8');
  const mobileMetaPattern =
    /<meta\s+name=["']mobile-web-app-capable["']\s+content=["']yes["']\s*\/?\s*>/i;

  if (!mobileMetaPattern.test(indexText)) {
    const appleMetaPattern =
      /<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']\s*\/?\s*>/i;
    const matchedAppleMeta = indexText.match(appleMetaPattern)?.[0];

    if (matchedAppleMeta) {
      const backupPath = createBackupPath('index.html', timestamp);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(indexTarget, backupPath);
      indexText = indexText.replace(
        matchedAppleMeta,
        `${matchedAppleMeta}\n    ${MOBILE_META}`,
      );
      fs.writeFileSync(indexTarget, indexText, 'utf8');
      metaResult = 'mobile-web-app-capable 메타 추가';
    } else {
      metaResult = '기존 Apple 메타 없음 · 메타 경고 수정 건너뜀';
    }
  } else {
    metaResult = 'mobile-web-app-capable 메타 이미 적용됨';
  }
}

console.log(`[${VERSION}] 긴급 수정 적용 완료`);
console.log('- normalizeText 미정의 참조 제거');
console.log('- 계약품목 검색 전용 정규화 함수 적용');
console.log(`- ${metaResult}`);
console.log('- 새 SQL 실행 없음');
