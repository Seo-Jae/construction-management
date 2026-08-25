const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.14';
const projectRoot = process.cwd();
const releaseRoot = path.resolve(projectRoot, 'release_v52.48.5.44.14');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

const fileDefinitions = [
  {
    relativePath: 'src/page/OptionManagementOverview.jsx',
    baseHash:
      'c67298bfdf846b74c572714dd058ee295bef5eb634aa634613963c5471f58796',
    releaseHash:
      '7364aeef31bb05c877d159e87f9d5f7a53736ac3ad862cc8dd7fa820454b74c8',
    versionMarker:
      '// v52.48.5.44.14 단열 옵션 상단정리·토스트·단일시트 무색상 전환',
  },
  {
    relativePath: 'src/utils/optionInsulationExcel.js',
    baseHash:
      '585bb6ba05cf2cfc157cbc2c2667d69e085f80e145284bcd1df49bb1dc35a2ea',
    releaseHash:
      '616600f64e21b73ff5c4b6328112d190011dede5f5bc93dc5e1726adcf5936a6',
    versionMarker:
      '// v52.48.5.44.14 옵션현황(단열) 전체 동 단일시트·빈 세대셀·무색상 양식',
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
      `v52.48.5.44.13 기준 파일과 다릅니다. 기존 변경을 보호하기 위해 중단합니다: ${definition.relativePath}`,
    );
  }

  return { ...definition, target, source, alreadyApplied };
});

preparedFiles.forEach((definition) => {
  if (definition.alreadyApplied) return;

  const backupPath = path.resolve(
    projectRoot,
    `backup_v52.48.5.44.14_${timestamp}`,
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
console.log('- 골구도 기준·단열 옵션 박스를 다운로드 버튼과 같은 높이로 통일');
console.log('- Excel 다운로드·업로드·저장 결과를 토스트 팝업으로 표시');
console.log('- 단열 화면의 파란색 작성 안내문 제거');
console.log('- 전체 동을 한 개의 골구도 시트에 배치');
console.log('- 미작성 세대 셀의 호수 표기 제거');
console.log('- 담당자가 입력한 옵션명만 사용하고 Excel 색상은 반영하지 않음');
console.log('- 새 Supabase SQL 실행 없음');

