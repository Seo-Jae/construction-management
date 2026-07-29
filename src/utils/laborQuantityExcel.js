import ExcelJS from 'exceljs';

export const LABOR_QUANTITY_EXCEL_TEST_PROJECT =
  '한라건설 용인금어지구';

const TEMPLATE_VERSION = '1';
const DATA_SHEET_NAME = '세대별 물량';
const META_SHEET_NAME = '_시스템정보';
const HEADER_ROW_NUMBER = 7;
const DATA_START_ROW_NUMBER = HEADER_ROW_NUMBER + 1;
const MAX_IMPORT_ROWS = 10000;

const HEADER_ALIASES = {
  combinedUnit: [
    '동호수',
    '동호',
    '동호실',
    '동호실번호',
    '세대번호',
    '세대코드',
    '세대키',
  ],
  building: ['동', '동명', '건물', '건물동', '빌딩'],
  floor: ['층', '층수', '해당층'],
  unit: ['호', '호수', '세대', '세대호수', '호실', '호실번호'],
  unitType: ['타입', '세대타입', '주택형', '형별', 'type'],
  quantity: [
    '물량',
    '수량',
    '세대물량',
    '작업물량',
    '적용물량',
    'quantity',
    'qty',
  ],
  confirmationRound: [
    '적용확정차수',
    '확정차수',
    '단가차수',
    '적용차수',
    '차수',
  ],
};

const headerLookup = Object.entries(HEADER_ALIASES).reduce(
  (result, [fieldName, aliases]) => {
    aliases.forEach((alias) => {
      result[
        String(alias)
          .trim()
          .toLowerCase()
          .replace(/[\s_\-./()[\]{}<>·]/g, '')
      ] = fieldName;
    });
    return result;
  },
  {},
);

const toPlainCellValue = (value) => {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object') {
    if (Array.isArray(value?.richText)) {
      return value.richText.map((item) => item.text || '').join('');
    }
    if (value?.result !== undefined && value?.result !== null) {
      return value.result;
    }
    if (value?.text !== undefined && value?.text !== null) {
      return value.text;
    }
  }

  return value;
};

const normalizeHeader = (value) =>
  String(toPlainCellValue(value) ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-./()[\]{}<>·]/g, '');

const normalizeBuilding = (value) => {
  const text = String(toPlainCellValue(value) ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/동$/u, '')
    .replace(/\.0+$/, '');

  if (!text) return '';
  return /^\d+$/.test(text) ? String(Number(text)) : text.toLowerCase();
};

const normalizeUnit = (value) => {
  const text = String(toPlainCellValue(value) ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/호$/u, '')
    .replace(/\.0+$/, '');

  if (!text) return '';
  return /^\d+$/.test(text) ? String(Number(text)) : text.toLowerCase();
};

const normalizeCombinedUnit = (value) =>
  String(toPlainCellValue(value) ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.0+$/, '')
    .replace(/[동호실]/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

const pairKey = (building, unit) =>
  `${normalizeBuilding(building)}::${normalizeUnit(unit)}`;

const createUnitLookups = (validUnits) => {
  const byPair = new Map();
  const byCombined = new Map();

  (validUnits || []).forEach((row) => {
    const key = pairKey(row.building, row.unit);
    const building = normalizeBuilding(row.building);
    const unit = normalizeUnit(row.unit);

    if (!building || !unit || !row.cellKey) return;

    byPair.set(key, row);
    [
      `${building}${unit}`,
      `${row.building}${row.unit}`,
      `${row.building}동${row.unit}호`,
      `${row.building}-${row.unit}`,
    ].forEach((alias) => {
      const normalizedAlias = normalizeCombinedUnit(alias);
      if (normalizedAlias) byCombined.set(normalizedAlias, row);
    });
  });

  return { byPair, byCombined };
};

const getCellText = (cell) => {
  const value = toPlainCellValue(cell?.value);
  return String(value ?? '').trim();
};

const toDownloadFilenamePart = (value) =>
  String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');

const parseQuantity = (value) => {
  const text = String(toPlainCellValue(value) ?? '')
    .trim()
    .replace(/,/g, '');

  if (!text) return { provided: false };
  if (!/^\d+(?:\.\d{1,4})?$/.test(text)) {
    return {
      provided: true,
      error: '물량은 0 이상의 숫자이며 소수점 넷째 자리까지 입력할 수 있습니다.',
    };
  }

  const quantity = Number(text);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { provided: true, error: '물량은 0 이상이어야 합니다.' };
  }

  return { provided: true, value: quantity };
};

