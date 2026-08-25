const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.11';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.11');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const fileDefinitions = [
  {
    relativePath: 'src/page/LaborCostManagement.jsx',
    baseHash:
      '047ff91d126e7d9ba55aa87b9bfb586c3903fa057cef702147e297e096e7ad63',
    releaseHash:
      '50fa87650374c4c4aafd96a8c696931ff5996d885b4dd4a239042dc124aa8a34',
    baseMarker:
      '// v52.48.5.44.10 복합공정 계약품목 노무비 단가 배분',
    versionMarker:
      '// v52.48.5.44.11 세대별 물량 엑셀 운영전환·현장관리 타입 자동연결',
  },
  {
    relativePath: 'src/utils/laborQuantityExcel.js',
    baseHash:
      '4cdce7bd67cec2bf2c0b9c556b9c869d52442b9d94cac41dc659bf6cdf2c7f0c',
    releaseHash:
      '3d121fdef73270b6634376aedc546a2f60079166a4e701c9b1739763e4f12729',
    baseMarker: '',
    versionMarker:
      '// v52.48.5.44.11 세대별 물량 엑셀 운영전환',
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
  const source = path.resolve(
    releaseRoot,
    'files',
    definition.relativePath,
  );

  if (!fs.existsSync(target) || !fs.existsSync(source)) {
    fail(`대상 또는 릴리스 파일을 찾을 수 없습니다: ${definition.relativePath}`);
  }

  if (sha256(source) !== definition.releaseHash) {
    fail(`릴리스 파일이 변경되었습니다: ${definition.relativePath}`);
  }

  const targetText = fs.readFileSync(target, 'utf8');
  const alreadyApplied = targetText.includes(definition.versionMarker);

  if (alreadyApplied) {
    if (sha256(target) !== definition.releaseHash) {
      fail(`적용 후 사용자 변경이 감지되었습니다: ${definition.relativePath}`);
    }
  } else if (
    sha256(target) !== definition.baseHash ||
    (definition.baseMarker && !targetText.includes(definition.baseMarker))
  ) {
    fail(
      `v52.48.5.44.10 기준 파일과 다릅니다. 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`,
    );
  }

  return { ...definition, target, source, alreadyApplied };
});

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;

  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.11_${timestamp}`,
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
console.log('- 엑셀 시험 대상 현장 안내 및 제한 제거');
console.log('- 모든 현장에서 세대별 물량 엑셀 다운로드·업로드 사용');
console.log('- 현장관리 동별 기본타입·층별 예외타입 자동 연결');
console.log('- 동·층·호 비교 결과를 화면과 다운로드 엑셀에 자동 반영');
console.log('- 새 Supabase SQL 실행 없음');
