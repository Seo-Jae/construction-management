// v52.48.5.44.108 변경 골구도 양식 레이아웃·타입수량·하단안내
// v52.48.5.44.107 업무자료실용 빈 골구도·제목/시트명 지정 지원
// v52.48.5.44.106 업무자료실 연동 다운로드 파일명 지정 지원
// v52.48.5.44.15 단열 옵션 Excel 메모 제거·동 간격 1열(너비 5.42)
// v52.48.5.44.14 옵션현황(단열) 전체 동 단일시트·빈 세대셀·무색상 양식
// v52.48.5.44.13 옵션현황(단열) 골구도 엑셀 다운로드·업로드
import ExcelJS from 'exceljs';
import {
  buildFloorVisualCells,
  getCellKey,
  getUnitType,
} from './buildingUnits.js';

const TEMPLATE_VERSION = '2';
const CATEGORY = 'insulation';
const DATA_SHEET_NAME = '단열 옵션 골구도';
const META_SHEET_NAME = '_옵션시스템정보';
const META_START_ROW = 7;
const MAX_META_ROWS = 20000;
const TITLE_ROW = 1;
const GUIDE_ROW = 2;
const BUILDING_TITLE_ROW = 4;
const HEADER_ROW = 5;
const DATA_START_ROW = 6;
const BLOCK_GAP_COLUMNS = 1;
const BLOCK_GAP_COLUMN_WIDTH = 5.42;

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
    'reserved',
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

