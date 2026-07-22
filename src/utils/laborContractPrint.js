import ExcelJS from 'exceljs';

const CONTRACT_TEMPLATE_URL = '/templates/근로계약서.xlsx';
const CONTRACT_SHEET_NAME = '근로계약서';
const LAST_TEMPLATE_ROW = 41;
const LAST_TEMPLATE_COLUMN = 9;
const ROW_HEIGHT_SCALE = 0.84;
const FONT_SIZE_SCALE = 0.84;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeFilePart = (value) =>
  String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');

const formatKoreanDate = (value) => {
  const matched = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})/,
  );

  if (!matched) {
    return String(value || '');
  }

  return `${matched[1]}년 ${Number(matched[2])}월 ${Number(matched[3])}일`;
};

const columnLettersToNumber = (letters) =>
  String(letters || '')
    .toUpperCase()
    .split('')
    .reduce(
      (result, letter) =>
        result * 26 +
        letter.charCodeAt(0) -
        64,
      0,
    );

const parseCellAddress = (address) => {
  const matched = String(address || '').match(/^([A-Z]+)(\d+)$/i);

  if (!matched) {
    return null;
  }

  return {
    column: columnLettersToNumber(matched[1]),
    row: Number(matched[2]),
  };
};

const getArgbColor = (color, fallback = '') => {
  const argb = String(color?.argb || '');

  if (!/^[0-9a-f]{8}$/i.test(argb)) {
    return fallback;
  }

  return `#${argb.slice(2)}`;
};

const getBorderCss = (border) => {
  if (!border?.style) {
    return 'none';
  }

  const widthByStyle = {
    hair: '0.35pt',
    thin: '0.6pt',
    medium: '1.2pt',
    thick: '1.8pt',
    double: '1.8pt',
  };

  const lineByStyle = {
    dotted: 'dotted',
    dashed: 'dashed',
    dashDot: 'dashed',
    dashDotDot: 'dashed',
    double: 'double',
  };

  return [
    widthByStyle[border.style] || '0.6pt',
    lineByStyle[border.style] || 'solid',
    getArgbColor(border.color, '#000000'),
  ].join(' ');
};

const formatNumericCell = (value, numberFormat) => {
  const format = String(numberFormat || '');

  if (format.includes('#,##0')) {
    const decimals = format.includes('0.00')
      ? 2
      : 0;

    return Number(value).toLocaleString('ko-KR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  if (format.includes('0.00')) {
    return Number(value).toFixed(2);
  }

  return String(value);
};

const getCellText = (cell) => {
  const value = cell?.value;

  if (value === null || value === undefined) {
    return '';
  }

  if (value instanceof Date) {
    return formatKoreanDate([
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-'));
  }

  if (typeof value === 'number') {
    return formatNumericCell(value, cell.numFmt);
  }

  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text || '')
        .join('');
    }

    if (value.result !== undefined) {
      if (typeof value.result === 'number') {
        return formatNumericCell(value.result, cell.numFmt);
      }

      return String(value.result ?? '');
    }

    if (value.text !== undefined) {
      return String(value.text || '');
    }
  }

  return String(value);
};

const getCellStyle = (cell) => {
  const font = cell?.font || {};
  const alignment = cell?.alignment || {};
  const fill = cell?.fill || {};
  const border = cell?.border || {};
  const fontFamily = String(font.name || '').includes('돋움')
    ? 'Dotum, 돋움, Malgun Gothic, 맑은 고딕, sans-serif'
    : 'Malgun Gothic, 맑은 고딕, Dotum, 돋움, sans-serif';

  const styles = [
    `font-family:${fontFamily}`,
    `font-size:${Number(font.size || 11) * FONT_SIZE_SCALE}pt`,
    `font-weight:${font.bold ? 700 : 400}`,
    `font-style:${font.italic ? 'italic' : 'normal'}`,
    `text-decoration:${font.underline ? 'underline' : 'none'}`,
    `color:${getArgbColor(font.color, '#000000')}`,
    `text-align:${alignment.horizontal || 'left'}`,
    `vertical-align:${alignment.vertical === 'top' ? 'top' : alignment.vertical === 'bottom' ? 'bottom' : 'middle'}`,
    `white-space:${alignment.wrapText ? 'pre-wrap' : 'pre'}`,
    `border-top:${getBorderCss(border.top)}`,
    `border-right:${getBorderCss(border.right)}`,
    `border-bottom:${getBorderCss(border.bottom)}`,
    `border-left:${getBorderCss(border.left)}`,
  ];

  if (
    fill.type === 'pattern' &&
    fill.pattern !== 'none'
  ) {
    styles.push(
      `background:${getArgbColor(fill.fgColor, '#ffffff')}`,
    );
  }

  return styles.join(';');
};

