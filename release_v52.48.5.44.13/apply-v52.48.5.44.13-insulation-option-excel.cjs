const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.13';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.13');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const existingFileDefinitions = [
  {
    relativePath: 'src/Dashboard.jsx',
    baseHash:
      '9916440f212e4876c18d731cae034caf558ed9074ff0fef090089712db02b2db',
    releaseHash:
      '249eaf8865719fe50299db46410dda397bd1f25c4ca3b021b0a861936394d690',
    versionMarker:
      '// v52.48.5.44.13 옵션현황(단열) 업로드 사용자 연결',
  },
  {
    relativePath: 'src/BuildingGrid.jsx',
    baseHash:
      'c3b834dae4555340ad57967e61c88ec7eca936d9c9b83bb88ae1a5674e7228df',
    releaseHash:
      '321d85f15b6282538a396cef3a01f7526761795053b9b5bd9810e0056220036a',
    versionMarker:
      '// v52.48.5.44.13 옵션관리 세대별 표시값·색상 지원',
  },
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash:
      '62431613b6c50d3c56c7508eb9f1046e6de185126bf4685419e9f71ef43e40cc',
    releaseHash:
      'c67298bfdf846b74c572714dd058ee295bef5eb634aa634613963c5471f58796',
    versionMarker:
      '// v52.48.5.44.13 옵션현황(단열) 골구도 엑셀 다운로드·업로드·저장',
  },
];

const newFileDefinitions = [
  {
    relativePath: 'src/utils/optionInsulationExcel.js',
    releaseHash:
      '585bb6ba05cf2cfc157cbc2c2667d69e085f80e145284bcd1df49bb1dc35a2ea',
    versionMarker:
      '// v52.48.5.44.13 옵션현황(단열) 골구도 엑셀 다운로드·업로드',
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
      `v52.48.5.44.12 기준 파일과 다릅니다. 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`,
    );
  }

  return { ...definition, target, source, alreadyApplied, isNew: false };
});

const preparedNewFiles = newFileDefinitions.map((definition) => {
  const target = path.resolve(projectRoot, definition.relativePath);
  const source = path.resolve(releaseRoot, 'files', definition.relativePath);

  if (!fs.existsSync(source) || sha256(source) !== definition.releaseHash) {
    fail(`신규 릴리스 파일이 누락되었거나 변경되었습니다: ${definition.relativePath}`);
  }

  let alreadyApplied = false;
  if (fs.existsSync(target)) {
    const targetText = fs.readFileSync(target, 'utf8');
    alreadyApplied =
      targetText.includes(definition.versionMarker) &&
      sha256(target) === definition.releaseHash;

    if (!alreadyApplied) {
      fail(`같은 경로에 다른 파일이 있습니다: ${definition.relativePath}`);
    }
  }

  return { ...definition, target, source, alreadyApplied, isNew: true };
});

const preparedFiles = [...preparedExistingFiles, ...preparedNewFiles];

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;

  if (!definition.isNew) {
    const backupPath = path.resolve(
      projectRoot,
      `backup_v52.48.5.44.13_${timestamp}`,
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
console.log('- 옵션현황(단열) 현장 골구도 엑셀 다운로드 추가');
console.log('- 동별 시트에서 호수 표기를 단열 옵션명으로 덮어쓰는 양식 적용');
console.log('- 엑셀 옵션명·셀 색상 업로드 및 골구도 미리보기 추가');
console.log('- 업로드 결과 저장·재조회 및 옵션별 범례·세대수 표시');
console.log('- Supabase SQL은 release 폴더의 파일을 별도로 실행해야 합니다.');

