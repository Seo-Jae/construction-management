// v52.48.5.44.133 자재마스터 Excel 다운로드·갱신 업로드
import ExcelJS from 'exceljs';

const TEMPLATE_VERSION = '1';
const TEMPLATE_CATEGORY = 'material-master';
const DATA_SHEET_NAME = '자재마스터';
const CATEGORY_SHEET_NAME = '_분류목록';
const META_SHEET_NAME = '_시스템정보';
const HEADER_ROW = 5;
const DATA_START_ROW = HEADER_ROW + 1;
const MAX_IMPORT_ROWS = 10000;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const COLUMNS = [
  { key: 'categoryName', header: '자재분류*', width: 18 },
  { key: 'processName', header: '공정', width: 16 },
  { key: 'standardName', header: '표준 품명*', width: 30 },
  { key: 'specification', header: '표준 규격', width: 26 },
  { key: 'unit', header: '단위', width: 11 },
  { key: 'manufacturer', header: '제조사/브랜드', width: 20 },
  { key: 'aliasesText', header: '검색 별칭(쉼표 구분)', width: 36 },
  { key: 'isMainMaterial', header: '주요자재 기본항목(Y/N)', width: 22 },
  { key: 'mainSortOrder', header: '주요자재 기본순서', width: 20 },
  { key: 'isActive', header: '사용상태(Y/N)', width: 16 },
  { key: 'note', header: '비고', width: 34 },
  { key: 'id', header: '관리ID(수정금지·신규 공란)', width: 38 },
];

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalizeKey = (value) => normalizeText(value).toLocaleLowerCase('ko-KR');

const toPlainCellValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text || '').join('');
    }
    if (value.result !== undefined && value.result !== null) return value.result;
    if (value.text !== undefined && value.text !== null) return value.text;
    if (value.formula !== undefined || value.sharedFormula !== undefined) return '';
  }
  return value;
};

const getCellText = (cell) => normalizeText(toPlainCellValue(cell?.value));

const parseAliases = (value) => {
  const aliases = [];
  const seen = new Set();
  String(value ?? '')
    .split(/[,;\n]/)
    .map(normalizeText)
    .filter(Boolean)
    .forEach((alias) => {
      const key = normalizeKey(alias);
      if (seen.has(key)) return;
      seen.add(key);
      aliases.push(alias);
    });
  return aliases;
};

const parseYesNo = (value, defaultValue, address) => {
  const text = normalizeKey(value);
  if (!text) return defaultValue;
  if (['y', 'yes', '예', '사용', 'true', '1'].includes(text)) return true;
  if (['n', 'no', '아니오', '미사용', 'false', '0'].includes(text)) return false;
  throw new Error(`${address}에는 Y 또는 N을 입력해주세요.`);
};

const parseSortOrder = (value, address) => {
  const text = getCellText({ value });
  if (!text) return 100;
  const number = Number(text.replace(/,/g, ''));
  if (!Number.isInteger(number) || number < 1 || number > 999999) {
    throw new Error(`${address}에는 1~999999 사이의 정수를 입력해주세요.`);
  }
  return number;
};

const categoryNameById = (categories, categoryId) =>
  categories.find((row) => row.id === categoryId)?.name || '';

const readMetaValue = (sheet, key) => {
  for (let rowNumber = 1; rowNumber <= 10; rowNumber += 1) {
    if (getCellText(sheet.getCell(rowNumber, 1)) === key) {
      return getCellText(sheet.getCell(rowNumber, 2));
    }
  }
  return '';
};

const applyRowBorder = (row) => {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = {
      bottom: { style: 'hair', color: { argb: 'FFDCE3EC' } },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: [1, 2, 3, 4, 6, 7, 11].includes(cell.col) ? 'left' : 'center',
    };
    cell.font = { name: '맑은 고딕', size: 10, color: { argb: 'FF1E293B' } };
  });
};

