// v52.48.5.44.106 업무자료실 연동 다운로드 파일명 지정 지원
// v52.48.5.44.20 선택옵션 30개(D:AG) 확장 및 AH 세대키 이동
// v52.48.5.44.19 선택옵션 옵션명 검정색·셀에맞춤·열너비 12 및 전체 선택셀 가운데정렬
// v52.48.5.44.18 선택옵션 동·호·타입 3열 및 담당자 수정값 누적
// v52.48.5.44.17 유상옵션 양식 골구도 자동작성·선택값 업로드
import ExcelJS from 'exceljs';
import {
  buildFloorVisualCells,
  getCellKey,
  getUnitType,
} from './buildingUnits.js';

const TEMPLATE_VERSION = '3';
const CATEGORY = 'selection';
const DATA_SHEET_NAME = '유상옵션';
const META_SHEET_NAME = '_옵션시스템정보';
const OPTION_HEADER_ROW = 5;
const DATA_START_ROW = 6;
const FIRST_OPTION_COLUMN = 4;
const TEMPLATE_LAST_OPTION_COLUMN = 21;
const LAST_OPTION_COLUMN = 33;
const IDENTITY_COLUMN = 34;
const MAX_OPTION_COUNT = LAST_OPTION_COLUMN - FIRST_OPTION_COLUMN + 1;
const MAX_IMPORT_ROWS = 5000;
const TEMPLATE_PATH = 'templates/selection_option_template.xlsx';

const normalizeText = (value) => String(value ?? '').trim();

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

const getCellText = (cell) => normalizeText(toPlainCellValue(cell?.value));

const normalizeBuilding = (value) => {
  const text = normalizeText(value)
    .replace(/\s+/g, '')
    .replace(/동$/u, '')
    .replace(/\.0+$/, '');
  return /^\d+$/.test(text) ? String(Number(text)) : text.toLowerCase();
};

const toSafeFilenamePart = (value) =>
  normalizeText(value)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_') || '현장';

const naturalCompare = (first, second) =>
  String(first).localeCompare(String(second), 'ko-KR', { numeric: true });

const cloneCellStyle = (style) => JSON.parse(JSON.stringify(style || {}));

export const createSelectionOptionUnitRows = (buildingConfigs = {}) => {
  const rows = [];
  const seenCellKeys = new Set();

  Object.entries(buildingConfigs || {})
    .sort(([first], [second]) => naturalCompare(first, second))
    .forEach(([building, config]) => {
      const floors = Math.max(0, Number(config?.floors) || 0);

      for (let floor = 1; floor <= floors; floor += 1) {
        buildFloorVisualCells(config, floor).forEach((cell) => {
          if (cell.type !== 'valid') return;
          const cellKey = getCellKey(building, cell.unitCode);
          if (seenCellKeys.has(cellKey)) return;
          seenCellKeys.add(cellKey);

          const unitType =
            normalizeText(getUnitType(config, floor, cell.visualStart)) ||
            '미지정';
          rows.push({
            cellKey,
            building,
            floor,
            unit: cell.unitCode,
            combinedUnit: `${normalizeBuilding(building)}${cell.unitCode}`,
            unitType,
          });
        });
      }
    });

  return rows.sort(
    (first, second) =>
      naturalCompare(first.building, second.building) ||
      Number(first.unit) - Number(second.unit),
  );
};

