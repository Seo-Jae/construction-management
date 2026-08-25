const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.12';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.12');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const existingFileDefinitions = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash:
      '590f32d8c619dae2c11c3212b5e0a27f7eb699e65f3840b0a642f21fa13315c1',
    releaseHash:
      '9916440f212e4876c18d731cae034caf558ed9074ff0fef090089712db02b2db',
    versionMarker:
      '// v52.48.5.44.12 옵션관리 메뉴·골구도 기본화면',
  },
  {
    relativePath: 'src/components/Sidebar.jsx',
    baseHash:
      '5bbefc4e210f6bb4ac5c3176b918ee5610dbe0527f1b6b65f5b56e33fc4029ef',
    releaseHash:
      'c17df3e74090c132990a77205ce6db5d12328162648645526bcac24f374d21de',
    versionMarker:
      '// v52.48.5.44.12 옵션관리 메뉴 추가',
  },
  {
    relativePath: 'src/BuildingGrid.jsx',
    baseHash:
      '1eace3783b6a61be0469d38a378e1d364f518a0f09df79711e7b33c35c2e3f98',
    releaseHash:
      'c3b834dae4555340ad57967e61c88ec7eca936d9c9b83bb88ae1a5674e7228df',
    versionMarker:
      '// v52.48.5.44.12 옵션관리 읽기전용 골구도 지원',
  },
];

const newFileDefinition = {
  relativePath: 'src/page/OptionManagementOverview.jsx',
  releaseHash:
    '62431613b6c50d3c56c7508eb9f1046e6de185126bf4685419e9f71ef43e40cc',
  versionMarker:
    '// v52.48.5.44.12 옵션관리 골구도 기본화면',
};

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

const preparedExistingFiles = existingFileDefinitions.map((definition) => {
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
      `v52.48.5.44.11 기준 파일과 다릅니다. 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`,
    );
  }

  return { ...definition, target, source, alreadyApplied, isNew: false };
});

const newTarget = path.resolve(projectRoot, newFileDefinition.relativePath);
const newSource = path.resolve(
  releaseRoot,
  'files',
  newFileDefinition.relativePath,
);

if (!fs.existsSync(newSource) || sha256(newSource) !== newFileDefinition.releaseHash) {
  fail(`신규 릴리스 파일이 누락되었거나 변경되었습니다: ${newFileDefinition.relativePath}`);
}

let newFileAlreadyApplied = false;
if (fs.existsSync(newTarget)) {
  const targetText = fs.readFileSync(newTarget, 'utf8');
  newFileAlreadyApplied =
    targetText.includes(newFileDefinition.versionMarker) &&
    sha256(newTarget) === newFileDefinition.releaseHash;

  if (!newFileAlreadyApplied) {
    fail(`같은 경로에 다른 파일이 있습니다: ${newFileDefinition.relativePath}`);
  }
}

const preparedFiles = [
  ...preparedExistingFiles,
  {
    ...newFileDefinition,
    target: newTarget,
    source: newSource,
    alreadyApplied: newFileAlreadyApplied,
    isNew: true,
  },
];

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;

  if (!definition.isNew) {
    const backupPath = path.resolve(
      projectRoot,
      `backup_v52.48.5.44.12_${timestamp}`,
      definition.relativePath,
    );
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    fs.copyFileSync(definition.target, backupPath);
  }

  fs.mkdirSync(path.dirname(definition.target), { recursive: true });
  fs.copyFileSync(definition.source, definition.target);
});

preparedFiles.forEach((definition) => {
  if (!fs.existsSync(definition.target) || sha256(definition.target) !== definition.releaseHash) {
    fail(`적용 후 해시가 일치하지 않습니다: ${definition.relativePath}`);
  }
});

console.log(`[${VERSION}] 적용 완료`);
console.log('- 공정진척관리 하단에 옵션관리 상위 메뉴 추가');
console.log('- 옵션현황(단열), 옵션현황(선택), 옵션별 비교 소메뉴 추가');
console.log('- 세 화면에 현장관리 골구도·필로티·예외층·세대타입 연동');
console.log('- 옵션별 비교에 기준/비교 옵션 상단 UI 베이스 구성');
console.log('- 기존 공정진척 조회 권한을 옵션관리 메뉴에도 적용');
console.log('- 새 Supabase SQL 실행 없음');