export const createMaterialMasterWorkbook = ({
  materials = [],
  categories = [],
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '공사관리 시스템';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(DATA_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, activeCell: `A${DATA_START_ROW}` }],
    properties: { defaultRowHeight: 20 },
  });
  worksheet.showGridLines = false;

  worksheet.mergeCells('A1:L1');
  worksheet.getCell('A1').value = '자재마스터 Excel 관리';
  worksheet.getCell('A1').font = {
    name: '맑은 고딕',
    size: 16,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  worksheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells('A2:L2');
  worksheet.getCell('A2').value =
    '기존 행은 값을 수정하고, 신규 자재는 아래 빈 행에 추가한 뒤 이 파일을 그대로 업로드하세요.';
  worksheet.getCell('A2').font = { name: '맑은 고딕', size: 10, color: { argb: 'FF334155' } };
  worksheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'left' };

  worksheet.mergeCells('A3:L3');
  worksheet.getCell('A3').value =
    '주의: 기존 행의 관리ID는 수정하지 마세요. 기존 행을 복사해 신규 자재로 등록할 때는 복사된 관리ID를 반드시 지우세요.';
  worksheet.getCell('A3').font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
  worksheet.getCell('A3').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF1F2' },
  };
  worksheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(3).height = 23;

  COLUMNS.forEach((column, index) => {
    worksheet.getColumn(index + 1).width = column.width;
    const cell = worksheet.getCell(HEADER_ROW, index + 1);
    cell.value = column.header;
    cell.font = { name: '맑은 고딕', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: index === 11 ? 'FF64748B' : 'FF334155' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      right: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'thin', color: { argb: 'FF64748B' } },
    };
  });
  worksheet.getRow(HEADER_ROW).height = 34;

  materials.forEach((material, index) => {
    const row = worksheet.getRow(DATA_START_ROW + index);
    row.values = [
      categoryNameById(categories, material.category_id),
      material.process_name || '',
      material.standard_name || '',
      material.specification || '',
      material.unit || '',
      material.manufacturer || '',
      Array.isArray(material.aliases) ? material.aliases.join(', ') : '',
      material.is_main_material ? 'Y' : 'N',
      Number(material.main_sort_order) || 100,
      material.is_active === false ? 'N' : 'Y',
      material.note || '',
      material.id || '',
    ];
    applyRowBorder(row);
    row.getCell(12).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
  });

  const lastReservedRow = DATA_START_ROW + materials.length + 19;
  worksheet.autoFilter = {
    from: { row: HEADER_ROW, column: 1 },
    to: { row: lastReservedRow, column: COLUMNS.length },
  };

  const categorySheet = workbook.addWorksheet(CATEGORY_SHEET_NAME);
  categorySheet.getCell('A1').value = '자재분류';
  categories.forEach((category, index) => {
    categorySheet.getCell(index + 2, 1).value = category.name;
  });
  categorySheet.state = 'veryHidden';

  const categoryLastRow = Math.max(2, categories.length + 1);
  worksheet.dataValidations.add(`A${DATA_START_ROW}:A${MAX_IMPORT_ROWS + DATA_START_ROW}`, {
    type: 'list',
    allowBlank: false,
    formulae: [`'${CATEGORY_SHEET_NAME}'!$A$2:$A$${categoryLastRow}`],
    showErrorMessage: true,
    errorTitle: '등록된 분류만 선택',
    error: '목록에 있는 자재분류를 선택해주세요.',
  });
  [8, 10].forEach((column) => {
    const letter = worksheet.getColumn(column).letter;
    worksheet.dataValidations.add(`${letter}${DATA_START_ROW}:${letter}${MAX_IMPORT_ROWS + DATA_START_ROW}`, {
      type: 'list',
      allowBlank: true,
      formulae: ['"Y,N"'],
      showErrorMessage: true,
      errorTitle: 'Y/N 입력',
      error: 'Y 또는 N을 입력해주세요.',
    });
  });
  worksheet.dataValidations.add(`I${DATA_START_ROW}:I${MAX_IMPORT_ROWS + DATA_START_ROW}`, {
    type: 'whole',
    operator: 'between',
    allowBlank: true,
    formulae: [1, 999999],
    showErrorMessage: true,
    errorTitle: '순서 입력 오류',
    error: '1~999999 사이의 정수를 입력해주세요.',
  });

  for (let rowNumber = DATA_START_ROW + materials.length; rowNumber <= lastReservedRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.getCell(8).value = 'N';
    row.getCell(9).value = 100;
    row.getCell(10).value = 'Y';
    applyRowBorder(row);
    row.getCell(12).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
  }

  const metaSheet = workbook.addWorksheet(META_SHEET_NAME);
  metaSheet.addRows([
    ['template_version', TEMPLATE_VERSION],
    ['category', TEMPLATE_CATEGORY],
    ['header_row', HEADER_ROW],
    ['data_start_row', DATA_START_ROW],
  ]);
  metaSheet.state = 'veryHidden';

  return workbook;
};

const downloadWorkbook = async (workbook, fileName) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const getTodayText = () => {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
};

export const saveMaterialMasterWorkbook = async ({
  materials = [],
  categories = [],
  fileName = '',
}) => {
  const workbook = createMaterialMasterWorkbook({ materials, categories });
  await downloadWorkbook(
    workbook,
    normalizeText(fileName) || `자재마스터_${getTodayText()}.xlsx`,
  );
  return materials.length;
};

