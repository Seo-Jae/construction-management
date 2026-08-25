const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.42.3';
const target = path.join(process.cwd(), 'src', 'page', 'UnitPriceAnalysis.jsx');

if (!fs.existsSync(target)) {
  console.error(`[${VERSION}] src/page/UnitPriceAnalysis.jsx 파일을 찾지 못했습니다.`);
  process.exit(1);
}

let source = fs.readFileSync(target, 'utf8');

if (source.includes('// v52.48.5.42.3 기본 잡자재 단수정리')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

const requiredAnchors = [
  "const isRoundingMaterial = (row) => (",
  "const loadTemplateRows = useCallback(async (specId, target = 'draft') => {",
  "const updateDraftRow = (clientId, field, value) => {",
  "const removeSelectedDraftRows = () => {",
  "setDraftRows(mapStoredDocumentItems(data, nextDocument));",
  "setDraftRows(mapStoredDocumentItems(snapshotItems, nextDocument));",
];

for (const anchor of requiredAnchors) {
  if (!source.includes(anchor)) {
    console.error(`[${VERSION}] 예상 코드 위치를 찾지 못했습니다: ${anchor}`);
    console.error('기존 변경을 보호하기 위해 자동 적용을 중단합니다.');
    process.exit(1);
  }
}

const backupDir = path.join(
  process.cwd(),
  `backup_${VERSION}_${new Date().toISOString().replace(/[:.]/g, '-')}`,
  'src',
  'page',
);
fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(target, path.join(backupDir, 'UnitPriceAnalysis.jsx'));

// 1) 재료비(단수정리) 기본행 생성/보장 helper 추가
const roundingAnchor = `const isRoundingMaterial = (row) => (\n  row.costType === 'material_rounding' || row.costType === 'expense_rounding'\n);\n`;

const roundingReplacement = `${roundingAnchor}\n// v52.48.5.42.3 기본 잡자재 단수정리\nconst DEFAULT_ROUNDING_ITEM_NAME = '잡자재';\nconst DEFAULT_ROUNDING_SPECIFICATION = '피스 외';\nconst DEFAULT_ROUNDING_UNIT = '식';\n\nconst makeDefaultRoundingRow = (sortOrder = 0) => ({\n  ...makeBlankRow(sortOrder),\n  costType: 'material_rounding',\n  itemName: DEFAULT_ROUNDING_ITEM_NAME,\n  specification: DEFAULT_ROUNDING_SPECIFICATION,\n  unit: DEFAULT_ROUNDING_UNIT,\n  netQuantity: 0,\n  laborAmountPerM2: '',\n  unitPrice: 0,\n  itemMarkupPercent: '',\n  submittedQuantityOverride: '',\n  isOwnerSupplied: false,\n});\n\nconst ensureDefaultRoundingRow = (rows) => {\n  const sourceRows = Array.isArray(rows) ? rows : [];\n  const nextRows = [];\n  let roundingAdded = false;\n\n  sourceRows.forEach((row) => {\n    if (!isRoundingMaterial(row)) {\n      nextRows.push(row);\n      return;\n    }\n\n    // 문서당 재료비(단수정리)는 한 개만 유지합니다.\n    if (roundingAdded) return;\n\n    roundingAdded = true;\n    nextRows.push({\n      ...row,\n      costType: 'material_rounding',\n      itemName: DEFAULT_ROUNDING_ITEM_NAME,\n      specification: DEFAULT_ROUNDING_SPECIFICATION,\n      unit: DEFAULT_ROUNDING_UNIT,\n      netQuantity: 0,\n      laborAmountPerM2: '',\n      itemMarkupPercent: '',\n      submittedQuantityOverride: '',\n      isOwnerSupplied: false,\n    });\n  });\n\n  if (!roundingAdded) {\n    nextRows.push(makeDefaultRoundingRow(nextRows.length));\n  }\n\n  return nextRows.map((row, index) => ({\n    ...row,\n    sortOrder: index,\n  }));\n};\n`;

source = source.replace(roundingAnchor, roundingReplacement);

// 2) 규격 기본값을 실제 작성화면으로 불러올 때 항상 기본 단수정리행 추가
const loadRowsOld = `    if (target === 'template') setTemplateRows(nextRows);\n    else {\n      setDraftRows(nextRows);\n      setSelectedRowIds(new Set());\n    }\n    return nextRows;`;
const loadRowsNew = `    if (target === 'template') {\n      setTemplateRows(nextRows);\n      return nextRows;\n    }\n\n    const draftNextRows = ensureDefaultRoundingRow(nextRows);\n    setDraftRows(draftNextRows);\n    setSelectedRowIds(new Set());\n    return draftNextRows;`;
if (!source.includes(loadRowsOld)) {
  console.error(`[${VERSION}] 규격 기본값 적용부 구조가 예상과 다릅니다.`);
  process.exit(1);
}
source = source.replace(loadRowsOld, loadRowsNew);

// 3) 작성행 수정 시 기본 단수정리행의 품명/규격/구분이 사라지지 않도록 보호
source = source.replace(
  `  const updateDraftRow = (clientId, field, value) => {\n    setDraftRows((previous) => previous.map((row) => {\n      if (row.clientId !== clientId) return row;`,
  `  const updateDraftRow = (clientId, field, value) => {\n    setDraftRows((previous) => ensureDefaultRoundingRow(previous.map((row) => {\n      if (row.clientId !== clientId) return row;\n\n      if (isRoundingMaterial(row) && field === 'costType' && value !== 'material_rounding') {\n        return row;\n      }`
);

const updateDraftCloseOld = `      return { ...row, [field]: value };\n    }));\n  };\n\n  const updateTemplateRow`;
const updateDraftCloseNew = `      return { ...row, [field]: value };\n    })));\n  };\n\n  const updateTemplateRow`;
if (!source.includes(updateDraftCloseOld)) {
  console.error(`[${VERSION}] 작성행 수정 함수 종료부 구조가 예상과 다릅니다.`);
  process.exit(1);
}
source = source.replace(updateDraftCloseOld, updateDraftCloseNew);

// 수동으로 단수정리 구분을 선택했을 때도 동일한 기본 품명/규격 사용
source = source.replace(
  `            itemName: '',\n            specification: '',\n            unit: '식',`,
  `            itemName: DEFAULT_ROUNDING_ITEM_NAME,\n            specification: DEFAULT_ROUNDING_SPECIFICATION,\n            unit: DEFAULT_ROUNDING_UNIT,`
);

// 4) 기본 단수정리행을 삭제하려고 해도 즉시 복구
const removeOld = `    setDraftRows((previous) => previous\n      .filter((row) => !selectedRowIds.has(row.clientId))\n      .map((row, index) => ({ ...row, sortOrder: index })));\n    setSelectedRowIds(new Set());`;
const removeNew = `    const removingDefaultRounding = draftRows.some(\n      (row) => selectedRowIds.has(row.clientId) && isRoundingMaterial(row),\n    );\n\n    setDraftRows((previous) => ensureDefaultRoundingRow(\n      previous.filter((row) => !selectedRowIds.has(row.clientId)),\n    ));\n    setSelectedRowIds(new Set());\n\n    if (removingDefaultRounding) {\n      showToast('잡자재 재료비(단수정리)는 모든 일위대가의 기본항목이라 삭제되지 않습니다.', 'info');\n    }`;
if (!source.includes(removeOld)) {
  console.error(`[${VERSION}] 행 삭제 함수 구조가 예상과 다릅니다.`);
  process.exit(1);
}
source = source.replace(removeOld, removeNew);

// 5) 기존 저장문서/버전이력에 단수정리행이 없어도 화면에서 자동 추가
source = source.replace(
  `setDraftRows(mapStoredDocumentItems(data, nextDocument));`,
  `setDraftRows(ensureDefaultRoundingRow(mapStoredDocumentItems(data, nextDocument)));`
);
source = source.replace(
  `setDraftRows(mapStoredDocumentItems(snapshotItems, nextDocument));`,
  `setDraftRows(ensureDefaultRoundingRow(mapStoredDocumentItems(snapshotItems, nextDocument)));`
);

// 6) 기본 단수정리행만 있는 빈 문서는 저장되지 않도록 기존 검증 의미 유지
const validationOld = `    if (draftRows.length === 0 || draftRows.every((row) => !row.itemName.trim())) {\n      showToast('일위대가 항목을 한 개 이상 입력해주세요.', 'warning');\n      return false;\n    }`;
const validationNew = `    const regularRows = draftRows.filter((row) => !isRoundingMaterial(row));\n    if (regularRows.length === 0 || regularRows.every((row) => !String(row.itemName || '').trim())) {\n      showToast('일위대가 항목을 한 개 이상 입력해주세요.', 'warning');\n      return false;\n    }`;
if (!source.includes(validationOld)) {
  console.error(`[${VERSION}] 저장 검증부 구조가 예상과 다릅니다.`);
  process.exit(1);
}
source = source.replace(validationOld, validationNew);

// 최종 검증
const checks = [
  "const DEFAULT_ROUNDING_ITEM_NAME = '잡자재';",
  "const DEFAULT_ROUNDING_SPECIFICATION = '피스 외';",
  "const draftNextRows = ensureDefaultRoundingRow(nextRows);",
  "setDraftRows(ensureDefaultRoundingRow(mapStoredDocumentItems(data, nextDocument)));",
  "setDraftRows(ensureDefaultRoundingRow(mapStoredDocumentItems(snapshotItems, nextDocument)));",
  "잡자재 재료비(단수정리)는 모든 일위대가의 기본항목이라 삭제되지 않습니다.",
];

for (const check of checks) {
  if (!source.includes(check)) {
    console.error(`[${VERSION}] 적용 후 검증 실패: ${check}`);
    process.exit(1);
  }
}

fs.writeFileSync(target, source, 'utf8');

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log('- 모든 일위대가 작성화면에 재료비(단수정리) 기본행을 자동 포함합니다.');
console.log('- 기본 품명: 잡자재');
console.log('- 기본 규격: 피스 외');
console.log('- 재료비(단수정리)는 재료비 합계에 반영되는 기존 계산규칙을 그대로 사용합니다.');
console.log('- 기존 저장문서/버전이력도 불러올 때 기본행이 없으면 자동 추가합니다.');
console.log('- 기본 단수정리행을 삭제해도 즉시 복구됩니다.');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${backupDir}`);