const saveBasicSkeletonWorkbook = async ({
  projectName,
  buildingConfigs = {},
  downloadFileName = '',
  worksheetName = '',
  titleText = '',
}) => {
  const resolvedWorksheetName = String(worksheetName || '').trim() || '골구도 양식';
  const resolvedTitleText = String(titleText || '').trim()
    || `${projectName || '현장명 미등록'} · 골구도`;
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

  const maxFloors = entries.reduce(
    (maximum, [, config]) =>
      Math.max(maximum, Math.max(0, Number(config?.floors) || 0)),
    0,
  );

  const blocks = [];
  let nextStartColumn = 1;
  let totalUnits = 0;
  const typeCounts = new Map();

  entries.forEach(([buildingName, config]) => {
    const unitsPerFloor = Math.max(0, Number(config?.unitsPerFloor) || 0);
    const startColumn = nextStartColumn;
    const endColumn = startColumn + unitsPerFloor;
    blocks.push({
      buildingName,
      config,
      startColumn,
      endColumn,
      unitsPerFloor,
    });
    nextStartColumn = endColumn + 1 + BLOCK_GAP_COLUMNS;

    const floors = Math.max(0, Number(config?.floors) || 0);
    for (let floor = 1; floor <= floors; floor += 1) {
      buildFloorVisualCells(config, floor).forEach((visualCell) => {
        if (visualCell.type !== 'valid') return;
        totalUnits += 1;
        const unitType = normalizeText(
          getUnitType(config, floor, visualCell.visualStart),
        ) || '미지정';
        typeCounts.set(unitType, Number(typeCounts.get(unitType) || 0) + 1);
      });
    }
  });

  const lastColumn = Math.max(1, blocks[blocks.length - 1]?.endColumn || 1);
  const BUILDING_TITLE_ROW = 3;
  const DATA_START_ROW = 6;
  const TYPE_ROW = DATA_START_ROW + maxFloors;
  const UNIT_HEADER_ROW = TYPE_ROW + 1;
  const BOTTOM_BUILDING_ROW = UNIT_HEADER_ROW + 2;
  const SUMMARY_START_COLUMN = lastColumn + 2;
  const OUTER_COLOR = 'FF000000';
  const INNER_COLOR = 'FFBFBFBF';

  const sheet = workbook.addWorksheet(resolvedWorksheetName, {
    views: [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: BUILDING_TITLE_ROW,
        showGridLines: false,
      },
    ],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.2,
        right: 0.2,
        top: 0.3,
        bottom: 0.3,
        header: 0.1,
        footer: 0.1,
      },
    },
  });
  const metaSheet = createMetaSheet(workbook, projectName);
  let metaRowNumber = META_START_ROW;

  const borderSide = (isOuter = false) => ({
    style: 'thin',
    color: { argb: isOuter ? OUTER_COLOR : INNER_COLOR },
  });

  const setGridBorder = (cell, {
    topOuter = false,
    bottomOuter = false,
    leftOuter = false,
    rightOuter = false,
    diagonal = false,
  } = {}) => {
    cell.border = {
      top: borderSide(topOuter),
      bottom: borderSide(bottomOuter),
      left: borderSide(leftOuter),
      right: borderSide(rightOuter),
      ...(diagonal ? {
        diagonal: {
          up: true,
          down: true,
          style: 'thin',
          color: { argb: INNER_COLOR },
        },
      } : {}),
    };
  };

  const styleBuildingTitle = (cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    applyCenteredFont(cell, {
      bold: true,
      color: 'FF0F172A',
      size: 11,
    });
    applyBorder(cell, 'FF94A3B8');
  };

  const styleFloorCell = (cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    applyCenteredFont(cell, { bold: true, size: 9 });
    applyBorder(cell, OUTER_COLOR);
  };

  blocks.slice(0, -1).forEach(({ endColumn }) => {
    sheet.getColumn(endColumn + 1).width = BLOCK_GAP_COLUMN_WIDTH;
  });

  blocks.forEach(({ startColumn, unitsPerFloor }) => {
    sheet.getColumn(startColumn).width = 6;
    for (let visualUnitNumber = 1; visualUnitNumber <= unitsPerFloor; visualUnitNumber += 1) {
      sheet.getColumn(startColumn + visualUnitNumber).width = 11;
    }
  });
  sheet.getColumn(SUMMARY_START_COLUMN).width = 11;
  sheet.getColumn(SUMMARY_START_COLUMN + 1).width = 11;

  sheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = resolvedTitleText;
  titleCell.font = {
    name: '맑은 고딕',
    size: 15,
    bold: true,
    color: { argb: 'FF0F172A' },
  };
  titleCell.alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  sheet.getRow(1).height = 30;
  sheet.getRow(5).height = 22;

  blocks.forEach(({
    buildingName,
    config,
    startColumn,
    endColumn,
    unitsPerFloor,
  }, blockIndex) => {
    const floors = Math.max(0, Number(config?.floors) || 0);
    const floorStartRow = DATA_START_ROW + (maxFloors - floors);

    sheet.mergeCells(BUILDING_TITLE_ROW, startColumn, BUILDING_TITLE_ROW, endColumn);
    const topBuildingCell = sheet.getCell(BUILDING_TITLE_ROW, startColumn);
    topBuildingCell.value = buildingName;
    styleBuildingTitle(topBuildingCell);

    if (blockIndex === 0) {
      for (let displayFloor = maxFloors; displayFloor >= 1; displayFloor -= 1) {
        const rowNumber = DATA_START_ROW + (maxFloors - displayFloor);
        const floorCell = sheet.getCell(rowNumber, startColumn);
        floorCell.value = `${displayFloor}F`;
        styleFloorCell(floorCell);
        sheet.getRow(rowNumber).height = 24;
      }
    }

    Array.from({ length: floors }, (_, index) => floors - index).forEach(
      (floor, floorIndex) => {
        const rowNumber = floorStartRow + floorIndex;
        if (blockIndex !== 0) {
          const floorCell = sheet.getCell(rowNumber, startColumn);
          floorCell.value = `${floor}F`;
          styleFloorCell(floorCell);
        }
        sheet.getRow(rowNumber).height = 24;

        buildFloorVisualCells(config, floor).forEach((visualCell) => {
          const startCellColumn = startColumn + visualCell.visualStart;
          const endCellColumn = startColumn + visualCell.visualEnd;

          if (visualCell.type === 'empty') return;

          if (visualCell.span > 1) {
            sheet.mergeCells(
              rowNumber,
              startCellColumn,
              rowNumber,
              endCellColumn,
            );
          }

          const cell = sheet.getCell(rowNumber, startCellColumn);
          cell.value = '';
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' },
          };
          applyCenteredFont(cell, { bold: true, size: 8 });
          setGridBorder(cell, {
            topOuter: floor === floors,
            bottomOuter: floor === 1,
            leftOuter: visualCell.visualStart === 1,
            rightOuter: visualCell.visualEnd === unitsPerFloor,
            diagonal: visualCell.type === 'piloti',
          });

          if (visualCell.type !== 'valid') return;

          const cellKey = getCellKey(buildingName, visualCell.unitCode);
          const unitType = getUnitType(
            config,
            floor,
            visualCell.visualStart,
          );
          metaSheet.getRow(metaRowNumber).values = [
            resolvedWorksheetName,
            cell.address,
            buildingName,
            visualCell.unitCode,
            unitType,
            '',
          ];
          metaRowNumber += 1;
        });
      },
    );

    const typeLabelCell = sheet.getCell(TYPE_ROW, startColumn);
    typeLabelCell.value = '타입';
    applyCenteredFont(typeLabelCell, {
      bold: true,
      color: 'FF000000',
      size: 10,
    });
    typeLabelCell.border = {
      top: { style: 'medium', color: { argb: OUTER_COLOR } },
    };

    for (let visualUnitNumber = 1; visualUnitNumber <= unitsPerFloor; visualUnitNumber += 1) {
      const typeCell = sheet.getCell(TYPE_ROW, startColumn + visualUnitNumber);
      const baseType =
        config?.unitTypes?.[visualUnitNumber] ??
        config?.unitTypes?.[String(visualUnitNumber)] ??
        '';
      typeCell.value = normalizeText(baseType);
      applyCenteredFont(typeCell, {
        bold: true,
        color: 'FF000000',
        size: 10,
      });
      typeCell.border = {
        top: { style: 'medium', color: { argb: OUTER_COLOR } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    }

    const unitHeaderCell = sheet.getCell(UNIT_HEADER_ROW, startColumn);
    unitHeaderCell.value = '층';
    unitHeaderCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' },
    };
    applyCenteredFont(unitHeaderCell, {
      bold: true,
      color: 'FFFFFFFF',
      size: 10,
    });
    applyBorder(unitHeaderCell, 'FF64748B');

    for (let visualUnitNumber = 1; visualUnitNumber <= unitsPerFloor; visualUnitNumber += 1) {
      const headerCell = sheet.getCell(UNIT_HEADER_ROW, startColumn + visualUnitNumber);
      headerCell.value = `${visualUnitNumber}호`;
      headerCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' },
      };
      applyCenteredFont(headerCell, {
        bold: true,
        color: 'FFFFFFFF',
        size: 10,
      });
      applyBorder(headerCell, 'FF64748B');
    }

    sheet.mergeCells(BOTTOM_BUILDING_ROW, startColumn, BOTTOM_BUILDING_ROW, endColumn);
    const bottomBuildingCell = sheet.getCell(BOTTOM_BUILDING_ROW, startColumn);
    bottomBuildingCell.value = buildingName;
    styleBuildingTitle(bottomBuildingCell);
  });

  sheet.getRow(BUILDING_TITLE_ROW).height = 23;
  sheet.getRow(TYPE_ROW).height = 20;
  sheet.getRow(UNIT_HEADER_ROW).height = 22;
  sheet.getRow(BOTTOM_BUILDING_ROW).height = 23;

  const summaryHeaderType = sheet.getCell(DATA_START_ROW, SUMMARY_START_COLUMN);
  const summaryHeaderCount = sheet.getCell(DATA_START_ROW, SUMMARY_START_COLUMN + 1);
  [summaryHeaderType, summaryHeaderCount].forEach((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF002060' },
    };
    applyCenteredFont(cell, {
      bold: true,
      color: 'FFFFFFFF',
      size: 11,
    });
    applyBorder(cell, OUTER_COLOR);
  });
  summaryHeaderType.value = '타입';
  summaryHeaderCount.value = '세대 수';

  const sortedTypes = [...typeCounts.entries()].sort(([first], [second]) =>
    String(first).localeCompare(String(second), 'ko-KR', { numeric: true }),
  );

  sortedTypes.forEach(([unitType, count], index) => {
    const rowNumber = DATA_START_ROW + 1 + index;
    const typeCell = sheet.getCell(rowNumber, SUMMARY_START_COLUMN);
    const countCell = sheet.getCell(rowNumber, SUMMARY_START_COLUMN + 1);
    typeCell.value = unitType;
    countCell.value = count;
    [typeCell, countCell].forEach((cell) => {
      applyCenteredFont(cell, {
        bold: false,
        color: 'FF000000',
        size: 11,
      });
      applyBorder(cell, 'FFBFBFBF');
    });
    countCell.numFmt = '#,##0';
  });

  const subtotalRow = DATA_START_ROW + 1 + sortedTypes.length;
  const subtotalLabelCell = sheet.getCell(subtotalRow, SUMMARY_START_COLUMN);
  const subtotalCountCell = sheet.getCell(subtotalRow, SUMMARY_START_COLUMN + 1);
  subtotalLabelCell.value = '소계';
  subtotalCountCell.value = totalUnits;
  [subtotalLabelCell, subtotalCountCell].forEach((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFFFCC' },
    };
    applyCenteredFont(cell, {
      bold: true,
      color: 'FF000000',
      size: 11,
    });
    applyBorder(cell, OUTER_COLOR);
  });
  subtotalCountCell.numFmt = '#,##0';

  await downloadWorkbook(
    workbook,
    String(downloadFileName || '').trim() || '(양식)_골구도.xlsx',
  );
  return totalUnits;
};