const getMergeMaps = (worksheet) => {
  const mergeStarts = new Map();
  const coveredCells = new Set();
  const mergeRanges = Array.isArray(worksheet?.model?.merges)
    ? worksheet.model.merges
    : [];

  mergeRanges.forEach((range) => {
    const [startAddress, endAddress] = String(range).split(':');
    const start = parseCellAddress(startAddress);
    const end = parseCellAddress(endAddress || startAddress);

    if (!start || !end) {
      return;
    }

    const key = `${start.row}:${start.column}`;
    mergeStarts.set(key, {
      rowSpan: end.row - start.row + 1,
      colSpan: end.column - start.column + 1,
    });

    for (let row = start.row; row <= end.row; row += 1) {
      for (
        let column = start.column;
        column <= end.column;
        column += 1
      ) {
        if (row !== start.row || column !== start.column) {
          coveredCells.add(`${row}:${column}`);
        }
      }
    }
  });

  return {
    mergeStarts,
    coveredCells,
  };
};

const worksheetToHtml = (worksheet, workerName) => {
  const {
    mergeStarts,
    coveredCells,
  } = getMergeMaps(worksheet);
  const columnWidths = [];

  for (
    let column = 1;
    column <= LAST_TEMPLATE_COLUMN;
    column += 1
  ) {
    columnWidths.push(
      Number(worksheet.getColumn(column).width || 10),
    );
  }

  const totalWidth = columnWidths.reduce(
    (sum, width) => sum + width,
    0,
  );

  const columns = columnWidths
    .map(
      (width) =>
        `<col style="width:${(width / totalWidth) * 100}%">`,
    )
    .join('');
  const rows = [];

  for (let rowNumber = 1; rowNumber <= LAST_TEMPLATE_ROW; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cells = [];

    for (
      let column = 1;
      column <= LAST_TEMPLATE_COLUMN;
      column += 1
    ) {
      const key = `${rowNumber}:${column}`;

      if (coveredCells.has(key)) {
        continue;
      }

      const cell = row.getCell(column);
      const merge = mergeStarts.get(key);
      const spanAttributes = [
        merge?.rowSpan > 1
          ? `rowspan="${merge.rowSpan}"`
          : '',
        merge?.colSpan > 1
          ? `colspan="${merge.colSpan}"`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
      const text = escapeHtml(getCellText(cell))
        .replace(/\r?\n/g, '<br>');

      cells.push(
        `<td ${spanAttributes} style="${getCellStyle(cell)}">${text || '&nbsp;'}</td>`,
      );
    }

    rows.push(
      `<tr style="height:${Number(row.height || 15) * ROW_HEIGHT_SCALE}pt">${cells.join('')}</tr>`,
    );
  }

  return [
    `<section class="contract-page" aria-label="${escapeHtml(workerName)} 근로계약서">`,
    '<table class="contract-sheet">',
    `<colgroup>${columns}</colgroup>`,
    `<tbody>${rows.join('')}</tbody>`,
    '</table>',
    '</section>',
  ].join('');
};

const setContractValues = (worksheet, projectName, worker) => {
  const name = String(worker.name || '').trim();
  const residentNumber = String(worker.residentNumber || '').trim();
  const address = String(worker.address || '').trim();
  const contractStart = formatKoreanDate(worker.contractStartDate);
  const contractEnd = formatKoreanDate(worker.contractEndDate);

  worksheet.getCell('C6').value = name;
  worksheet.getCell('G6').value = residentNumber;
  worksheet.getCell('C7').value = address;
  worksheet.getCell('C10').value = contractStart;
  worksheet.getCell('E10').value = contractEnd;
  worksheet.getCell('C13').value = projectName;
  worksheet.getCell('G30').value = name;
  worksheet.getCell('H34').value = name;
  worksheet.getCell('A38').value = contractStart;
  worksheet.getCell('G39').value = name;
};

const buildPrintDocument = ({
  pages,
  fileName,
  batchId,
}) => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fileName.replace(/\.pdf$/i, ''))}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #e2e8f0; }
    body { font-family: Malgun Gothic, 맑은 고딕, Dotum, 돋움, sans-serif; color: #000; }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px;
      background: #0f172a;
      color: #fff;
      font-size: 14px;
    }
    .print-toolbar button {
      border: 0;
      border-radius: 6px;
      padding: 9px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .print-button { background: #2563eb; color: #fff; }
    .close-button { background: #e2e8f0; color: #0f172a; }
    .contract-page {
      width: 210mm;
      min-height: 297mm;
      margin: 10px auto;
      padding: 10mm 5mm 5mm;
      overflow: hidden;
      background: #fff;
      page-break-after: always;
    }
    .contract-page:last-of-type { page-break-after: auto; }
    .contract-sheet {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      table-layout: fixed;
    }
    .contract-sheet td {
      overflow: hidden;
      padding: 0 1.2pt;
      line-height: 1.02;
    }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      html, body { background: #fff; }
      .print-toolbar { display: none !important; }
      .contract-page {
        width: 210mm;
        height: 297mm;
        min-height: 0;
        margin: 0;
        padding: 10mm 5mm 5mm;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <span>${pages.length}명 통합 계약서 · 인쇄 대상에서 ‘PDF로 저장’을 선택하세요.</span>
    <button class="print-button" type="button" onclick="window.print()">인쇄 / PDF 저장</button>
    <button class="close-button" type="button" onclick="disposeAndClose(false)">닫기 및 폐기</button>
  </div>
  ${pages.join('')}
  <script>
    let disposed = false;
    function disposeAndClose(printed) {
      if (disposed) return;
      disposed = true;
      try {
        if (window.opener) {
          window.opener.postMessage({
            type: 'labor-contract-print-closed',
            batchId: ${JSON.stringify(batchId)},
            printed: Boolean(printed),
          }, window.location.origin);
        }
      } catch (error) {
        console.error(error);
      }
      document.body.innerHTML = '<div style="padding:24px;font-family:sans-serif">계약서 임시 데이터가 폐기되었습니다.</div>';
      setTimeout(() => window.close(), 120);
    }
    window.addEventListener('afterprint', () => disposeAndClose(true));
  </script>
</body>
</html>`;

export const createLaborContractPrintWindow = async ({
  workers,
  projectName,
  selectedMonth,
  batchId,
}) => {
  const printWindow = window.open(
    '',
    `labor_contract_${Date.now()}`,
    'popup=yes,width=1100,height=900,scrollbars=yes,resizable=yes',
  );

  if (!printWindow) {
    throw new Error('인쇄창이 차단되었습니다. 브라우저 주소창의 팝업 차단을 해제한 뒤 다시 시도해주세요.');
  }

  printWindow.document.open();
  printWindow.document.write(
    '<!doctype html><html lang="ko"><meta charset="utf-8"><title>근로계약서 준비 중</title><body style="font-family:sans-serif;padding:24px">근로계약서 양식을 준비하고 있습니다.</body></html>',
  );
  printWindow.document.close();

  try {
    const response = await fetch(CONTRACT_TEMPLATE_URL, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('근로계약서 원본 양식을 불러오지 못했습니다. public/templates/근로계약서.xlsx 파일을 확인해주세요.');
    }

    const templateBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(templateBuffer);
    const worksheet = workbook.getWorksheet(CONTRACT_SHEET_NAME);

    if (!worksheet) {
      throw new Error(`근로계약서 원본에서 '${CONTRACT_SHEET_NAME}' 시트를 찾지 못했습니다.`);
    }

    const pages = workers.map((worker) => {
      setContractValues(
        worksheet,
        projectName,
        worker,
      );

      return worksheetToHtml(
        worksheet,
        worker.name,
      );
    });
    const fileName = [
      '근로계약서',
      normalizeFilePart(projectName),
      selectedMonth,
      `${workers.length}명`,
    ]
      .filter(Boolean)
      .join('_') + '.pdf';
    const html = buildPrintDocument({
      pages,
      fileName,
      batchId,
    });

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();

    return {
      count: workers.length,
      fileName,
    };
  } catch (error) {
    printWindow.document.body.innerHTML = '';
    printWindow.close();
    throw error;
  }
};
