import ExcelJS from 'exceljs';

export const LABOR_QUANTITY_EXCEL_TEST_PROJECT =
  '한라건설 용인금어지구';

const TEMPLATE_VERSION = '4';
const DATA_SHEET_NAME = '세대별 물량';
const REFERENCE_SHEET_NAME = '세대정보';
const META_SHEET_NAME = '_시스템정보';
const HEADER_ROW_NUMBER = 7;
const DATA_START_ROW_NUMBER = HEADER_ROW_NUMBER + 1;
const MAX_IMPORT_ROWS = 10000;

const HEADER_ALIASES = {
  combinedUnit: [
    '동호수',
    '동호수①',
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
    '물량②',
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
          .replace(/[\u2460-\u2473]/g, '')
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
    if (
      value?.formula !== undefined ||
      value?.sharedFormula !== undefined
    ) {
      return '';
    }
  }

  return value;
};

const normalizeHeader = (value) =>
  String(toPlainCellValue(value) ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u2460-\u2473]/g, '')
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

const createCombinedUnitAliases = (buildingValue, unitValue) => {
  const building = normalizeBuilding(buildingValue);
  const unit = normalizeUnit(unitValue);

  if (!building || !unit) return [];

  const aliases = new Set([`${building}${unit}`]);

  // 9층 이하 호수를 0901, 0802처럼 네 자리로 작성해도
  // 세대정보 자동조회 수식이 정상적으로 타입을 찾도록 별칭을 제공합니다.
  if (/^\d+$/.test(unit)) {
    aliases.add(`${building}${unit.padStart(4, '0')}`);
  }

  return Array.from(aliases);
};

const createReferenceRows = (units) => {
  const aliasMap = new Map();
  const ambiguousAliases = new Set();

  (units || []).forEach((unitRow) => {
    const unitType =
      unitRow.unitType === '미지정' ? '' : unitRow.unitType || '';
    const cellKey = String(unitRow.cellKey || '').trim();

    createCombinedUnitAliases(unitRow.building, unitRow.unit).forEach(
      (alias) => {
        const normalizedAlias = normalizeCombinedUnit(alias);
        if (!normalizedAlias || ambiguousAliases.has(normalizedAlias)) return;

        const existing = aliasMap.get(normalizedAlias);
        if (existing && existing.cellKey !== cellKey) {
          aliasMap.delete(normalizedAlias);
          ambiguousAliases.add(normalizedAlias);
          return;
        }

        aliasMap.set(normalizedAlias, {
          combinedUnit: alias,
          unitType,
          cellKey,
        });
      },
    );
  });

  return Array.from(aliasMap.values()).sort((first, second) =>
    first.combinedUnit.localeCompare(second.combinedUnit, 'ko-KR', {
      numeric: true,
      sensitivity: 'base',
    }),
  );
};