export const saveInsulationOptionWorkbook = async ({
  projectName,
  buildingConfigs = {},
  optionData = {},
  downloadFileName = '',
  includeOptionValues = true,
  worksheetName = '',
  titleText = '',
  layoutMode = '',
}) => {
  const resolvedWorksheetName = String(worksheetName || '').trim() || DATA_SHEET_NAME;
  const resolvedTitleText = String(titleText || '').trim()
    || `${projectName || '현장명 미등록'} · 단열 옵션 골구도`;
  const shouldIncludeOptionValues = includeOptionValues !== false;
  const resolvedLayoutMode = String(layoutMode || '').trim().toLowerCase();

  if (resolvedLayoutMode === 'skeleton') {
    return saveBasicSkeletonWorkbook({
      projectName,
      buildingConfigs,
      downloadFileName,
      worksheetName:resolvedWorksheetName,
      titleText:resolvedTitleText,
    });
  }

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

  const maxFloors = entries.reduce(
    (maximum, [, config]) =>
      Math.max(maximum, Math.max(0, Number(config?.floors) || 0)),
    0,
  );

  const blocks = [];
  let nextStartColumn = 1;
  let totalUnits = 0;

  entries.forEach(([buildingName, config]) => {
    const unitsPerFloor = Math.max(0, Number(config?.unitsPerFloor) || 0);
    const startColumn = nextStartColumn;
    const endColumn = startColumn + unitsPerFloor;
    blocks.push({
      buildingName,
      config,
      startColumn,
      endColumn,
      unitsPerFloor,
    });
    nextStartColumn = endColumn + 1 + BLOCK_GAP_COLUMNS;

    const floors = Math.max(0, Number(config?.floors) || 0);
    for (let floor = 1; floor <= floors; floor += 1) {
      buildFloorVisualCells(config, floor).forEach((cell) => {
        if (cell.type === 'valid') totalUnits += 1;
      });
    }
  });

  const lastColumn = Math.max(1, blocks[blocks.length - 1]?.endColumn || 1);
  const sheet = workbook.addWorksheet(resolvedWorksheetName, {
    views: [
      {
        state: 'frozen',
        xSplit: 1,
        ySplit: HEADER_ROW,
        showGridLines: false,
      },
    ],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.2,
        right: 0.2,
        top: 0.3,
        bottom: 0.3,
        header: 0.1,
        footer: 0.1,
      },
    },
  });
  const metaSheet = createMetaSheet(workbook, projectName);
  let metaRowNumber = META_START_ROW;

  blocks.slice(0, -1).forEach(({ endColumn }) => {
    sheet.getColumn(endColumn + 1).width = BLOCK_GAP_COLUMN_WIDTH;
  });

  sheet.mergeCells(TITLE_ROW, 1, TITLE_ROW, lastColumn);
  sheet.getCell(TITLE_ROW, 1).value = resolvedTitleText;
  sheet.getCell(TITLE_ROW, 1).font = {
    name: '맑은 고딕',
    size: 15,
    bold: true,
    color: { argb: 'FF0F172A' },
  };
  sheet.getCell(TITLE_ROW, 1).alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  sheet.getRow(TITLE_ROW).height = 30;

  sheet.mergeCells(GUIDE_ROW, 1, GUIDE_ROW, lastColumn);
  sheet.getCell(GUIDE_ROW, 1).value =
    '각 세대의 빈칸에 현장 기준 단열 옵션명을 입력하세요. 동·층·호 위치와 숨김 시트는 변경하지 마세요.';
  sheet.getCell(GUIDE_ROW, 1).font = {
    name: '맑은 고딕',
    size: 9,
    color: { argb: 'FF475569' },
  };
  sheet.getCell(GUIDE_ROW, 1).alignment = {
    horizontal: 'center',
    vertical: 'middle',
  };
  sheet.getRow(GUIDE_ROW).height = 21;

  blocks.forEach(
    ({ buildingName, config, startColumn, endColumn, unitsPerFloor }) => {
      const floors = Math.max(0, Number(config?.floors) || 0);
      const floorStartRow = DATA_START_ROW + (maxFloors - floors);

      sheet.mergeCells(
        BUILDING_TITLE_ROW,
        startColumn,
        BUILDING_TITLE_ROW,
        endColumn,
      );
      const buildingTitleCell = sheet.getCell(
        BUILDING_TITLE_ROW,
        startColumn,
      );
      buildingTitleCell.value = buildingName;
      buildingTitleCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' },
      };
      applyCenteredFont(buildingTitleCell, {
        bold: true,
        color: 'FF0F172A',
        size: 10,
      });
      applyBorder(buildingTitleCell, 'FF94A3B8');

      const floorHeaderCell = sheet.getCell(HEADER_ROW, startColumn);
      floorHeaderCell.value = '층';
      floorHeaderCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' },
      };
      applyCenteredFont(floorHeaderCell, {
        bold: true,
        color: 'FFFFFFFF',
        size: 8,
      });
      applyBorder(floorHeaderCell, 'FF64748B');
      sheet.getColumn(startColumn).width = 6;

      for (
        let visualUnitNumber = 1;
        visualUnitNumber <= unitsPerFloor;
        visualUnitNumber += 1
      ) {
        const columnNumber = startColumn + visualUnitNumber;
        const headerCell = sheet.getCell(HEADER_ROW, columnNumber);
        headerCell.value = `${visualUnitNumber}호`;
        headerCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF334155' },
        };
        applyCenteredFont(headerCell, {
          bold: true,
          color: 'FFFFFFFF',
          size: 8,
        });
        applyBorder(headerCell, 'FF64748B');
        sheet.getColumn(columnNumber).width = 11;
      }

      Array.from({ length: floors }, (_, index) => floors - index).forEach(
        (floor, floorIndex) => {
          const rowNumber = floorStartRow + floorIndex;
          const floorCell = sheet.getCell(rowNumber, startColumn);
          floorCell.value = `${floor}F`;
          floorCell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF1F5F9' },
          };
          applyCenteredFont(floorCell, { bold: true, size: 8 });
          applyBorder(floorCell);
          sheet.getRow(rowNumber).height = 24;

          buildFloorVisualCells(config, floor).forEach((visualCell) => {
            const startCellColumn =
              startColumn + visualCell.visualStart;
            const endCellColumn = startColumn + visualCell.visualEnd;

            if (visualCell.span > 1) {
              sheet.mergeCells(
                rowNumber,
                startCellColumn,
                rowNumber,
                endCellColumn,
              );
            }

            const cell = sheet.getCell(rowNumber, startCellColumn);
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
            const optionValue = shouldIncludeOptionValues
              ? normalizeText(optionData?.[cellKey]?.value)
              : '';
            const unitType = getUnitType(
              config,
              floor,
              visualCell.visualStart,
            );

            cell.value = optionValue;
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFFFFF' },
            };
            applyBorder(cell);

            metaSheet.getRow(metaRowNumber).values = [
              resolvedWorksheetName,
              cell.address,
              buildingName,
              visualCell.unitCode,
              unitType,
              '',
            ];
            metaRowNumber += 1;
          });
        },
      );

      const typeRowNumber = DATA_START_ROW + maxFloors + 1;
      const typeLabelCell = sheet.getCell(typeRowNumber, startColumn);
      typeLabelCell.value = '타입';
      applyCenteredFont(typeLabelCell, {
        bold: true,
        color: 'FF475569',
        size: 8,
      });

      for (
        let visualUnitNumber = 1;
        visualUnitNumber <= unitsPerFloor;
        visualUnitNumber += 1
      ) {
        const typeCell = sheet.getCell(
          typeRowNumber,
          startColumn + visualUnitNumber,
        );
        const baseType =
          config?.unitTypes?.[visualUnitNumber] ??
          config?.unitTypes?.[String(visualUnitNumber)] ??
          '';
        typeCell.value = normalizeText(baseType);
        applyCenteredFont(typeCell, {
          bold: true,
          color: 'FF475569',
          size: 8,
        });
        if (baseType) applyBorder(typeCell);
      }
      sheet.getRow(typeRowNumber).height = 20;
    },
  );

  sheet.getRow(BUILDING_TITLE_ROW).height = 23;
  sheet.getRow(HEADER_ROW).height = 22;

  await downloadWorkbook(
    workbook,
    String(downloadFileName || '').trim()
      || `옵션현황_단열_${toSafeFilenamePart(projectName)}.xlsx`,
  );
  return totalUnits;
};