const parseConfirmationRound = (value) => {
  const text = String(toPlainCellValue(value) ?? '').trim();
  if (!text) return { provided: false };

  const normalized = text.replace(/\s+/g, '');
  if (
    ['0', '미지정', '계산제외', '미적용', '없음', '-'].includes(
      normalized,
    )
  ) {
    return { provided: true, value: 0 };
  }

  const matched = normalized.match(/^(\d+)(?:차)?(?:확정)?$/);
  if (!matched || Number(matched[1]) <= 0) {
    return {
      provided: true,
      error:
        '확정차수는 1, 1차, 1차 확정 형식으로 입력해주세요. 미지정은 0으로 입력할 수 있습니다.',
    };
  }

  return { provided: true, value: Number(matched[1]) };
};

const mapHeaderRow = (worksheet, rowNumber) => {
  const row = worksheet.getRow(rowNumber);
  const fields = {};
  const maximumColumn = Math.min(
    Math.max(worksheet.actualColumnCount || 0, row.cellCount || 0),
    50,
  );

  for (let columnNumber = 1; columnNumber <= maximumColumn; columnNumber += 1) {
    const normalized = normalizeHeader(row.getCell(columnNumber).value);
    const fieldName = headerLookup[normalized];

    if (fieldName && !fields[fieldName]) {
      fields[fieldName] = columnNumber;
    }
  }

  const hasUnitIdentifier =
    Boolean(fields.combinedUnit) ||
    Boolean(fields.unit) ||
    Boolean(fields.building && fields.unit);
  const score =
    Object.keys(fields).length +
    (fields.quantity ? 5 : 0) +
    (hasUnitIdentifier ? 5 : 0);

  return {
    worksheet,
    rowNumber,
    fields,
    score,
    valid: Boolean(fields.quantity && hasUnitIdentifier),
  };
};

const findImportHeader = (workbook) => {
  const candidates = [];

  workbook.worksheets
    .filter((worksheet) => worksheet.name !== META_SHEET_NAME)
    .forEach((worksheet) => {
      const maximumRow = Math.min(worksheet.rowCount || 0, 100);
      for (let rowNumber = 1; rowNumber <= maximumRow; rowNumber += 1) {
        const candidate = mapHeaderRow(worksheet, rowNumber);
        if (candidate.valid) candidates.push(candidate);
      }
    });

  return candidates.sort((first, second) => second.score - first.score)[0];
};

const readMetadata = (workbook) => {
  const worksheet = workbook.getWorksheet(META_SHEET_NAME);
  if (!worksheet) return {};

  const metadata = {};
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const key = getCellText(worksheet.getCell(rowNumber, 1));
    if (!key) continue;
    metadata[key] = getCellText(worksheet.getCell(rowNumber, 2));
  }
  return metadata;
};

export const isLaborQuantityExcelTestProject = (projectName) =>
  String(projectName || '').trim() === LABOR_QUANTITY_EXCEL_TEST_PROJECT;

