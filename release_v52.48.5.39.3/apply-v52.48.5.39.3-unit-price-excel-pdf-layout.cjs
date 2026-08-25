const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.39.3';
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const PRINT_SNIPPET = path.join(__dirname, 'files', 'printDocument-v52.48.5.39.3.txt');

function fail(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} 기준 코드를 정확히 1개 찾지 못했습니다. 발견: ${count}개`);
  }
  return source.replace(before, after);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
  return;
}

if (!fs.existsSync(PRINT_SNIPPET)) {
  fail('PDF/인쇄 교체 스니펫을 찾을 수 없습니다. ZIP을 다시 풀어주세요.');
  return;
}

try {
  const current = fs.readFileSync(TARGET, 'utf8');

  if (current.includes('// v52.48.5.39.3 Excel 세부서식 + PDF 동일양식 출력')) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
    return;
  }

  if (!current.includes('// v52.48.5.39.2 ExcelJS 순수 생성 방식: 복구경고/템플릿 로드 오류 제거 + 품명 A열')) {
    fail(
      '현재 UnitPriceAnalysis.jsx가 v52.48.5.39.2 기준과 다릅니다. '
      + '기존 변경을 보호하기 위해 자동 수정하지 않았습니다.',
    );
    return;
  }

  let next = current;

  next = replaceOnce(
    next,
    `  // v52.48.5.39.2 ExcelJS 순수 생성 방식: 복구경고/템플릿 로드 오류 제거 + 품명 A열\n  const exportDocumentExcel = async () => {`,
    `  // v52.48.5.39.2 ExcelJS 순수 생성 방식: 복구경고/템플릿 로드 오류 제거 + 품명 A열\n  // v52.48.5.39.3 Excel 세부서식 + PDF 동일양식 출력\n  const exportDocumentExcel = async () => {`,
    '버전 기준',
  );

  // 1) C1 "일위대가" - 원본 양식과 동일한 균등분할 + 들여쓰기 8
  next = replaceOnce(
    next,
    `        sheet.getCell('C1').alignment = {\n          vertical: 'middle',\n          horizontal: 'distributed',\n        };`,
    `        sheet.getCell('C1').alignment = {\n          vertical: 'middle',\n          horizontal: 'distributed',\n          indent: 8,\n        };`,
    'C1 균등분할 들여쓰기',
  );

  // 2) 품명 A:B - 본문 모든 행을 실제 병합하여 내부 세로선 제거
  next = replaceOnce(
    next,
    `        ].forEach((range) => sheet.mergeCells(range));\n\n        // 기본 글꼴/정렬/테두리`,
    `        ].forEach((range) => sheet.mergeCells(range));\n\n        // 원본 양식의 품명 영역처럼 A:B를 행별로 병합합니다.\n        // 값이 없는 행에서도 A/B 사이의 세로선이 생기지 않습니다.\n        for (let rowNumber = bodyStartRow; rowNumber <= bodyEndRow; rowNumber += 1) {\n          sheet.mergeCells(\`A\${rowNumber}:B\${rowNumber}\`);\n        }\n\n        // 기본 글꼴/정렬/테두리`,
    '본문 품명 A:B 병합',
  );

  next = replaceOnce(
    next,
    `            // 요청사항: A열에 실제 품명, B열은 공란.\n            // 재료비/노무비/경비 구분 텍스트는 본문에 기록하지 않습니다.\n            sheet.getCell(\`A\${rowNumber}\`).value = item.itemName || '';\n            sheet.getCell(\`B\${rowNumber}\`).value = null;`,
    `            // 요청사항: A:B 병합 영역에 실제 품명만 기록합니다.\n            // 재료비/노무비/경비 구분 텍스트는 본문에 기록하지 않습니다.\n            sheet.getCell(\`A\${rowNumber}\`).value = item.itemName || '';`,
    '본문 품명 값 입력',
  );

  next = replaceOnce(
    next,
    `            ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'J', 'N'].forEach((column) => {`,
    `            ['A', 'C', 'D', 'E', 'F', 'H', 'J', 'N'].forEach((column) => {`,
    '빈 행 초기화',
  );

  next = replaceOnce(
    next,
    `          ['A', 'B', 'C', 'N'].forEach((column) => {`,
    `          ['A', 'C', 'N'].forEach((column) => {`,
    '본문 왼쪽정렬',
  );

  // 3) A27:N29(동적 note 영역) - 외곽선만 유지하고 내부 선 전부 제거
  next = replaceOnce(
    next,
    `        for (let col = 1; col <= 14; col += 1) {\n          sheet.getRow(noteRow).getCell(col).border = {\n            ...sheet.getRow(noteRow).getCell(col).border,\n            top: medium,\n          };\n          sheet.getRow(printEndRow).getCell(col).border = {\n            ...sheet.getRow(printEndRow).getCell(col).border,\n            bottom: medium,\n          };\n        }\n\n        applyOuterEdges(sheet, 1, printEndRow);`,
    `        // 특이사항 3개 행은 하나의 큰 박스처럼 보이도록 내부 셀 선을 모두 제거합니다.\n        for (let rowNumber = noteRow; rowNumber <= printEndRow; rowNumber += 1) {\n          for (let col = 1; col <= 14; col += 1) {\n            sheet.getRow(rowNumber).getCell(col).border = {};\n          }\n        }\n        for (let col = 1; col <= 14; col += 1) {\n          sheet.getRow(noteRow).getCell(col).border = {\n            ...sheet.getRow(noteRow).getCell(col).border,\n            top: medium,\n          };\n          sheet.getRow(printEndRow).getCell(col).border = {\n            ...sheet.getRow(printEndRow).getCell(col).border,\n            bottom: medium,\n          };\n        }\n        for (let rowNumber = noteRow; rowNumber <= printEndRow; rowNumber += 1) {\n          sheet.getCell(\`A\${rowNumber}\`).border = {\n            ...sheet.getCell(\`A\${rowNumber}\`).border,\n            left: medium,\n          };\n          sheet.getCell(\`N\${rowNumber}\`).border = {\n            ...sheet.getCell(\`N\${rowNumber}\`).border,\n            right: medium,\n          };\n        }\n\n        applyOuterEdges(sheet, 1, printEndRow);`,
    '특이사항 외곽선 전용 처리',
  );

  // 4) 기존 화면 자체를 인쇄하던 window.print()를 제거하고,
  //    Excel과 같은 14열 양식의 전용 인쇄/PDF 창으로 교체합니다.
  const printSnippet = fs.readFileSync(PRINT_SNIPPET, 'utf8').trimEnd();
  const printPattern = /  const printDocument = \(\) => \{[\s\S]*?\n  \};\n\n  const renderAuthoringTable/;
  const printMatches = next.match(printPattern);
  if (!printMatches) {
    throw new Error('printDocument 기준 코드를 찾지 못했습니다.');
  }
  next = next.replace(
    printPattern,
    `${printSnippet}\n\n  const renderAuthoringTable`,
  );

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(
    ROOT,
    `backup_${VERSION}_${stamp}`,
    'src',
    'page',
  );
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(TARGET, path.join(backupDir, 'UnitPriceAnalysis.jsx'));

  fs.writeFileSync(TARGET, next, 'utf8');

  console.log(`[${VERSION}] 적용 완료`);
  console.log('- Excel C1: 균등분할 + 들여쓰기 8');
  console.log('- Excel 본문 품명: A:B 행별 병합 + 왼쪽정렬');
  console.log('- Excel 특이사항: 외곽선만 유지, 내부 선 제거');
  console.log('- 출력/PDF: Excel과 동일한 14열 일위대가 양식으로 전용 출력창 생성');
  console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
  console.log('- SQL 실행 없음');
} catch (error) {
  fail(error?.message || String(error));
}