const readMetaValue = (sheet, key) => {
  for (let rowNumber = 1; rowNumber <= 5; rowNumber += 1) {
    if (
      normalizeText(toPlainCellValue(sheet.getCell(rowNumber, 1).value)) ===
      key
    ) {
      return normalizeText(
        toPlainCellValue(sheet.getCell(rowNumber, 2).value),
      );
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
    throw new Error(
      '시스템 정보가 없는 파일입니다. 화면에서 내려받은 골구도 양식을 사용해주세요.',
    );
  }

  if (readMetaValue(metaSheet, 'template_version') !== TEMPLATE_VERSION) {
    throw new Error(
      '이전 형식의 단열 옵션 파일입니다. 새 골구도 양식을 내려받아 작성해주세요.',
    );
  }
  if (readMetaValue(metaSheet, 'category') !== CATEGORY) {
    throw new Error('옵션현황(단열)용 엑셀 파일이 아닙니다.');
  }
  const sourceProjectName = readMetaValue(metaSheet, 'project_name');
  if (sourceProjectName !== normalizeText(projectName)) {
    throw new Error(
      `현재 현장(${projectName})과 엑셀 현장(${
        sourceProjectName || '미등록'
      })이 다릅니다.`,
    );
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
  let blankRows = 0;

  const maximumRow = Math.min(metaSheet.rowCount || 0, MAX_META_ROWS);
  for (
    let rowNumber = META_START_ROW;
    rowNumber <= maximumRow;
    rowNumber += 1
  ) {
    const row = metaSheet.getRow(rowNumber);
    const sheetName = normalizeText(toPlainCellValue(row.getCell(1).value));
    const address = normalizeText(toPlainCellValue(row.getCell(2).value));
    const building = normalizeText(toPlainCellValue(row.getCell(3).value));
    const unit = normalizeText(toPlainCellValue(row.getCell(4).value));
    if (!sheetName && !address && !building && !unit) continue;

    const cellKey = getCellKey(building, unit);
    if (!validCellKeys.has(cellKey)) {
      invalidRows.push({
        rowNumber,
        cellKey,
        message: '현재 골구도에 없는 세대입니다.',
      });
      continue;
    }
    if (seenKeys.has(cellKey)) {
      invalidRows.push({
        rowNumber,
        cellKey,
        message: '숨김 세대정보가 중복되었습니다.',
      });
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
    if (!visibleValue) {
      blankRows += 1;
      continue;
    }
    if (visibleValue.length > 80) {
      invalidRows.push({
        rowNumber,
        cellKey,
        message: '옵션명은 80자 이내로 입력해주세요.',
      });
      continue;
    }

    unitValues[cellKey] = { value: visibleValue };
  }

  if (mappedRows === 0) {
    throw new Error(
      '불러올 세대 셀이 없습니다. 골구도 구조가 변경되었는지 확인해주세요.',
    );
  }
  if (missingCells.length > 0 || invalidRows.length > 0) {
    const firstIssue = missingCells[0]
      ? `${missingCells[0].sheetName}!${missingCells[0].address} 셀을 찾을 수 없습니다.`
      : `${invalidRows[0].cellKey}: ${invalidRows[0].message}`;
    throw new Error(
      `골구도 구조가 변경되어 불러올 수 없습니다. ${firstIssue}`,
    );
  }

  return {
    sourceSheetCount: workbook.worksheets.filter(
      (sheet) => sheet.name !== META_SHEET_NAME,
    ).length,
    totalRows: mappedRows,
    filledRows: Object.keys(unitValues).length,
    blankRows,
    unitValues,
  };
};
