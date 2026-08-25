const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.39.2';
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const REPLACEMENT = path.join(
  __dirname,
  'replacement',
  'exportDocumentExcel-v52.48.5.39.2.txt',
);

const START_MARKER = '  const exportDocumentExcel = async () => {';
const END_MARKER = '\n\n  const printDocument = () => {';
const VERSION_MARKER = '// v52.48.5.39.2 ExcelJS 순수 생성 방식: 복구경고/템플릿 로드 오류 제거 + 품명 A열';

function fail(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
} else if (!fs.existsSync(REPLACEMENT)) {
  fail('교체 코드를 찾을 수 없습니다. ZIP을 다시 풀어주세요.');
} else {
  const source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');
  const replacement = fs.readFileSync(REPLACEMENT, 'utf8').replace(/\r\n/g, '\n');

  if (source.includes(VERSION_MARKER)) {
    console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  } else {
    const startIndex = source.indexOf(START_MARKER);
    const endIndex = source.indexOf(END_MARKER, startIndex);

    if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
      fail(
        '현재 UnitPriceAnalysis.jsx에서 Excel 다운로드 함수의 안전한 교체 위치를 찾지 못했습니다. '
        + '기존 변경 보호를 위해 자동 수정하지 않았습니다.',
      );
    } else if (!source.includes("import ExcelJS from 'exceljs';")) {
      fail(
        '현재 UnitPriceAnalysis.jsx에서 ExcelJS import를 확인하지 못했습니다. '
        + '기존 변경 보호를 위해 자동 수정하지 않았습니다.',
      );
    } else {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(
        ROOT,
        `backup_${VERSION}_${stamp}`,
        'src',
        'page',
      );
      fs.mkdirSync(backupDir, { recursive: true });
      fs.copyFileSync(TARGET, path.join(backupDir, 'UnitPriceAnalysis.jsx'));

      const nextSource = source.slice(0, startIndex)
        + replacement
        + source.slice(endIndex);

      fs.writeFileSync(TARGET, nextSource, 'utf8');
      const applied = fs.readFileSync(TARGET, 'utf8');

      const checks = [
        VERSION_MARKER,
        "const workbook = new ExcelJS.Workbook();",
        "buildSheet('정미값', 'net');",
        "buildSheet('제출용', 'submitted');",
        "sheet.getCell(`A${rowNumber}`).value = item.itemName || '';",
        "sheet.getCell(`B${rowNumber}`).value = null;",
      ];

      const missing = checks.filter((token) => !applied.includes(token));
      if (missing.length > 0) {
        fail(`교체 후 검증에 실패했습니다: ${missing.join(' / ')}`);
      } else if (applied.includes("await workbook.xlsx.load(await templateResponse.arrayBuffer())")) {
        fail('기존 xlsx 템플릿 로드 코드가 남아 있습니다. 적용을 중단했습니다.');
      } else {
        console.log(`[${VERSION}] 적용 완료`);
        console.log('- 외부 xlsx 템플릿 로드 제거');
        console.log('- Cannot read properties of undefined (reading sheets) 오류 제거');
        console.log('- ExcelJS가 새 통합문서를 직접 생성하여 Excel 복구 경고 원인 제거');
        console.log('- 사용자 제공 양식 구조/병합/열너비/행높이/헤더색/인쇄설정 재현');
        console.log('- A6~: 실제 품명 입력');
        console.log('- B6~: 공란 유지');
        console.log('- 재료비/노무비/경비 구분 문구를 품명 영역에 기록하지 않음');
        console.log('- 정미값 / 제출용 2개 시트 유지');
        console.log('- 저장/버전/기술자료/지시선/부속자재/DB 변경 없음');
        console.log('- SQL 실행 없음');
        console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
      }
    }
  }
}
