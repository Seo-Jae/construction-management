const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.44.7.1';
const TARGET = path.resolve(process.cwd(), 'src/page/ProgressClaimManagement.jsx');
const BASE_MARKER = '// v52.48.5.44.7 기성 표준양식 다운로드·업로드 v1';
const VERSION_MARKER = '// v52.48.5.44.7.1 최초계약 빈양식 다운로드';

function fail(message) {
  console.error(`[${VERSION}] ${message}`);
  process.exit(1);
}

function replaceOnce(source, anchor, replacement, label) {
  const first = source.indexOf(anchor);
  if (first === -1) fail(`적용 기준을 찾지 못했습니다: ${label}`);
  const second = source.indexOf(anchor, first + anchor.length);
  if (second !== -1) fail(`적용 기준이 2개 이상 발견되었습니다: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + anchor.length);
}

if (!fs.existsSync(TARGET)) fail(`파일을 찾을 수 없습니다: ${TARGET}`);

let source = fs.readFileSync(TARGET, 'utf8');

if (source.includes(VERSION_MARKER)) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

if (!source.includes(BASE_MARKER)) {
  fail('v52.48.5.44.7 기준 파일이 아닙니다. 기존 변경을 보호하기 위해 적용을 중단합니다.');
}

const backupDir = path.resolve(
  process.cwd(),
  `backup_v52.48.5.44.7.1_${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
const backupPath = path.join(backupDir, 'src/page/ProgressClaimManagement.jsx');
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
  "const STANDARD_CLAIM_DATA_START_ROW = 7;\nconst STANDARD_CLAIM_ITEM_KEY_COLUMN = 31; // AE",
  "const STANDARD_CLAIM_DATA_START_ROW = 7;\nconst STANDARD_CLAIM_ITEM_KEY_COLUMN = 31; // AE\nconst STANDARD_CLAIM_NEW_CONTRACT_ROW_COUNT = 500;",
  "신규계약 빈행 수 상수",
);
source = replaceOnce(
  source,
  "    const sourceKey = String(\n      unwrapCellValue(row.getCell(STANDARD_CLAIM_ITEM_KEY_COLUMN)) ?? '',\n    ).trim();\n\n    if (!sourceKey) continue;\n\n    const rawClassification = readText(row, 2);\n    const itemLabel = readText(row, 4);\n    const specification = readText(row, 5);\n    const unit = readText(row, 6);\n    const optionType =\n      readText(row, 3) || (itemLabel.includes('<확장>') ? '확장' : '기본');\n\n    if (!rawClassification || !itemLabel || !unit) continue;\n\n    const {\n      normalizedClassification,\n      housingType,\n      workZone,\n    } = parseClassification(rawClassification);\n\n    const contractQuantity = readNumber(row, 7);\n    const materialUnitPrice = readNumber(row, 8);\n    const laborUnitPrice = readNumber(row, 9);\n    const expenseUnitPrice = readNumber(row, 10);\n    const contractMaterialAmount = readNumber(row, 11);\n    const contractLaborAmount = readNumber(row, 12);\n    const contractExpenseAmount = readNumber(row, 13);",
  "    const itemLabel = readText(row, 4);\n\n    // 신규 최초계약용 빈 양식은 미사용 행에도 SYSTEM_ITEM_KEY가 들어가므로\n    // 실제 품명이 입력된 행만 계약품목으로 읽습니다.\n    if (!itemLabel) continue;\n\n    const hiddenSourceKey = String(\n      unwrapCellValue(row.getCell(STANDARD_CLAIM_ITEM_KEY_COLUMN)) ?? '',\n    ).trim();\n\n    const sourceKey =\n      hiddenSourceKey ||\n      `template:${metadata.project_name || 'project'}:${metadata.contract_version || 'contract'}:${rowNumber}`;\n\n    const rawClassification =\n      readText(row, 2) || '미분류';\n    const specification = readText(row, 5);\n    const unit = readText(row, 6);\n    const optionType =\n      readText(row, 3) || (itemLabel.includes('<확장>') ? '확장' : '기본');\n\n    if (!unit) {\n      throw new Error(\n        `${rowNumber}행 \"${itemLabel}\" 품목의 단위가 비어 있습니다.`,\n      );\n    }\n\n    const {\n      normalizedClassification,\n      housingType,\n      workZone,\n    } = parseClassification(rawClassification);\n\n    const contractQuantity = readNumber(row, 7);\n    const materialUnitPrice = readNumber(row, 8);\n    const laborUnitPrice = readNumber(row, 9);\n    const expenseUnitPrice = readNumber(row, 10);\n\n    // 표준양식은 엑셀 수식 결과값에 의존하지 않고 시스템에서 다시 계산합니다.\n    const contractMaterialAmount =\n      contractQuantity * materialUnitPrice;\n    const contractLaborAmount =\n      contractQuantity * laborUnitPrice;\n    const contractExpenseAmount =\n      contractQuantity * expenseUnitPrice;",
  "표준양식 신규계약 parser",
);
source = replaceOnce(
  source,
  "      if (contractRows.length === 0) {\n        throw new Error(\n          `\"${contractVersionLabel}\" 계약버전의 품목이 없습니다. 먼저 계약내역을 등록해주세요.`,\n        );\n      }\n\n      const previousClaim = [...claims]",
  "      const isNewContractTemplate =\n        contractRows.length === 0;\n\n      const previousClaim = [...claims]",
  "계약품목 0건 다운로드 허용",
);
source = replaceOnce(
  source,
  "        ['contract_version', contractVersionLabel.trim()],\n        ['generated_at', new Date().toISOString()],\n      ]);",
  "        ['contract_version', contractVersionLabel.trim()],\n        [\n          'template_mode',\n          isNewContractTemplate ? 'new_contract' : 'claim_only',\n        ],\n        ['generated_at', new Date().toISOString()],\n      ]);",
  "SYSTEM template_mode",
);
source = replaceOnce(
  source,
  "      worksheet.getCell('B3').value =\n        '노란색 금회수량 셀만 입력합니다. 금액·누계·누계율은 자동 계산됩니다.';",
  "      worksheet.getCell('B3').value =\n        isNewContractTemplate\n          ? '최초계약 등록용 양식입니다. 노란색 품목정보·계약수량·단가·금회수량 셀을 입력합니다. 미사용 행은 비워두세요.'\n          : '노란색 금회수량 셀만 입력합니다. 금액·누계·누계율은 자동 계산됩니다.';",
  "최초계약 안내문구",
);
source = replaceOnce(
  source,
  "      const orderedContractRows = [...contractRows].sort(\n        (left, right) =>\n          Number(left.sort_order || 0) - Number(right.sort_order || 0),\n      );\n\n      orderedContractRows.forEach((contractRow, index) => {",
  "      const orderedContractRows = [...contractRows].sort(\n        (left, right) =>\n          Number(left.sort_order || 0) - Number(right.sort_order || 0),\n      );\n\n      if (isNewContractTemplate) {\n        for (\n          let index = 0;\n          index < STANDARD_CLAIM_NEW_CONTRACT_ROW_COUNT;\n          index += 1\n        ) {\n          const rowNumber =\n            STANDARD_CLAIM_DATA_START_ROW + index;\n          const row = worksheet.getRow(rowNumber);\n\n          const sourceKey =\n            `new-contract:${encodeURIComponent(projectName)}:${encodeURIComponent(\n              contractVersionLabel.trim(),\n            )}:${String(index + 1).padStart(4, '0')}`;\n\n          row.values = [\n            index + 1,\n            '',\n            '기본',\n            '',\n            '',\n            '',\n            0,\n            0,\n            0,\n            0,\n            { formula: `G${rowNumber}*H${rowNumber}` },\n            { formula: `G${rowNumber}*I${rowNumber}` },\n            { formula: `G${rowNumber}*J${rowNumber}` },\n            { formula: `SUM(K${rowNumber}:M${rowNumber})` },\n            0,\n            0,\n            0,\n            0,\n            0,\n            0,\n            { formula: `T${rowNumber}*H${rowNumber}` },\n            { formula: `T${rowNumber}*I${rowNumber}` },\n            { formula: `T${rowNumber}*J${rowNumber}` },\n            { formula: `SUM(U${rowNumber}:W${rowNumber})` },\n            { formula: `O${rowNumber}+T${rowNumber}` },\n            { formula: `P${rowNumber}+U${rowNumber}` },\n            { formula: `Q${rowNumber}+V${rowNumber}` },\n            { formula: `R${rowNumber}+W${rowNumber}` },\n            { formula: `SUM(Z${rowNumber}:AB${rowNumber})` },\n            { formula: `IF(N${rowNumber}=0,0,AC${rowNumber}/N${rowNumber})` },\n            sourceKey,\n          ];\n\n          row.height = 20;\n\n          for (let column = 1; column <= 30; column += 1) {\n            const cell = row.getCell(column);\n            cell.font = {\n              name: '맑은 고딕',\n              size: 9,\n            };\n            cell.alignment = {\n              vertical: 'middle',\n            };\n            cell.border = borderStyle;\n          }\n\n          // 최초계약 등록시 사용자가 입력해야 하는 영역\n          [2, 3, 4, 5, 6, 7, 8, 9, 10, 20].forEach((column) => {\n            row.getCell(column).fill = {\n              type: 'pattern',\n              pattern: 'solid',\n              fgColor: { argb: 'FFFFF2CC' },\n            };\n          });\n\n          row.getCell(3).dataValidation = {\n            type: 'list',\n            allowBlank: true,\n            formulae: ['\"기본,확장\"'],\n          };\n\n          [7, 8, 9, 10, 20].forEach((column) => {\n            row.getCell(column).dataValidation = {\n              type: 'decimal',\n              operator: 'greaterThanOrEqual',\n              formulae: [0],\n              allowBlank: true,\n              showErrorMessage: true,\n              errorTitle: '입력값 확인',\n              error: '0 이상의 숫자를 입력해주세요.',\n            };\n          });\n\n          [7, 20, 25].forEach((column) => {\n            row.getCell(column).numFmt = '#,##0.####';\n          });\n\n          [\n            8, 9, 10, 11, 12, 13, 14,\n            16, 17, 18, 19, 21, 22, 23, 24,\n            26, 27, 28, 29,\n          ].forEach((column) => {\n            row.getCell(column).numFmt = '#,##0';\n          });\n\n          row.getCell(30).numFmt = '0.00%';\n        }\n      } else {\n        orderedContractRows.forEach((contractRow, index) => {",
  "신규계약 500행 생성 분기 시작",
);
source = replaceOnce(
  source,
  "        row.getCell(30).numFmt = '0.00%';\n      });\n\n      const lastRow =\n        STANDARD_CLAIM_DATA_START_ROW + orderedContractRows.length - 1;",
  "        row.getCell(30).numFmt = '0.00%';\n        });\n      }\n\n      const outputRowCount =\n        isNewContractTemplate\n          ? STANDARD_CLAIM_NEW_CONTRACT_ROW_COUNT\n          : orderedContractRows.length;\n\n      const lastRow =\n        STANDARD_CLAIM_DATA_START_ROW + outputRowCount - 1;",
  "신규계약 500행 생성 분기 종료",
);
source = replaceOnce(
  source,
  "      setMessage({\n        severity: 'success',\n        text:\n          `${claimNo}회차 기성 표준양식을 다운로드했습니다. 노란색 금회수량 셀만 작성한 뒤 다시 업로드해주세요.`,\n      });",
  "      setMessage({\n        severity: 'success',\n        text: isNewContractTemplate\n          ? `\"${contractVersionLabel}\" 계약품목이 아직 없어 최초계약 등록용 빈 양식을 다운로드했습니다. 노란색 셀에 계약내역을 입력한 뒤 업로드해주세요.`\n          : `${claimNo}회차 기성 표준양식을 다운로드했습니다. 노란색 금회수량 셀만 작성한 뒤 다시 업로드해주세요.`,\n      });",
  "다운로드 완료 안내",
);
fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log('- 수정: src/page/ProgressClaimManagement.jsx');
console.log('- 최초계약/신규 계약버전 품목이 0건이어도 양식 다운로드 가능');
console.log('- 신규 계약용 빈 입력행 500개 제공');
console.log('- 신규 계약용 입력셀: 타입·공구/옵션/품명/규격/단위/계약수량/재료·노무·경비단가/금회수량');
console.log('- 미사용 행은 품명이 비어 있으면 업로드에서 자동 제외');
console.log('- 계약금액은 업로드 시 시스템이 계약수량×단가로 재계산');
console.log('- 기존 계약품목이 있는 회차는 기존대로 금회수량만 입력');
console.log('- SQL 변경 없음');
console.log(`- 백업: ${path.relative(process.cwd(), backupPath)}`);
