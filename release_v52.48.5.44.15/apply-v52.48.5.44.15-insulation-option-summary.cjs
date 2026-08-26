const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.15';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.15');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const fileDefinitions = [
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash:
      '7364aeef31bb05c877d159e87f9d5f7a53736ac3ad862cc8dd7fa820454b74c8',
    releaseHash:
      'fc80fb8fe63db0f5d4eac44eac6aede2c6096ab0fcba7c7238d5eda2b6ca4a4f',
    versionMarker:
      '// v52.48.5.44.15 단열 옵션 타입별 현황·상단 박스 실높이 통일',
  },
  {
    relativePath: 'src/utils/optionInsulationExcel.js',
    baseHash:
      '616600f64e21b73ff5c4b6328112d190011dede5f5bc93dc5e1726adcf5936a6',
    releaseHash:
      '10fa110ef6eef9e201bb8dc87a7916ed121b8247170809ea929be88165036e3e',
    versionMarker:
      '// v52.48.5.44.15 단열 옵션 Excel 메모 제거·동 간격 1열(너비 5.42)',
  },
  {
    relativePath: 'src/utils/optionTypeSummary.js',
    baseHash: null,
    releaseHash:
      'b246699cd8c6833665aae4c427b2eaa498037d403396ab5545e6a6deed5ba629',
    versionMarker:
      '// v52.48.5.44.15 골구도 타입별 단열 옵션 세대수 집계',
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

  const targetExists = fs.existsSync(target);
  if (!targetExists) {
    if (definition.baseHash !== null) {
      fail(`대상 파일을 찾을 수 없습니다: ${definition.relativePath}`);
    }
    return { ...definition, target, source, targetExists, alreadyApplied: false };
  }

  const targetText = fs.readFileSync(target, 'utf8');
  const alreadyApplied = targetText.includes(definition.versionMarker);

  if (alreadyApplied) {
    if (sha256(target) !== definition.releaseHash) {
      fail(`적용 후 사용자 변경이 감지되었습니다: ${definition.relativePath}`);
    }
  } else if (definition.baseHash === null || sha256(target) !== definition.baseHash) {
    fail(
      `v52.48.5.44.14 기준 파일과 다릅니다. 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`,
    );
  }

  return { ...definition, target, source, targetExists, alreadyApplied };
});

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;

  if (definition.targetExists) {
    const backupPath = path.resolve(
      projectRoot,
      `backup_v52.48.5.44.15_${timestamp}`,
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
console.log('- Excel 세대 셀 메모를 전부 제거');
console.log('- 동 사이 간격을 빈 열 1개, 열 너비 5.42로 변경');
console.log('- 상단 두 안내 박스를 다운로드 버튼과 정확히 같은 30px 높이로 변경');
console.log('- 우측 타입별 단열 옵션 현황 및 클릭 펼침 집계 추가');
console.log('- 옵션명은 담당자가 Excel에 입력한 명칭을 그대로 집계');
console.log('- 새 Supabase SQL 실행 없음');