export const normalizeSelectionOptionDocument = (value) => {
  const rawOptionNames = Array.isArray(value?.optionNames)
    ? value.optionNames
    : [];
  const optionNames = [];
  const optionNameKeys = new Set();

  rawOptionNames.forEach((optionName) => {
    const normalized = normalizeText(optionName);
    const key = normalized.toLocaleLowerCase('ko-KR');
    if (!normalized || optionNameKeys.has(key) || optionNames.length >= MAX_OPTION_COUNT) {
      return;
    }
    optionNameKeys.add(key);
    optionNames.push(normalized);
  });

  const units = {};
  const unitInfo = {};
  const rawUnits =
    value?.units && typeof value.units === 'object' && !Array.isArray(value.units)
      ? value.units
      : {};

  Object.entries(rawUnits).forEach(([cellKey, row]) => {
    const selectedOptions = Array.isArray(row?.selectedOptions)
      ? row.selectedOptions
          .map((optionName) => normalizeText(optionName))
          .filter((optionName) => optionNames.includes(optionName))
      : [];
    const uniqueOptions = [...new Set(selectedOptions)];
    if (uniqueOptions.length > 0) {
      units[cellKey] = { selectedOptions: uniqueOptions };
    }
  });

  const rawUnitInfo =
    value?.unitInfo &&
    typeof value.unitInfo === 'object' &&
    !Array.isArray(value.unitInfo)
      ? value.unitInfo
      : {};
  Object.entries(rawUnitInfo).forEach(([cellKey, row]) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    unitInfo[cellKey] = {
      building: normalizeText(row.building),
      unit: normalizeText(row.unit),
      unitType: normalizeText(row.unitType),
    };
  });

  return {
    version: 3,
    optionNames,
    unitInfo,
    units,
  };
};

