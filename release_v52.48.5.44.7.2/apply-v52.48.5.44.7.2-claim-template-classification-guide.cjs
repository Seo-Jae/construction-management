const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.7.2';
const TARGET = path.resolve(process.cwd(), 'src/page/ProgressClaimManagement.jsx');
const BASE_MARKER = '// v52.48.5.44.7.1 최초계약 빈양식 다운로드';
const VERSION_MARKER = '// v52.48.5.44.7.2 최초계약 양식 구분 안내';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) {
    fail(`적용 기준을 찾지 못했습니다: ${label}`);
  }

  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) {
    fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  }

  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

if (!fs.existsSync(TARGET)) {
  fail(`파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8');

if (source.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

if (!source.includes(BASE_MARKER)) {
  fail(
    'ProgressClaimManagement.jsx가 v52.48.5.44.7.1 기준과 다릅니다. 기존 변경을 보호하기 위해 적용을 중단합니다.',
  );
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.7.2_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(
  backupDir,
  'src/page/ProgressClaimManagement.jsx',
);

fs.mkdirSync(path.dirname(backupPath), { recursive: true });
fs.copyFileSync(TARGET, backupPath);

source = replaceOnce(
  source,
  BASE_MARKER,
  `${VERSION_MARKER}\n${BASE_MARKER}`,
  '버전 마커',
);


source = replaceOnce(
  source,
  "const STANDARD_CLAIM_ITEM_KEY_COLUMN = 31; // AE\nconst STANDARD_CLAIM_NEW_CONTRACT_ROW_COUNT = 500;",
  "const STANDARD_CLAIM_ITEM_KEY_COLUMN = 31; // AE\nconst STANDARD_CLAIM_NEW_CONTRACT_ROW_COUNT = 500;\nconst STANDARD_CLAIM_NEW_CONTRACT_DATA_START_ROW = 8;",
  "최초계약 실제 입력 시작행 상수",
);

source = replaceOnce(
  source,
  "        'NO',\n        '타입·공구',\n        '옵션',",
  "        'NO',\n        '구분',\n        '옵션',",
  "Excel B6 헤더 구분 변경",
);

source = replaceOnce(
  source,
  "        isNewContractTemplate\n          ? '최초계약 등록용 양식입니다. 노란색 품목정보·계약수량·단가·금회수량 셀을 입력합니다. 미사용 행은 비워두세요.'\n          : '노란색 금회수량 셀만 입력합니다. 금액·누계·누계율은 자동 계산됩니다.';",
  "        isNewContractTemplate\n          ? '최초계약 등록용 양식입니다. 구분은 세대·공용 등으로 입력하고, 노란색 품목정보·계약수량·단가·금회수량 셀을 작성합니다. 미사용 행은 비워두세요.'\n          : '노란색 금회수량 셀만 입력합니다. 금액·누계·누계율은 자동 계산됩니다.';",
  "최초계약 작성안내 보완",
);

source = replaceOnce(
  source,
  "      if (isNewContractTemplate) {\n        for (\n          let index = 0;\n          index < STANDARD_CLAIM_NEW_CONTRACT_ROW_COUNT;\n          index += 1\n        ) {\n          const rowNumber =\n            STANDARD_CLAIM_DATA_START_ROW + index;",
  "      if (isNewContractTemplate) {\n        // B7은 입력값이 아니라 '구분'의 의미를 알려주는 예시 전용 행입니다.\n        // 실제 최초계약 입력은 8행부터 시작합니다.\n        const exampleRow = worksheet.getRow(\n          STANDARD_CLAIM_DATA_START_ROW,\n        );\n        exampleRow.height = 20;\n        exampleRow.getCell(2).value =\n          '예: 세대 / 공용';\n        exampleRow.getCell(2).font = {\n          name: '맑은 고딕',\n          size: 9,\n          italic: true,\n          color: { argb: 'FF64748B' },\n        };\n        exampleRow.getCell(2).alignment = {\n          horizontal: 'center',\n          vertical: 'middle',\n        };\n        exampleRow.getCell(2).fill = {\n          type: 'pattern',\n          pattern: 'solid',\n          fgColor: { argb: 'FFF1F5F9' },\n        };\n        exampleRow.getCell(2).border =\n          borderStyle;\n\n        for (\n          let index = 0;\n          index < STANDARD_CLAIM_NEW_CONTRACT_ROW_COUNT;\n          index += 1\n        ) {\n          const rowNumber =\n            STANDARD_CLAIM_NEW_CONTRACT_DATA_START_ROW + index;",
  "B7 예시행 및 실제 입력 8행 시작",
);

source = replaceOnce(
  source,
  "      const lastRow =\n        STANDARD_CLAIM_DATA_START_ROW + outputRowCount - 1;",
  "      const lastRow =\n        (isNewContractTemplate\n          ? STANDARD_CLAIM_NEW_CONTRACT_DATA_START_ROW\n          : STANDARD_CLAIM_DATA_START_ROW) +\n        outputRowCount -\n        1;",
  "최초계약 필터 마지막행 보정",
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressClaimManagement.jsx');
console.log('- Excel B6: 타입·공구 -> 구분');
console.log('- 최초계약 빈양식 B7: 예: 세대 / 공용 안내행 추가');
console.log('- 실제 계약 입력은 8행부터 시작');
console.log('- B7 예시행은 업로드 시 자동 제외');
console.log('- 기존 등록 계약이 있는 양식은 실제 품목이 7행부터 그대로 표시');
console.log('- 시스템 화면의 기존 열명은 이번 버전에서 변경하지 않음');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
