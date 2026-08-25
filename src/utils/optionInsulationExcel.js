// v52.48.5.44.13 옵션현황(단열) 골구도 엑셀 다운로드·업로드
import ExcelJS from 'exceljs';
import {
  buildFloorVisualCells,
  getCellKey,
  getUnitType,
} from './buildingUnits.js';

const TEMPLATE_VERSION = '1';
const CATEGORY = 'insulation';
const GUIDE_SHEET_NAME = '작성안내';
const META_SHEET_NAME = '_옵션시스템정보';
const META_START_ROW = 7;
const MAX_META_ROWS = 20000;

const OPTION_COLORS = [
  '#dbeafe',
  '#dcfce7',
  '#fef3c7',
  '#fce7f3',
  '#ede9fe',
  '#cffafe',
  '#ffedd5',
  '#e2e8f0',
  '#fee2e2',
  '#ccfbf1',
];

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

const toSafeFilenamePart = (value) =>
  normalizeText(value)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_') || '현장';

const toSheetName = (value, usedNames) => {
  const base =
    normalizeText(value).replace(/[\\/*?:[\]]/g, '_').slice(0, 27) ||
    '동별 골구도';
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    const suffixText = `_${suffix}`;
    name = `${base.slice(0, 31 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  usedNames.add(name);
  return name;
};

const toArgb = (color) => {
  const normalized = normalizeText(color).replace('#', '').toUpperCase();
  return /^[0-9A-F]{6}$/.test(normalized)
    ? `FF${normalized}`
    : 'FFFFFFFF';
};

const toHexColor = (cell) => {
  const fill = cell?.fill;
  if (!fill || fill.type !== 'pattern' || fill.pattern !== 'solid') {
    return '';
  }

  const raw = normalizeText(fill?.fgColor?.argb || fill?.fgColor?.rgb)
    .replace('#', '')
    .toUpperCase();
  const rgb = raw.length === 8 ? raw.slice(2) : raw;

  if (!/^[0-9A-F]{6}$/.test(rgb)) return '';
  if (['FFFFFF', 'F8FAFC', 'F1F5F9', 'E2E8F0'].includes(rgb)) return '';
  return `#${rgb}`;
};

const colorForValue = (value) => {
  const text = normalizeText(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return OPTION_COLORS[hash % OPTION_COLORS.length];
};

const getReadableTextColor = (backgroundColor) => {
  const hex = normalizeText(backgroundColor).replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return '#0f172a';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160
    ? '#0f172a'
    : '#ffffff';
};

const applyBorder = (cell, color = 'FFCBD5E1') => {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
};

const applyCenteredFont = (cell, options = {}) => {
  cell.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };
  cell.font = {
    name: '맑은 고딕',
    size: options.size || 9,
    bold: options.bold === true,
    color: { argb: options.color || 'FF334155' },
  };
};

const createGuideSheet = (workbook, projectName, totalUnits) => {
  const sheet = workbook.addWorksheet(GUIDE_SHEET_NAME, {
    views: [{ showGridLines: false }],
  });
  sheet.columns = [{ width: 4 }, { width: 22 }, { width: 82 }];

  sheet.mergeCells('B2:C2');
  sheet.getCell('B2').value = '옵션현황(단열) 골구도 작성 양식';
  sheet.getCell('B2').font = {
    name: '맑은 고딕',
    size: 16,
    bold: true,
    color: { argb: 'FF0F172A' },
  };
  sheet.getCell('B2').alignment = { vertical: 'middle' };
  sheet.getRow(2).height = 30;

  const guideRows = [
    ['현장', projectName || '현장명 미등록'],
    ['전체 세대', `${Number(totalUnits || 0).toLocaleString('ko-KR')}세대`],
    [
      '작성 방법',
      '각 동 시트의 세대 셀에 표시된 호수를 지우고 해당 세대의 단열 옵션명을 입력합니다.',
    ],
    [
      '색상',
      '옵션별 셀 채우기 색상을 지정하면 업로드 시 함께 반영됩니다. 색상이 없으면 시스템이 옵션명별 색상을 자동 지정합니다.',
    ],
    [
      '미적용 세대',
      '옵션이 없는 세대는 기존 호수 표시를 그대로 두거나 빈칸으로 만듭니다.',
    ],
    [
      '주의',
      '동 시트명, 행·열 위치, 숨김 시트는 변경하지 마세요. 골구도 셀 위치를 기준으로 세대를 판정합니다.',
    ],
  ];

  guideRows.forEach(([label, value], index) => {
    const rowNumber = index + 5;
    sheet.getCell(rowNumber, 2).value = label;
    sheet.getCell(rowNumber, 3).value = value;
    sheet.getCell(rowNumber, 2).font = {
      name: '맑은 고딕',
      size: 10,
      bold: true,
      color: { argb: 'FF1E3A8A' },
    };
    sheet.getCell(rowNumber, 3).font = {
      name: '맑은 고딕',
      size: 10,
      color: { argb: 'FF334155' },
    };
    sheet.getCell(rowNumber, 2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFDBEAFE' },
    };
    sheet.getCell(rowNumber, 2).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    sheet.getCell(rowNumber, 3).alignment = {
      vertical: 'middle',
      wrapText: true,
    };
    applyBorder(sheet.getCell(rowNumber, 2));
    applyBorder(sheet.getCell(rowNumber, 3));
    sheet.getRow(rowNumber).height = index >= 2 ? 34 : 24;
  });

  sheet.getCell('B13').value = '※ 작성 완료 후 이 파일을 옵션현황(단열) 화면의 엑셀 업로드 버튼으로 불러오세요.';
  sheet.mergeCells('B13:C13');
  sheet.getCell('B13').font = {
    name: '맑은 고딕',
    size: 10,
    bold: true,
    color: { argb: 'FFB45309' },
  };
  sheet.getCell('B13').alignment = { wrapText: true };
};

const createMetaSheet = (workbook, projectName) => {
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
  sheet.getRow(6).values = [
    'sheet_name',
    'cell_address',
    'building',
    'unit',
    'unit_type',
    'placeholder',
  ];
  return sheet;
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

export const saveInsulationOptionWorkbook = async ({
  projectName,
  buildingConfigs = {},
  optionData = {},
}) => {
  const entries = Object.entries(buildingConfigs || {}).sort(
    ([first], [second]) =>
      first.localeCompare(second, 'ko-KR', { numeric: true }),
  );
  if (entries.length === 0) {
    throw new Error('엑셀로 내려받을 현장 골구도 정보가 없습니다.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '공사관리 시스템';
  workbook.created = new Date();
  workbook.modified = new Date();

  let totalUnits = 0;
  entries.forEach(([, config]) => {
    const floors = Math.max(0, Number(config?.floors) || 0);
    for (let floor = 1; floor <= floors; floor += 1) {
      buildFloorVisualCells(config, floor).forEach((cell) => {
        if (cell.type === 'valid') totalUnits += 1;
      });
    }
  });

  createGuideSheet(workbook, projectName, totalUnits);
  const metaSheet = createMetaSheet(workbook, projectName);
  const usedNames = new Set([GUIDE_SHEET_NAME, META_SHEET_NAME]);
  let metaRowNumber = META_START_ROW;

  entries.forEach(([buildingName, config]) => {
    const sheetName = toSheetName(buildingName, usedNames);
    const floors = Math.max(0, Number(config?.floors) || 0);
    const unitsPerFloor = Math.max(0, Number(config?.unitsPerFloor) || 0);
    const lastColumn = Math.max(2, unitsPerFloor + 1);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [
        {
          state: 'frozen',
          xSplit: 1,
          ySplit: 4,
          showGridLines: false,
        },
      ],
      pageSetup: {
        orientation: 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 1,
        margins: {
          left: 0.25,
          right: 0.25,
          top: 0.35,
          bottom: 0.35,
          header: 0.15,
          footer: 0.15,
        },
      },
    });

    sheet.getColumn(1).width = 7;
    for (let column = 2; column <= lastColumn; column += 1) {
      sheet.getColumn(column).width = 12;
    }

    sheet.mergeCells(1, 1, 1, lastColumn);
    sheet.getCell(1, 1).value = `${projectName || '현장명 미등록'} · ${buildingName} 단열 옵션 골구도`;
    sheet.getCell(1, 1).font = {
      name: '맑은 고딕',
      size: 14,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    sheet.getCell(1, 1).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    sheet.getRow(1).height = 28;

    sheet.mergeCells(2, 1, 2, lastColumn);
    sheet.getCell(2, 1).value =
      '세대 셀의 호수 표기를 단열 옵션명으로 덮어쓰세요. 셀 색상도 함께 업로드됩니다.';
    sheet.getCell(2, 1).font = {
      name: '맑은 고딕',
      size: 9,
      color: { argb: 'FF0369A1' },
    };
    sheet.getCell(2, 1).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    sheet.getRow(2).height = 22;

    sheet.getCell(4, 1).value = '층';
    applyCenteredFont(sheet.getCell(4, 1), { bold: true, color: 'FFFFFFFF' });
    sheet.getCell(4, 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' },
    };
    applyBorder(sheet.getCell(4, 1), 'FF64748B');

    for (let visualUnit = 1; visualUnit <= unitsPerFloor; visualUnit += 1) {
      const cell = sheet.getCell(4, visualUnit + 1);
      cell.value = `${visualUnit}호 라인`;
      applyCenteredFont(cell, { bold: true, color: 'FFFFFFFF', size: 8 });
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' },
      };
      applyBorder(cell, 'FF64748B');
    }
    sheet.getRow(4).height = 23;

    Array.from({ length: floors }, (_, index) => floors - index).forEach(
      (floor, floorIndex) => {
        const rowNumber = 5 + floorIndex;
        const floorCell = sheet.getCell(rowNumber, 1);
        floorCell.value = `${floor}F`;
        applyCenteredFont(floorCell, { bold: true, size: 8 });
        floorCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF1F5F9' },
        };
        applyBorder(floorCell);
        sheet.getRow(rowNumber).height = 25;

        buildFloorVisualCells(config, floor).forEach((visualCell) => {
          const startColumn = visualCell.visualStart + 1;
          const endColumn = visualCell.visualEnd + 1;
          const address = sheet.getCell(rowNumber, startColumn).address;

          if (visualCell.span > 1) {
            sheet.mergeCells(rowNumber, startColumn, rowNumber, endColumn);
          }

          const cell = sheet.getCell(rowNumber, startColumn);
          applyCenteredFont(cell, { bold: true, size: 8 });

          if (visualCell.type === 'piloti') {
            cell.value = '×';
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE2E8F0' },
            };
            cell.font = {
              name: '맑은 고딕',
              size: 11,
              bold: true,
              color: { argb: 'FF94A3B8' },
            };
            applyBorder(cell);
            return;
          }

          if (visualCell.type === 'empty') {
            cell.value = '';
            return;
          }

          const cellKey = getCellKey(buildingName, visualCell.unitCode);
          const existing = optionData?.[cellKey] || {};
          const optionValue = normalizeText(existing?.value);
          const optionColor =
            normalizeText(existing?.color) ||
            (optionValue ? colorForValue(optionValue) : '');
          const unitType = getUnitType(config, floor, visualCell.visualStart);

          cell.value = optionValue || visualCell.unitCode;
          cell.note = `${buildingName} ${visualCell.unitCode}호${
            unitType ? ` · ${unitType}` : ''
          }\n호수 표기를 지우고 단열 옵션명을 입력하세요.`;
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: toArgb(optionColor || '#ffffff') },
          };
          cell.font = {
            name: '맑은 고딕',
            size: 8,
            bold: true,
            color: {
              argb: toArgb(
                optionValue
                  ? getReadableTextColor(optionColor || '#ffffff')
                  : '#334155',
              ),
            },
          };
          applyBorder(cell, optionValue ? 'FF64748B' : 'FFCBD5E1');

          metaSheet.getRow(metaRowNumber).values = [
            sheetName,
            address,
            buildingName,
            visualCell.unitCode,
            unitType,
            visualCell.unitCode,
          ];
          metaRowNumber += 1;
        });
      },
    );

    const typeRowNumber = 5 + floors + 1;
    const typeLabelCell = sheet.getCell(typeRowNumber, 1);
    typeLabelCell.value = '타입';
    applyCenteredFont(typeLabelCell, { bold: true, color: 'FF475569', size: 8 });

    for (let visualUnit = 1; visualUnit <= unitsPerFloor; visualUnit += 1) {
      const cell = sheet.getCell(typeRowNumber, visualUnit + 1);
      const baseType =
        config?.unitTypes?.[visualUnit] ??
        config?.unitTypes?.[String(visualUnit)] ??
        '';
      cell.value = normalizeText(baseType);
      applyCenteredFont(cell, { bold: true, color: 'FF475569', size: 8 });
      if (baseType) applyBorder(cell);
    }
    sheet.getRow(typeRowNumber).height = 20;
    sheet.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: 4, column: lastColumn },
    };
  });

  await downloadWorkbook(
    workbook,
    `옵션현황_단열_${toSafeFilenamePart(projectName)}.xlsx`,
  );
  return totalUnits;
};

const readMetaValue = (sheet, key) => {
  for (let rowNumber = 1; rowNumber <= 5; rowNumber += 1) {
    if (normalizeText(toPlainCellValue(sheet.getCell(rowNumber, 1).value)) === key) {
      return normalizeText(toPlainCellValue(sheet.getCell(rowNumber, 2).value));
    }
  }
  return '';
};

export const parseInsulationOptionWorkbookFile = async ({
  file,
  projectName,
  buildingConfigs = {},
}) => {
  if (!file) throw new Error('Excel 파일을 선택해주세요.');
  if (!/\.xlsx$/i.test(file.name || '')) {
    throw new Error('다운로드한 .xlsx 형식의 골구도 파일을 선택해주세요.');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const metaSheet = workbook.getWorksheet(META_SHEET_NAME);
  if (!metaSheet) {
    throw new Error('시스템 정보가 없는 파일입니다. 화면에서 내려받은 골구도 양식을 사용해주세요.');
  }

  if (readMetaValue(metaSheet, 'template_version') !== TEMPLATE_VERSION) {
    throw new Error('지원하지 않는 단열 옵션 골구도 양식 버전입니다. 새 양식을 내려받아 작성해주세요.');
  }
  if (readMetaValue(metaSheet, 'category') !== CATEGORY) {
    throw new Error('옵션현황(단열)용 엑셀 파일이 아닙니다.');
  }
  const sourceProjectName = readMetaValue(metaSheet, 'project_name');
  if (sourceProjectName !== normalizeText(projectName)) {
    throw new Error(`현재 현장(${projectName})과 엑셀 현장(${sourceProjectName || '미등록'})이 다릅니다.`);
  }

  const validCellKeys = new Set();
  Object.entries(buildingConfigs || {}).forEach(([buildingName, config]) => {
    const floors = Math.max(0, Number(config?.floors) || 0);
    for (let floor = 1; floor <= floors; floor += 1) {
      buildFloorVisualCells(config, floor).forEach((cell) => {
        if (cell.type === 'valid') {
          validCellKeys.add(getCellKey(buildingName, cell.unitCode));
        }
      });
    }
  });

  const unitValues = {};
  const seenKeys = new Set();
  const missingCells = [];
  const invalidRows = [];
  let mappedRows = 0;
  let unchangedRows = 0;

  const maximumRow = Math.min(metaSheet.rowCount || 0, MAX_META_ROWS);
  for (let rowNumber = META_START_ROW; rowNumber <= maximumRow; rowNumber += 1) {
    const row = metaSheet.getRow(rowNumber);
    const sheetName = normalizeText(toPlainCellValue(row.getCell(1).value));
    const address = normalizeText(toPlainCellValue(row.getCell(2).value));
    const building = normalizeText(toPlainCellValue(row.getCell(3).value));
    const unit = normalizeText(toPlainCellValue(row.getCell(4).value));
    const placeholder = normalizeText(toPlainCellValue(row.getCell(6).value));
    if (!sheetName && !address && !building && !unit) continue;

    const cellKey = getCellKey(building, unit);
    if (!validCellKeys.has(cellKey)) {
      invalidRows.push({ rowNumber, cellKey, message: '현재 골구도에 없는 세대입니다.' });
      continue;
    }
    if (seenKeys.has(cellKey)) {
      invalidRows.push({ rowNumber, cellKey, message: '숨김 세대정보가 중복되었습니다.' });
      continue;
    }
    seenKeys.add(cellKey);

    const sheet = workbook.getWorksheet(sheetName);
    const cell = sheet?.getCell(address);
    if (!sheet || !cell) {
      missingCells.push({ rowNumber, cellKey, sheetName, address });
      continue;
    }

    mappedRows += 1;
    const visibleValue = normalizeText(toPlainCellValue(cell.value));
    if (!visibleValue || visibleValue === placeholder || visibleValue === unit) {
      unchangedRows += 1;
      continue;
    }
    if (visibleValue.length > 80) {
      invalidRows.push({ rowNumber, cellKey, message: '옵션명은 80자 이내로 입력해주세요.' });
      continue;
    }

    const importedColor = toHexColor(cell) || colorForValue(visibleValue);
    unitValues[cellKey] = {
      value: visibleValue,
      color: importedColor,
    };
  }

  if (mappedRows === 0) {
    throw new Error('불러올 세대 셀이 없습니다. 골구도 시트 구조가 변경되었는지 확인해주세요.');
  }
  if (missingCells.length > 0 || invalidRows.length > 0) {
    const firstIssue = missingCells[0]
      ? `${missingCells[0].sheetName}!${missingCells[0].address} 셀을 찾을 수 없습니다.`
      : `${invalidRows[0].cellKey}: ${invalidRows[0].message}`;
    throw new Error(`골구도 구조가 변경되어 불러올 수 없습니다. ${firstIssue}`);
  }

  return {
    sourceSheetCount: workbook.worksheets.filter(
      (sheet) => ![GUIDE_SHEET_NAME, META_SHEET_NAME].includes(sheet.name),
    ).length,
    totalRows: mappedRows,
    filledRows: Object.keys(unitValues).length,
    blankRows: unchangedRows,
    unitValues,
  };
};

export const getInsulationOptionColor = (value) => colorForValue(value);