const createMetaSheet = (workbook, projectName, unitRows) => {
  const existing = workbook.getWorksheet(META_SHEET_NAME);
  if (existing) workbook.removeWorksheet(existing.id);

  const sheet = workbook.addWorksheet(META_SHEET_NAME);
  sheet.state = 'veryHidden';
  sheet.getCell('A1').value = 'template_version';
  sheet.getCell('B1').value = TEMPLATE_VERSION;
  sheet.getCell('A2').value = 'category';
  sheet.getCell('B2').value = CATEGORY;
  sheet.getCell('A3').value = 'project_name';
  sheet.getCell('B3').value = projectName || '';
  sheet.getCell('A4').value = 'generated_at';
  sheet.getCell('B4').value = new Date().toISOString();
  sheet.getCell('A5').value = 'unit_count';
  sheet.getCell('B5').value = unitRows.length;
  sheet.getRow(7).values = [
    'row_number',
    'cell_key',
    'building',
    'floor',
    'unit',
    'combined_unit',
    'unit_type',
  ];

  unitRows.forEach((row, index) => {
    sheet.getRow(index + 8).values = [
      DATA_START_ROW + index,
      row.cellKey,
      row.building,
      row.floor,
      row.unit,
      row.combinedUnit,
      row.unitType,
    ];
  });
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

const getTemplateUrl = () => {
  const baseUrl = String(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return `${baseUrl}${TEMPLATE_PATH}`;
};

export const createSelectionOptionWorkbook = async ({
  templateBuffer,
  projectName,
  buildingConfigs = {},
  selectionDocument = {},
}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  const worksheet = workbook.getWorksheet(DATA_SHEET_NAME);
  if (!worksheet) {
    throw new Error(`양식에서 ${DATA_SHEET_NAME} 시트를 찾을 수 없습니다.`);
  }

  const unitRows = createSelectionOptionUnitRows(buildingConfigs);
  if (unitRows.length === 0) {
    throw new Error('양식에 입력할 현장 골구도 세대정보가 없습니다.');
  }

  const normalizedDocument = normalizeSelectionOptionDocument(selectionDocument);
  const optionNames = normalizedDocument.optionNames.slice(0, MAX_OPTION_COUNT);
  const lastDataRow = DATA_START_ROW + unitRows.length - 1;
  const clearLastRow = Math.min(
    MAX_IMPORT_ROWS,
    Math.max(worksheet.rowCount || 0, lastDataRow),
  );

  worksheet.unMergeCells('A1:U1');
  worksheet.unMergeCells('A2:U2');
  worksheet.unMergeCells('A3:U3');
  worksheet.mergeCells('A1:AG1');
  worksheet.mergeCells('A2:AG2');
  worksheet.mergeCells('A3:AG3');
  worksheet.getCell('A1').value = `${projectName || '현장명 미등록'} / 유상 옵션 List`;
  worksheet.getCell('A3').value =
    '※ D5:AG5에 유상옵션명을 입력하고, 해당 옵션 선택 시 "선택" / 미선택 시 빈칸으로 두세요. 세대 행은 삭제·추가·순서변경하지 마세요.';
  worksheet.views = [
    {
      state: 'frozen',
      xSplit: 3,
      ySplit: 5,
      showGridLines: false,
    },
  ];

  const optionGroupStyle = cloneCellStyle(
    worksheet.getCell(OPTION_HEADER_ROW - 1, TEMPLATE_LAST_OPTION_COLUMN).style,
  );
  const optionHeaderStyle = cloneCellStyle(
    worksheet.getCell(OPTION_HEADER_ROW, TEMPLATE_LAST_OPTION_COLUMN).style,
  );
  const optionDataStyle = cloneCellStyle(
    worksheet.getCell(DATA_START_ROW, TEMPLATE_LAST_OPTION_COLUMN).style,
  );
  for (let column = FIRST_OPTION_COLUMN; column <= LAST_OPTION_COLUMN; column += 1) {
    const optionIndex = column - FIRST_OPTION_COLUMN;
    const optionGroupCell = worksheet.getCell(OPTION_HEADER_ROW - 1, column);
    if (column > TEMPLATE_LAST_OPTION_COLUMN) {
      optionGroupCell.style = cloneCellStyle(optionGroupStyle);
    }
    optionGroupCell.value = `옵션(${optionIndex + 1})`;

    const optionHeaderCell = worksheet.getCell(OPTION_HEADER_ROW, column);
    if (column > TEMPLATE_LAST_OPTION_COLUMN) {
      optionHeaderCell.style = cloneCellStyle(optionHeaderStyle);
    }
    optionHeaderCell.value = optionNames[optionIndex] || null;
    optionHeaderCell.font = {
      ...optionHeaderCell.font,
      color: { argb: 'FF000000' },
    };
    optionHeaderCell.alignment = {
      ...optionHeaderCell.alignment,
      horizontal: 'center',
      vertical: 'middle',
      wrapText: false,
      shrinkToFit: true,
    };
    worksheet.getColumn(column).width = 12;
  }

  for (
    let column = TEMPLATE_LAST_OPTION_COLUMN + 1;
    column <= LAST_OPTION_COLUMN;
    column += 1
  ) {
    worksheet.getCell(DATA_START_ROW, column).style = cloneCellStyle(optionDataStyle);
  }

  for (let rowNumber = DATA_START_ROW; rowNumber <= clearLastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    for (let column = 1; column <= IDENTITY_COLUMN; column += 1) {
      row.getCell(column).value = null;
    }
  }

  const baseStyleRow = worksheet.getRow(DATA_START_ROW);
  unitRows.forEach((unitRow, index) => {
    const rowNumber = DATA_START_ROW + index;
    const row = worksheet.getRow(rowNumber);

    if (rowNumber > 1000) {
      row.height = baseStyleRow.height;
      for (let column = 1; column <= IDENTITY_COLUMN; column += 1) {
        row.getCell(column).style = baseStyleRow.getCell(column).style;
      }
    }

    const savedUnitInfo = normalizedDocument.unitInfo?.[unitRow.cellKey];
    row.getCell(1).value = savedUnitInfo
      ? savedUnitInfo.building
      : unitRow.building;
    row.getCell(2).value = savedUnitInfo ? savedUnitInfo.unit : unitRow.unit;
    row.getCell(3).value = savedUnitInfo
      ? savedUnitInfo.unitType
      : unitRow.unitType;
    row.getCell(1).numFmt = '@';
    row.getCell(2).numFmt = '@';
    row.getCell(3).numFmt = '@';
    row.getCell(IDENTITY_COLUMN).value = unitRow.cellKey;
    row.getCell(IDENTITY_COLUMN).numFmt = '@';

    const selectedOptionSet = new Set(
      normalizedDocument.units?.[unitRow.cellKey]?.selectedOptions || [],
    );
    for (let column = FIRST_OPTION_COLUMN; column <= LAST_OPTION_COLUMN; column += 1) {
      const optionName = optionNames[column - FIRST_OPTION_COLUMN];
      const cell = row.getCell(column);
      if (column > TEMPLATE_LAST_OPTION_COLUMN) {
        cell.style = cloneCellStyle(optionDataStyle);
      }
      cell.value = optionName && selectedOptionSet.has(optionName) ? '선택' : null;
      cell.alignment = {
        ...cell.alignment,
        horizontal: 'center',
        vertical: 'middle',
      };
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"선택"'],
        showErrorMessage: true,
        errorTitle: '입력값 확인',
        error: '선택한 옵션은 "선택", 미선택 옵션은 빈칸으로 두세요.',
      };
    }
  });

  worksheet.getCell(OPTION_HEADER_ROW, IDENTITY_COLUMN).value = '_세대키';
  worksheet.getColumn(IDENTITY_COLUMN).hidden = true;
  worksheet.autoFilter = {
    from: { row: OPTION_HEADER_ROW, column: 1 },
    to: { row: lastDataRow, column: IDENTITY_COLUMN },
  };
  createMetaSheet(workbook, projectName, unitRows);
  workbook.creator = '현장관리 시스템';
  workbook.modified = new Date();

  return { workbook, rowCount: unitRows.length };
};

export const saveSelectionOptionWorkbook = async ({
  projectName,
  buildingConfigs = {},
  selectionDocument = {},
  downloadFileName = '',
}) => {
  const response = await fetch(getTemplateUrl());
  if (!response.ok) {
    throw new Error(`선택옵션 양식을 불러오지 못했습니다. (${response.status})`);
  }

  const { workbook, rowCount } = await createSelectionOptionWorkbook({
    templateBuffer: await response.arrayBuffer(),
    projectName,
    buildingConfigs,
    selectionDocument,
  });
  await downloadWorkbook(
    workbook,
    String(downloadFileName || '').trim()
      || `옵션현황_선택_${toSafeFilenamePart(projectName)}.xlsx`,
  );
  return rowCount;
};

const readMetaValue = (sheet, key) => {
  for (let rowNumber = 1; rowNumber <= 5; rowNumber += 1) {
    if (getCellText(sheet.getCell(rowNumber, 1)) === key) {
      return getCellText(sheet.getCell(rowNumber, 2));
    }
  }
  return '';
};

export const parseSelectionOptionWorkbookFile = async ({
  file,
  projectName,
  buildingConfigs = {},
}) => {
  if (!file) throw new Error('Excel 파일을 선택해주세요.');
  if (!/\.xlsx$/i.test(file.name || '')) {
    throw new Error('다운로드한 .xlsx 형식의 선택옵션 양식을 사용해주세요.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.getWorksheet(DATA_SHEET_NAME);
  const metaSheet = workbook.getWorksheet(META_SHEET_NAME);
  if (!worksheet || !metaSheet) {
    throw new Error('시스템 정보가 없는 파일입니다. 화면에서 양식을 다시 내려받아주세요.');
  }
  if (readMetaValue(metaSheet, 'template_version') !== TEMPLATE_VERSION) {
    throw new Error('지원하지 않는 선택옵션 양식 버전입니다. 새 양식을 내려받아주세요.');
  }
  if (readMetaValue(metaSheet, 'category') !== CATEGORY) {
    throw new Error('옵션현황(선택)용 Excel 파일이 아닙니다.');
  }
  const sourceProjectName = readMetaValue(metaSheet, 'project_name');
  if (sourceProjectName !== normalizeText(projectName)) {
    throw new Error(
      `현재 현장(${projectName})과 Excel 현장(${sourceProjectName || '미등록'})이 다릅니다.`,
    );
  }

  const unitRows = createSelectionOptionUnitRows(buildingConfigs);
  const unitsByCellKey = new Map(unitRows.map((row) => [row.cellKey, row]));
  const optionDefinitions = [];
  const optionNameKeys = new Set();
  for (let column = FIRST_OPTION_COLUMN; column <= LAST_OPTION_COLUMN; column += 1) {
    const optionName = getCellText(worksheet.getCell(OPTION_HEADER_ROW, column));
    if (!optionName) continue;
    if (optionName.length > 80) {
      throw new Error(`${worksheet.getCell(OPTION_HEADER_ROW, column).address} 옵션명은 80자 이내로 입력해주세요.`);
    }
    const optionNameKey = optionName.toLocaleLowerCase('ko-KR');
    if (optionNameKeys.has(optionNameKey)) {
      throw new Error(`옵션명 "${optionName}"이 중복되었습니다.`);
    }
    optionNameKeys.add(optionNameKey);
    optionDefinitions.push({ column, optionName });
  }
  if (optionDefinitions.length === 0) {
    throw new Error('D5:AG5에 유상옵션명을 한 개 이상 입력해주세요.');
  }
  const optionNameByColumn = new Map(
    optionDefinitions.map(({ column, optionName }) => [column, optionName]),
  );

  const selectedUnits = {};
  const unitInfo = {};
  const seenCellKeys = new Set();
  const maximumRow = Math.min(
    MAX_IMPORT_ROWS,
    Math.max(worksheet.rowCount || 0, DATA_START_ROW + unitRows.length - 1),
  );
  let selectionCount = 0;

  for (let rowNumber = DATA_START_ROW; rowNumber <= maximumRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cellKey = getCellText(row.getCell(IDENTITY_COLUMN));
    const optionCellValues = [];
    for (let column = FIRST_OPTION_COLUMN; column <= LAST_OPTION_COLUMN; column += 1) {
      optionCellValues.push(getCellText(row.getCell(column)));
    }
    const hasVisibleValue =
      [1, 2, 3].some((column) => getCellText(row.getCell(column))) ||
      Boolean(cellKey) ||
      optionCellValues.some(Boolean);
    if (!hasVisibleValue) continue;
    if (!cellKey) {
      throw new Error(`${rowNumber}행의 세대 연결정보가 없습니다. 세대 행을 추가하거나 복사하지 마세요.`);
    }

    const unitRow = unitsByCellKey.get(cellKey);
    if (!unitRow) {
      throw new Error(`${rowNumber}행이 현재 골구도의 세대와 연결되지 않습니다.`);
    }
    if (seenCellKeys.has(cellKey)) {
      throw new Error(`${rowNumber}행의 세대 연결정보가 중복되었습니다.`);
    }
    seenCellKeys.add(cellKey);
    unitInfo[cellKey] = {
      building: getCellText(row.getCell(1)),
      unit: getCellText(row.getCell(2)),
      unitType: getCellText(row.getCell(3)),
    };

    const selectedOptions = [];
    for (let column = FIRST_OPTION_COLUMN; column <= LAST_OPTION_COLUMN; column += 1) {
      const cell = row.getCell(column);
      const selectedValue = getCellText(cell).replace(/\s+/g, '');
      if (!selectedValue) continue;
      const optionName = optionNameByColumn.get(column);
      if (!optionName) {
        throw new Error(`${cell.address} 위 D5:AG5 옵션명이 비어 있습니다.`);
      }
      if (selectedValue !== '선택') {
        throw new Error(`${cell.address}에는 "선택" 또는 빈칸만 입력할 수 있습니다.`);
      }
      selectedOptions.push(optionName);
      selectionCount += 1;
    }

    if (selectedOptions.length > 0) {
      selectedUnits[unitRow.cellKey] = { selectedOptions };
    }
  }

  if (seenCellKeys.size !== unitRows.length) {
    throw new Error(
      `골구도 ${unitRows.length.toLocaleString()}세대 중 ${seenCellKeys.size.toLocaleString()}세대만 확인되었습니다. 자동입력 행을 삭제하지 마세요.`,
    );
  }

  return {
    selectionDocument: {
      version: 3,
      optionNames: optionDefinitions.map(({ optionName }) => optionName),
      unitInfo,
      units: selectedUnits,
    },
    optionCount: optionDefinitions.length,
    unitCount: unitRows.length,
    selectedUnitCount: Object.keys(selectedUnits).length,
    selectionCount,
  };
};