export const parseMaterialMasterWorkbookBuffer = async ({
  buffer,
  categories = [],
}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet(DATA_SHEET_NAME);
  const metaSheet = workbook.getWorksheet(META_SHEET_NAME);
  if (!worksheet || !metaSheet) {
    throw new Error('시스템 정보가 없는 파일입니다. 자재마스터 화면에서 다시 다운로드해주세요.');
  }
  if (readMetaValue(metaSheet, 'template_version') !== TEMPLATE_VERSION) {
    throw new Error('지원하지 않는 자재마스터 양식입니다. 최신 파일을 다시 다운로드해주세요.');
  }
  if (readMetaValue(metaSheet, 'category') !== TEMPLATE_CATEGORY) {
    throw new Error('자재마스터용 Excel 파일이 아닙니다.');
  }

  COLUMNS.forEach((column, index) => {
    const actual = getCellText(worksheet.getCell(HEADER_ROW, index + 1));
    if (actual !== column.header) {
      throw new Error(`${worksheet.getCell(HEADER_ROW, index + 1).address} 헤더를 수정하지 말아주세요.`);
    }
  });

  const categoryMap = new Map(
    categories.map((category) => [normalizeKey(category.name), category]),
  );
  const rows = [];
  const seenIds = new Map();
  const maximumRow = Math.min(
    worksheet.rowCount || DATA_START_ROW,
    MAX_IMPORT_ROWS + DATA_START_ROW - 1,
  );

  for (let rowNumber = DATA_START_ROW; rowNumber <= maximumRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = COLUMNS.map((_, index) => getCellText(row.getCell(index + 1)));
    const hasUserValue = values.some((value, index) => {
      if ([7, 8, 9].includes(index) && ['N', '100', 'Y'].includes(value)) return false;
      return Boolean(value);
    });
    if (!hasUserValue) continue;

    const categoryName = values[0];
    const category = categoryMap.get(normalizeKey(categoryName));
    if (!category) {
      throw new Error(`A${rowNumber} 자재분류 "${categoryName || '공란'}"은 시스템에 등록되어 있지 않습니다.`);
    }

    const standardName = values[2];
    if (!standardName) {
      throw new Error(`C${rowNumber} 표준 품명을 입력해주세요.`);
    }
    if (standardName.length > 200) {
      throw new Error(`C${rowNumber} 표준 품명은 200자 이내로 입력해주세요.`);
    }

    const id = values[11];
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      throw new Error(`L${rowNumber} 관리ID가 올바르지 않습니다. 기존 값을 수정하지 말아주세요.`);
    }
    if (id && seenIds.has(id)) {
      throw new Error(
        `L${rowNumber} 관리ID가 ${seenIds.get(id)}행과 중복되었습니다. 복사한 행을 신규 등록하려면 관리ID를 지워주세요.`,
      );
    }
    if (id) seenIds.set(id, rowNumber);

    rows.push({
      rowNumber,
      id,
      categoryId: category.id,
      categoryName: category.name,
      processName: values[1],
      standardName,
      specification: values[3],
      unit: values[4],
      manufacturer: values[5],
      aliases: parseAliases(values[6]),
      isMainMaterial: parseYesNo(values[7], false, `H${rowNumber}`),
      mainSortOrder: parseSortOrder(row.getCell(9).value, `I${rowNumber}`),
      isActive: parseYesNo(values[9], true, `J${rowNumber}`),
      note: values[10],
    });
  }

  if ((worksheet.rowCount || 0) > MAX_IMPORT_ROWS + DATA_START_ROW - 1) {
    throw new Error(`한 파일에 최대 ${MAX_IMPORT_ROWS.toLocaleString()}개 자재까지 업로드할 수 있습니다.`);
  }
  if (rows.length === 0) {
    throw new Error('업로드할 자재가 없습니다. 자재마스터 시트에 내용을 입력해주세요.');
  }

  return {
    rows,
    updateCount: rows.filter((row) => row.id).length,
    insertCount: rows.filter((row) => !row.id).length,
    inactiveCount: rows.filter((row) => !row.isActive).length,
  };
};

export const parseMaterialMasterWorkbookFile = async ({ file, categories = [] }) => {
  if (!file) throw new Error('Excel 파일을 선택해주세요.');
  if (!/\.xlsx$/i.test(file.name || '')) {
    throw new Error('자재마스터 화면에서 내려받은 .xlsx 파일을 선택해주세요.');
  }
  if (Number(file.size || 0) > MAX_FILE_SIZE) {
    throw new Error('자재마스터 Excel 파일은 15MB 이하만 업로드할 수 있습니다.');
  }
  return parseMaterialMasterWorkbookBuffer({
    buffer: await file.arrayBuffer(),
    categories,
  });
};
