const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.39';
const ROOT = process.cwd();

const TARGET = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const TEMPLATE_SOURCE = path.join(
  __dirname,
  'files',
  'public',
  'templates',
  'unit_price_template.xlsx',
);
const TEMPLATE_TARGET = path.join(
  ROOT,
  'public',
  'templates',
  'unit_price_template.xlsx',
);
const REPLACEMENT_PATH = path.join(
  __dirname,
  'replacement',
  'exportDocumentExcel-v52.48.5.39.txt',
);

const START_MARKER = '  const exportDocumentExcel = async () => {';
const END_MARKER = '\n\n  const printDocument = () => {';

function fail(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
} else if (!fs.existsSync(TEMPLATE_SOURCE)) {
  fail('일위대가 엑셀 양식 파일을 찾을 수 없습니다. ZIP을 다시 풀어주세요.');
} else if (!fs.existsSync(REPLACEMENT_PATH)) {
  fail('Excel 내보내기 교체 코드를 찾을 수 없습니다. ZIP을 다시 풀어주세요.');
} else {
  const source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');
  const replacement = fs.readFileSync(REPLACEMENT_PATH, 'utf8').replace(/\r\n/g, '\n');

  if (source.includes('// v52.48.5.39 사용자 제공 일위대가 엑셀 양식 적용')) {
    console.log(`[${VERSION}] UnitPriceAnalysis.jsx는 이미 적용되어 있습니다.`);
  } else {
    const startIndex = source.indexOf(START_MARKER);
    const endIndex = source.indexOf(END_MARKER, startIndex);

    if (startIndex < 0 || endIndex < 0) {
      fail(
        '현재 UnitPriceAnalysis.jsx에서 기존 Excel 내보내기 함수 위치를 찾지 못했습니다. '
        + '기존 변경 보호를 위해 자동 수정하지 않았습니다.',
      );
    } else if (
      !source.includes("import ExcelJS from 'exceljs';")
      || !source.includes("createSheet('net', '정미값');")
      || !source.includes("createSheet('submitted', '제출용');")
    ) {
      fail(
        '현재 UnitPriceAnalysis.jsx의 Excel 내보내기 구조가 확인된 기준과 다릅니다. '
        + '기존 변경 보호를 위해 자동 수정하지 않았습니다.',
      );
    } else {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupRoot = path.join(ROOT, `backup_${VERSION}_${stamp}`);

      fs.mkdirSync(path.join(backupRoot, 'src', 'page'), { recursive: true });
      fs.copyFileSync(
        TARGET,
        path.join(backupRoot, 'src', 'page', 'UnitPriceAnalysis.jsx'),
      );

      if (fs.existsSync(TEMPLATE_TARGET)) {
        fs.mkdirSync(
          path.join(backupRoot, 'public', 'templates'),
          { recursive: true },
        );
        fs.copyFileSync(
          TEMPLATE_TARGET,
          path.join(
            backupRoot,
            'public',
            'templates',
            'unit_price_template.xlsx',
          ),
        );
      }

      const nextSource = (
        source.slice(0, startIndex)
        + replacement
        + source.slice(endIndex)
      );

      fs.mkdirSync(path.dirname(TEMPLATE_TARGET), { recursive: true });
      fs.writeFileSync(TARGET, nextSource, 'utf8');
      fs.copyFileSync(TEMPLATE_SOURCE, TEMPLATE_TARGET);

      const verifySource = fs.readFileSync(TARGET, 'utf8');
      if (
        !verifySource.includes('// v52.48.5.39 사용자 제공 일위대가 엑셀 양식 적용')
        || !verifySource.includes("fetch('/templates/unit_price_template.xlsx'")
        || !verifySource.includes("fillTemplateSheet(netSheet, 'net')")
        || !verifySource.includes("fillTemplateSheet(submittedSheet, 'submitted')")
      ) {
        fail('교체 후 UnitPriceAnalysis.jsx 검증에 실패했습니다. 백업은 유지되어 있습니다.');
      } else if (!fs.existsSync(TEMPLATE_TARGET)) {
        fail('교체 후 일위대가 양식 파일 확인에 실패했습니다.');
      } else {
        console.log(`[${VERSION}] 적용 완료`);
        console.log('- 사용자 제공 일위대가양식.xlsx를 런타임 템플릿으로 적용');
        console.log('- 정미값 / 제출용 2개 시트 모두 동일 양식 사용');
        console.log('- 기본 20개 항목, 초과 시 동일 행 스타일 자동 확장');
        console.log('- 재료비 / 노무비 / 경비 / 합계 계산열 유지');
        console.log('- 지급자재 / 비고 반영');
        console.log('- 사용자 양식의 병합/글꼴/테두리/색상/열너비/인쇄설정 유지');
        console.log('- DB / 저장 / 기술자료 / 지시선 기능 변경 없음');
        console.log('- SQL 실행 없음');
        console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
      }
    }
  }

  if (!process.exitCode) {
    fs.mkdirSync(path.dirname(TEMPLATE_TARGET), { recursive: true });
    fs.copyFileSync(TEMPLATE_SOURCE, TEMPLATE_TARGET);
  }
}