const createUnitLookups = (validUnits) => {
  const byCombined = new Map();
  const ambiguousCombined = new Set();

  (validUnits || []).forEach((row) => {
    const building = normalizeBuilding(row.building);
    const unit = normalizeUnit(row.unit);

    if (!building || !unit || !row.cellKey) return;

    const aliases = [
      `${building}${unit}`,
      `${row.building}${row.unit}`,
      `${row.building}동${row.unit}호`,
      `${row.building}-${row.unit}`,
    ];

    /*
      9층 이하 세대를 담당자마다 아래 두 방식으로 관리하고 있습니다.
      - 101동 901호  → 101901
      - 101동 0901호 → 1010901

      시스템에 등록된 호수가 숫자라면 호수를 네 자리로 0 채운 별칭도
      함께 만들어 두 방식 모두 같은 세대로 매칭합니다.
    */
    if (/^\d+$/.test(unit)) {
      aliases.push(`${building}${unit.padStart(4, '0')}`);
    }

    aliases.forEach((alias) => {
      const normalizedAlias = normalizeCombinedUnit(alias);
      if (!normalizedAlias || ambiguousCombined.has(normalizedAlias)) return;

      const existing = byCombined.get(normalizedAlias);
      if (existing && existing.cellKey !== row.cellKey) {
        byCombined.delete(normalizedAlias);
        ambiguousCombined.add(normalizedAlias);
        return;
      }

      byCombined.set(normalizedAlias, row);
    });
  });

  return { byCombined, ambiguousCombined };
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

  const score =
    Object.keys(fields).length +
    (fields.quantity ? 5 : 0) +
    (fields.combinedUnit ? 5 : 0);

  return {
    worksheet,
    rowNumber,
    fields,
    score,
    valid: Boolean(fields.quantity && fields.combinedUnit),
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
  workbook.calcProperties.fullCalcOnLoad = true;

  const worksheet = workbook.addWorksheet(DATA_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW_NUMBER }],
    properties: { tabColor: { argb: 'FF2563EB' } },
  });

  worksheet.columns = [
    { key: 'combinedUnit', width: 17 },
    { key: 'quantity', width: 17 },
    { key: 'unitType', width: 16 },
    { key: 'confirmationRound', width: 21 },
    { key: 'unitName', width: 11 },
  ];

  worksheet.mergeCells('A1:E1');
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
  worksheet.getCell('C2').value = '공정';
  worksheet.mergeCells('D2:E2');
  worksheet.getCell('D2').value = processType;
  worksheet.getCell('A3').value = '단위';
  worksheet.getCell('B3').value = unitName || '-';

  worksheet.mergeCells('A4:E4');
  worksheet.getCell('A4').value =
    '① 동호수와 ② 물량을 입력하세요. 월별 노임 계산에는 ③ 적용 확정차수가 필요합니다.';
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

  worksheet.mergeCells('A5:E5');
  worksheet.getCell('A5').value =
    (rateOptions || []).length === 1
      ? `확정단가가 1개이므로 물량 입력 시 ${(rateOptions || [])[0]?.confirmation_round}차 확정이 자동 적용됩니다. 타입은 세대정보 시트에서 자동 조회되며 101901·1010901 형식을 모두 인식합니다.`
      : (rateOptions || []).length > 1
        ? '확정단가가 여러 개이면 세대별 적용 차수를 선택하세요. 타입은 세대정보 시트에서 자동 조회되며 101901·1010901 형식을 모두 인식합니다.'
        : '월별 노임 계산 전에 공정별 노임단가에서 확정차수를 먼저 등록하세요. 타입은 세대정보 시트에서 자동 조회되며 101901·1010901 형식을 모두 인식합니다.';
  worksheet.getCell('A5').font = {
    name: '맑은 고딕',
    size: 9,
    color: { argb: 'FF475569' },
  };

  const headerLabels = [
    '동호수①',
    '물량②',
    '타입(자동)',
    '적용 확정차수③',
    '단위',
  ];
  const headerFillColors = [
    'FF1D4ED8',
    'FFD97706',
    'FF64748B',
    'FF7C3AED',
    'FF475569',
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
      fgColor: { argb: headerFillColors[index] },
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

  const referenceSheet = workbook.addWorksheet(REFERENCE_SHEET_NAME, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: 'FF94A3B8' } },
  });
  referenceSheet.columns = [
    { key: 'combinedUnit', width: 17 },
    { key: 'unitType', width: 16 },
  ];
  const referenceHeader = referenceSheet.getRow(1);
  referenceHeader.values = ['동호수', '타입'];
  referenceHeader.height = 25;
  for (let columnNumber = 1; columnNumber <= 2; columnNumber += 1) {
    const cell = referenceHeader.getCell(columnNumber);
    cell.font = {
      name: '맑은 고딕',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF475569' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  }

  const referenceRows = createReferenceRows(units);

  referenceRows.forEach((referenceRow, index) => {
    const row = referenceSheet.getRow(index + 2);
    row.values = [referenceRow.combinedUnit, referenceRow.unitType];
    row.height = 20;
    row.getCell(1).numFmt = '@';
    for (let columnNumber = 1; columnNumber <= 2; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.font = { name: '맑은 고딕', size: 9 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
    }
  });

  const referenceLastRow = Math.max(2, referenceRows.length + 1);
  const singleConfirmationRound =
    (rateOptions || []).length === 1
      ? Number((rateOptions || [])[0]?.confirmation_round) || 0
      : 0;
  referenceSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: referenceLastRow, column: 2 },
  };

  (units || []).forEach((unitRow, index) => {
    const rowNumber = DATA_START_ROW_NUMBER + index;
    const row = worksheet.getRow(rowNumber);
    const building = String(unitRow.building ?? '').trim();
    const unit = String(unitRow.unit ?? '').trim();
    const cellKey = unitRow.cellKey;
    const quantity = quantities?.[cellKey];
    const hasQuantity = String(quantity ?? '').trim() !== '';
    const confirmationRound = Number(quantityRounds?.[cellKey]) || 0;

    const combinedUnit = `${normalizeBuilding(
      building,
    )}${normalizeUnit(unit)}`;
    const unitType =
      unitRow.unitType === '미지정' ? '' : unitRow.unitType || '';

    row.values = [
      combinedUnit,
      hasQuantity ? Number(quantity) : null,
      null,
      null,
      unitName || '-',
    ];
    row.getCell(3).value = {
      formula: `IF(A${rowNumber}="","",IFERROR(INDEX('${REFERENCE_SHEET_NAME}'!$B$2:$B$${referenceLastRow},MATCH(A${rowNumber}&"",'${REFERENCE_SHEET_NAME}'!$A$2:$A$${referenceLastRow},0)),"동호수 확인"))`,
      result: unitType,
    };
    if (confirmationRound > 0) {
      row.getCell(4).value = `${confirmationRound}차 확정`;
    } else if (singleConfirmationRound > 0) {
      row.getCell(4).value = {
        formula: `IF(B${rowNumber}="","","${singleConfirmationRound}차 확정")`,
        result: hasQuantity
          ? `${singleConfirmationRound}차 확정`
          : '',
      };
    }

    row.height = 21;
    for (let columnNumber = 1; columnNumber <= 5; columnNumber += 1) {
      const cell = row.getCell(columnNumber);
      cell.font = { name: '맑은 고딕', size: 9 };
      cell.alignment = {
        horizontal: columnNumber === 2 ? 'right' : 'center',
        vertical: 'middle',
      };
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
        right: { style: 'hair', color: { argb: 'FFE2E8F0' } },
      };
      if (columnNumber === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFEFF6FF' },
        };
      }
      if (columnNumber === 2 || columnNumber === 4) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF7CC' },
        };
      }
      if (columnNumber === 3) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
      }
    }
    row.getCell(1).numFmt = '@';
    row.getCell(2).numFmt = '#,##0.####';
  });

  const lastRow = Math.max(
    HEADER_ROW_NUMBER,
    DATA_START_ROW_NUMBER + (units || []).length - 1,
  );
  worksheet.autoFilter = {
    from: { row: HEADER_ROW_NUMBER, column: 1 },
    to: { row: lastRow, column: 5 },
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
      worksheet.getCell(rowNumber, 4).dataValidation = {
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
  defaultConfirmationRound = 0,
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
      '동호수①(또는 동호수)와 물량②(또는 물량) 머리글을 찾지 못했습니다.',
    );
  }

  const { worksheet, rowNumber: headerRowNumber, fields } = header;
  const dataRowCount = (worksheet.rowCount || 0) - headerRowNumber;
  if (dataRowCount > MAX_IMPORT_ROWS) {
    throw new Error(
      `업로드 파일은 한 시트에 ${MAX_IMPORT_ROWS.toLocaleString()}행까지만 처리할 수 있습니다.`,
    );
  }

  const { byCombined, ambiguousCombined } = createUnitLookups(validUnits);
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
  let autoAssignedRoundRows = 0;
  const normalizedDefaultRound = Number(defaultConfirmationRound) || 0;

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
    const combinedValue = fields.combinedUnit
      ? getCellText(row.getCell(fields.combinedUnit))
      : '';

    const normalizedCombinedValue =
      normalizeCombinedUnit(combinedValue);
    identifier = combinedValue;

    if (
      normalizedCombinedValue &&
      ambiguousCombined.has(normalizedCombinedValue)
    ) {
      invalidRows.push({
        rowNumber,
        message: `${combinedValue} 동호수는 여러 세대와 겹쳐 자동으로 구분할 수 없습니다.`,
      });
      continue;
    }

    if (normalizedCombinedValue) {
      matchedUnit = byCombined.get(normalizedCombinedValue) || null;
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

    const shouldAutoAssignRound =
      quantityResult.provided &&
      !roundResult.provided &&
      normalizedDefaultRound > 0 &&
      allowedRoundSet.has(normalizedDefaultRound);
    const effectiveRoundResult = shouldAutoAssignRound
      ? { provided: true, value: normalizedDefaultRound }
      : roundResult;

    if (
      effectiveRoundResult.provided &&
      effectiveRoundResult.value > 0 &&
      !allowedRoundSet.has(effectiveRoundResult.value)
    ) {
      invalidRows.push({
        rowNumber,
        message: `${effectiveRoundResult.value}차 확정단가가 현재 공정에 등록되어 있지 않습니다.`,
      });
      continue;
    }

    seenCellKeys.add(matchedUnit.cellKey);
    if (quantityResult.provided) quantityRows += 1;
    if (effectiveRoundResult.provided) roundRows += 1;
    if (shouldAutoAssignRound) autoAssignedRoundRows += 1;
    updates.push({
      cellKey: matchedUnit.cellKey,
      building: matchedUnit.building,
      unit: matchedUnit.unit,
      quantity: quantityResult.provided
        ? quantityResult.value
        : undefined,
      confirmationRound: effectiveRoundResult.provided
        ? effectiveRoundResult.value
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
    autoAssignedRoundRows,
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