export const createLaborQuantityWorkbook = ({
  projectName,
  processType,
  unitName,
  units,
  quantities,
  quantityRounds,
  rateOptions,
}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '현장관리 시스템';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(DATA_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW_NUMBER }],
  });

  worksheet.columns = [
    { key: 'combinedUnit', width: 15 },
    { key: 'building', width: 10 },
    { key: 'floor', width: 9 },
    { key: 'unit', width: 11 },
    { key: 'unitType', width: 13 },
    { key: 'quantity', width: 15 },
    { key: 'confirmationRound', width: 18 },
    { key: 'unitName', width: 10 },
  ];

  worksheet.mergeCells('A1:H1');
  worksheet.getCell('A1').value = `${processType} 세대별 물량 입력`;
  worksheet.getCell('A1').font = {
    name: '맑은 고딕',
    size: 16,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  worksheet.getCell('A1').alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  worksheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1D4ED8' },
  };
  worksheet.getRow(1).height = 30;

  worksheet.getCell('A2').value = '현장';
  worksheet.getCell('B2').value = projectName;
  worksheet.getCell('D2').value = '공정';
  worksheet.getCell('E2').value = processType;
  worksheet.getCell('G2').value = '단위';
  worksheet.getCell('H2').value = unitName || '-';

  worksheet.mergeCells('A4:H4');
  worksheet.getCell('A4').value =
    '노란색 열에 물량과 적용 확정차수를 입력하세요. 행 순서를 바꿔도 동호수 기준으로 불러옵니다.';
  worksheet.getCell('A4').font = {
    name: '맑은 고딕',
    size: 10,
    bold: true,
    color: { argb: 'FF92400E' },
  };
  worksheet.getCell('A4').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF7ED' },
  };
  worksheet.getCell('A4').alignment = { horizontal: 'left' };

  worksheet.mergeCells('A5:H5');
  worksheet.getCell('A5').value =
    '다른 파일을 사용할 때는 동호수+물량 또는 동+호+물량 열이 있으면 됩니다. 층·타입은 확인용입니다.';
  worksheet.getCell('A5').font = {
    name: '맑은 고딕',
    size: 9,
    color: { argb: 'FF475569' },
  };

  const headerLabels = [
    '동호수',
    '동',
    '층',
    '호',
    '타입',
    '물량',
    '적용 확정차수',
    '단위',
  ];
  const headerRow = worksheet.getRow(HEADER_ROW_NUMBER);
  headerLabels.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = {
      name: '맑은 고딕',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
  headerRow.height = 25;

  (units || []).forEach((unitRow, index) => {
    const rowNumber = DATA_START_ROW_NUMBER + index;
    const row = worksheet.getRow(rowNumber);
    const building = String(unitRow.building ?? '').trim();
    const unit = String(unitRow.unit ?? '').trim();
    const cellKey = unitRow.cellKey;
    const quantity = quantities?.[cellKey];
    const hasQuantity = String(quantity ?? '').trim() !== '';
    const confirmationRound = Number(quantityRounds?.[cellKey]) || 0;

    row.values = [
      `${normalizeBuilding(building)}${normalizeUnit(unit)}`,
      building,
      unitRow.floor || '',
      unit,
      unitRow.unitType === '미지정' ? '' : unitRow.unitType || '',
      hasQuantity ? Number(quantity) : '',
      confirmationRound > 0 ? `${confirmationRound}차 확정` : '',
      unitName || '-',
    ];

    row.height = 21;
    for (let columnNumber = 1; columnNumber <= 8; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.font = { name: '맑은 고딕', size: 9 };
      cell.alignment = {
        horizontal: columnNumber === 6 ? 'right' : 'center',
        vertical: 'middle',
      };
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
      if (columnNumber === 6 || columnNumber === 7) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF7CC' },
        };
      }
    }
    row.getCell(1).numFmt = '@';
    row.getCell(6).numFmt = '#,##0.####';
  });

  const lastRow = Math.max(
    HEADER_ROW_NUMBER,
    DATA_START_ROW_NUMBER + (units || []).length - 1,
  );
  worksheet.autoFilter = {
    from: { row: HEADER_ROW_NUMBER, column: 1 },
    to: { row: lastRow, column: 8 },
  };

  const metadataSheet = workbook.addWorksheet(META_SHEET_NAME);
  metadataSheet.state = 'veryHidden';
  const metadataRows = [
    ['template_version', TEMPLATE_VERSION],
    ['project_name', projectName],
    ['process_type', processType],
    ['unit_name', unitName || ''],
    ['generated_at', new Date().toISOString()],
    ['available_round_label', '확정차수'],
    ...(rateOptions || []).map((row) => [
      String(row.confirmation_round),
      `${row.confirmation_round}차 확정`,
    ]),
  ];
  metadataRows.forEach((values, index) => {
    metadataSheet.getRow(index + 1).values = values;
  });

  const validationStartRow = 7;
  const validationEndRow =
    validationStartRow + Math.max((rateOptions || []).length - 1, 0);
  if ((rateOptions || []).length > 0) {
    for (
      let rowNumber = DATA_START_ROW_NUMBER;
      rowNumber <= lastRow;
      rowNumber += 1
    ) {
      worksheet.getCell(rowNumber, 7).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [
          `'${META_SHEET_NAME}'!$B$${validationStartRow}:$B$${validationEndRow}`,
        ],
        showErrorMessage: true,
        errorTitle: '확정차수 확인',
        error: '목록에 있는 확정차수를 선택해주세요.',
      };
    }
  }

  return workbook;
};

