const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.16';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.16');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const fileDefinitions = [
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash:
      'fc80fb8fe63db0f5d4eac44eac6aede2c6096ab0fcba7c7238d5eda2b6ca4a4f',
    releaseHash:
      'bedfd0f38c96c0de6b803ed1f2356e3519d3660dfbdc96812afae58aecb84a1a',
    versionMarker:
      '// v52.48.5.44.16 타입·옵션 골구도 강조·좌우 패널 크기조절',
  },
  {
    relativePath: 'src/utils/optionTypeSummary.js',
    baseHash:
      'b246699cd8c6833665aae4c427b2eaa498037d403396ab5545e6a6deed5ba629',
    releaseHash:
      'a2478cf44fc512071189757fcaac98b1612b85f790496c6655ca6899e76258af',
    versionMarker:
      '// v52.48.5.44.16 타입·옵션 선택용 세대키 및 0세대 항목 제외',
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
  } else if (sha256(target) !== definition.baseHash) {
    fail(
      `v52.48.5.44.15 기준 파일과 다릅니다. 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`,
    );
  }

  return { ...definition, target, source, alreadyApplied };
});

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;

  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.16_${timestamp}`,
    definition.relativePath,
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.copyFileSync(definition.target, backupPath);

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
console.log('- 타입 안에서 0세대인 옵션 항목은 표시하지 않음');
console.log('- 타입 클릭 시 해당 타입 전체 세대를 골구도에 파란색 강조');
console.log('- 옵션 클릭 시 해당 타입·옵션 세대를 골구도에 노란색 강조');
console.log('- 골구도와 우측 현황 사이 드래그 너비 조절 추가');
console.log('- 상단 옵션명별 전체 집계 Chip 삭제');
console.log('- 새 Supabase SQL 실행 없음');