export const saveLaborQuantityWorkbook = async (options) => {
  const workbook = createLaborQuantityWorkbook(options);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const filename = [
    toDownloadFilenamePart(options.projectName),
    toDownloadFilenamePart(options.processType),
    '세대별물량',
  ]
    .filter(Boolean)
    .join('_');

  anchor.href = url;
  anchor.download = `${filename}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return (options.units || []).length;
};

export const parseLaborQuantityWorkbookBuffer = async ({
  arrayBuffer,
  projectName,
  processType,
  validUnits,
  allowedRounds = [],
}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);

  const metadata = readMetadata(workbook);
  if (
    metadata.template_version &&
    metadata.project_name &&
    metadata.project_name !== String(projectName || '').trim()
  ) {
    throw new Error(
      `이 파일은 ${metadata.project_name} 현장용입니다. 현재 현장과 일치하지 않습니다.`,
    );
  }
  if (
    metadata.template_version &&
    metadata.process_type &&
    metadata.process_type !== String(processType || '').trim()
  ) {
    throw new Error(
      `이 파일은 ${metadata.process_type} 공정용입니다. 현재 선택 공정은 ${processType}입니다.`,
    );
  }

  const header = findImportHeader(workbook);
  if (!header) {
    throw new Error(
      '동호수+물량 또는 동+호+물량 머리글을 찾지 못했습니다.',
    );
  }

  const { worksheet, rowNumber: headerRowNumber, fields } = header;
  const dataRowCount = (worksheet.rowCount || 0) - headerRowNumber;
  if (dataRowCount > MAX_IMPORT_ROWS) {
    throw new Error(
      `업로드 파일은 한 시트에 ${MAX_IMPORT_ROWS.toLocaleString()}행까지만 처리할 수 있습니다.`,
    );
  }

  const { byPair, byCombined } = createUnitLookups(validUnits);
  const allowedRoundSet = new Set(
    (allowedRounds || [])
      .map((value) => Number(value))
      .filter((value) => value > 0),
  );
  const seenCellKeys = new Set();
  const updates = [];
  const unknownRows = [];
  const invalidRows = [];
  const duplicateRows = [];
  let blankRows = 0;
  let quantityRows = 0;
  let roundRows = 0;

  for (
    let rowNumber = headerRowNumber + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);
    const quantityResult = parseQuantity(
      fields.quantity ? row.getCell(fields.quantity).value : '',
    );
    const roundResult = parseConfirmationRound(
      fields.confirmationRound
        ? row.getCell(fields.confirmationRound).value
        : '',
    );

    if (!quantityResult.provided && !roundResult.provided) {
      blankRows += 1;
      continue;
    }

    if (quantityResult.error || roundResult.error) {
      invalidRows.push({
        rowNumber,
        message: quantityResult.error || roundResult.error,
      });
      continue;
    }

    let matchedUnit = null;
    let identifier = '';
    const buildingValue = fields.building
      ? getCellText(row.getCell(fields.building))
      : '';
    const unitValue = fields.unit
      ? getCellText(row.getCell(fields.unit))
      : '';
    const combinedValue = fields.combinedUnit
      ? getCellText(row.getCell(fields.combinedUnit))
      : '';

    if (buildingValue && unitValue) {
      matchedUnit = byPair.get(pairKey(buildingValue, unitValue)) || null;
      identifier = `${buildingValue}동 ${unitValue}호`;
    }

    if (!matchedUnit && combinedValue) {
      matchedUnit =
        byCombined.get(normalizeCombinedUnit(combinedValue)) || null;
      identifier = combinedValue;
    }

    if (!matchedUnit && unitValue) {
      matchedUnit =
        byCombined.get(normalizeCombinedUnit(unitValue)) || null;
      identifier = unitValue;
    }

    if (!matchedUnit) {
      unknownRows.push({
        rowNumber,
        identifier: identifier || '동호수 없음',
      });
      continue;
    }

    if (seenCellKeys.has(matchedUnit.cellKey)) {
      duplicateRows.push({
        rowNumber,
        identifier:
          identifier ||
          `${matchedUnit.building}동 ${matchedUnit.unit}호`,
      });
      continue;
    }

    if (
      roundResult.provided &&
      roundResult.value > 0 &&
      !allowedRoundSet.has(roundResult.value)
    ) {
      invalidRows.push({
        rowNumber,
        message: `${roundResult.value}차 확정단가가 현재 공정에 등록되어 있지 않습니다.`,
      });
      continue;
    }

    seenCellKeys.add(matchedUnit.cellKey);
    if (quantityResult.provided) quantityRows += 1;
    if (roundResult.provided) roundRows += 1;
    updates.push({
      cellKey: matchedUnit.cellKey,
      building: matchedUnit.building,
      unit: matchedUnit.unit,
      quantity: quantityResult.provided
        ? quantityResult.value
        : undefined,
      confirmationRound: roundResult.provided
        ? roundResult.value
        : undefined,
    });
  }

  if (updates.length === 0) {
    const issueCount =
      unknownRows.length + invalidRows.length + duplicateRows.length;
    throw new Error(
      issueCount > 0
        ? `가져올 수 있는 정상 행이 없습니다. 오류 ${issueCount.toLocaleString()}건을 확인해주세요.`
        : '물량 또는 적용 확정차수가 입력된 행이 없습니다.',
    );
  }

  return {
    sourceSheet: worksheet.name,
    headerRowNumber,
    updates,
    matchedRows: updates.length,
    quantityRows,
    roundRows,
    blankRows,
    unknownRows,
    invalidRows,
    duplicateRows,
  };
};

export const parseLaborQuantityWorkbookFile = async (options) => {
  const fileName = String(options.file?.name || '').toLowerCase();
  if (fileName.endsWith('.xls')) {
    throw new Error(
      '구형 .xls 파일은 지원하지 않습니다. Excel에서 .xlsx로 다시 저장한 뒤 업로드해주세요.',
    );
  }

  return parseLaborQuantityWorkbookBuffer({
    ...options,
    arrayBuffer: await options.file.arrayBuffer(),
  });
};
