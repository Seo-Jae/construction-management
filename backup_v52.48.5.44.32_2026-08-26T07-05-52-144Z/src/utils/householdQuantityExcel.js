// v52.48.5.44.31 세대물량 공정별 갑지 Excel 생성·업로드
import ExcelJS from 'exceljs';
import { createSelectionOptionUnitRows } from './optionSelectionExcel.js';

const TEMPLATE_VERSION = '1';
const CATEGORY = 'household_quantity';
const META_SHEET_NAME = '_세대물량시스템정보';
const META_START_ROW = 8;
const DEFAULT_UNIT = 'M2';

const normalizeText = (value) => String(value ?? '').trim();

const naturalCompare = (first, second) =>
  String(first).localeCompare(String(second), 'ko-KR', { numeric: true });

const toSafeFilenamePart = (value) =>
  normalizeText(value)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_') || '현장';

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

const toQuantity = (value) => {
  const text = normalizeText(toPlainCellValue(value)).replace(/,/g, '');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
};

const normalizeUnit = (value) => normalizeText(value) || DEFAULT_UNIT;

const applyBorder = (cell, color = 'FFCBD5E1') => {
  cell.border = {
    top: { style: 'thin', color: { argb: color } },
    left: { style: 'thin', color: { argb: color } },
    bottom: { style: 'thin', color: { argb: color } },
    right: { style: 'thin', color: { argb: color } },
  };
};

const applyHeaderStyle = (cell, fill = 'FF334155') => {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: fill },
  };
  cell.font = {
    name: '맑은 고딕',
    size: 9,
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  cell.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  };
  applyBorder(cell, 'FF64748B');
};

const applyBodyStyle = (cell, options = {}) => {
  cell.font = {
    name: '맑은 고딕',
    size: 9,
    color: { argb: 'FF334155' },
  };
  cell.alignment = {
    horizontal: options.horizontal || 'center',
    vertical: 'middle',
    wrapText: true,
  };
  if (options.fill) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: options.fill },
    };
  }
  applyBorder(cell);
};

const createRowIdentity = (row) =>
  [
    normalizeText(row?.processName),
    normalizeText(row?.kind),
    normalizeText(row?.typeName),
    normalizeText(row?.basisOption),
    normalizeText(row?.optionName),
  ].join('\u001f');

const normalizeValueRow = (row, fallback = {}) => ({
  processName: normalizeText(row?.processName || fallback.processName),
  kind: normalizeText(row?.kind || fallback.kind),
  typeName: normalizeText(row?.typeName || fallback.typeName),
  basisOption: normalizeText(row?.basisOption || fallback.basisOption),
  optionName: normalizeText(row?.optionName || fallback.optionName),
  quantity: toQuantity(row?.quantity),
  unit: normalizeUnit(row?.unit),
});

export const normalizeHouseholdQuantityDocument = (value = {}) => {
  const processOptionSelections = {};
  const rawSelections =
    value?.processOptionSelections &&
    typeof value.processOptionSelections === 'object' &&
    !Array.isArray(value.processOptionSelections)
      ? value.processOptionSelections
      : {};

  Object.entries(rawSelections).forEach(([processName, optionNames]) => {
    const normalizedProcess = normalizeText(processName);
    if (!normalizedProcess) return;
    processOptionSelections[normalizedProcess] = [
      ...new Set(
        (Array.isArray(optionNames) ? optionNames : [])
          .map((optionName) => normalizeText(optionName))
          .filter(Boolean),
      ),
    ];
  });

  const values = [];
  const seen = new Set();
  (Array.isArray(value?.values) ? value.values : []).forEach((row) => {
    const normalized = normalizeValueRow(row);
    if (!normalized.processName || !normalized.kind || !normalized.typeName) {
      return;
    }
    const identity = createRowIdentity(normalized);
    if (seen.has(identity)) return;
    seen.add(identity);
    values.push(normalized);
  });

  return {
    version: 1,
    processOptionSelections,
    values,
  };
};

const createValueMap = (document) =>
  new Map(
    normalizeHouseholdQuantityDocument(document).values.map((row) => [
      createRowIdentity(row),
      row,
    ]),
  );

export const createHouseholdQuantityDefinitions = ({
  buildingConfigs = {},
  processOptions = [],
  insulationData = {},
  selectionDocument = {},
  quantityDocument = {},
  processOptionSelections,
}) => {
  const normalizedDocument = normalizeHouseholdQuantityDocument(
    quantityDocument,
  );
  const selections =
    processOptionSelections || normalizedDocument.processOptionSelections;
  const valueMap = createValueMap(normalizedDocument);
  const unitRows = createSelectionOptionUnitRows(buildingConfigs);
  const typeCounts = new Map();

  unitRows.forEach((row) => {
    const typeName = normalizeText(row.unitType) || '미지정';
    typeCounts.set(typeName, (typeCounts.get(typeName) || 0) + 1);
  });

  const typeNames = [...typeCounts.keys()].sort(naturalCompare);
  const selectedOptionCounts = new Map();
  Object.entries(selectionDocument?.units || {}).forEach(([cellKey, row]) => {
    const unitRow = unitRows.find((unit) => unit.cellKey === cellKey);
    if (!unitRow) return;
    const typeName = normalizeText(unitRow.unitType) || '미지정';
    (Array.isArray(row?.selectedOptions) ? row.selectedOptions : []).forEach(
      (optionName) => {
        const normalizedOption = normalizeText(optionName);
        if (!normalizedOption) return;
        const key = `${typeName}\u001f${normalizedOption}`;
        selectedOptionCounts.set(
          key,
          (selectedOptionCounts.get(key) || 0) + 1,
        );
      },
    );
  });

  const processes = (Array.isArray(processOptions) ? processOptions : [])
    .map((processName) => normalizeText(processName))
    .filter(Boolean)
    .map((processName) => {
      const isInsulation = processName === '단열';
      let baseRows = [];

      if (isInsulation) {
        const groupCounts = new Map();
        unitRows.forEach((unitRow) => {
          const typeName = normalizeText(unitRow.unitType) || '미지정';
          const basisOption =
            normalizeText(insulationData?.[unitRow.cellKey]?.value) ||
            '미지정';
          const key = `${typeName}\u001f${basisOption}`;
          groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
        });

        baseRows = [...groupCounts.entries()]
          .map(([key, unitCount]) => {
            const [typeName, basisOption] = key.split('\u001f');
            return {
              processName,
              kind: 'base',
              typeName,
              basisOption,
              optionName: '',
              unitCount,
            };
          })
          .sort(
            (first, second) =>
              naturalCompare(first.typeName, second.typeName) ||
              naturalCompare(first.basisOption, second.basisOption),
          );
      } else {
        baseRows = typeNames.map((typeName) => ({
          processName,
          kind: 'base',
          typeName,
          basisOption: '',
          optionName: '',
          unitCount: typeCounts.get(typeName) || 0,
        }));
      }

      baseRows = baseRows.map((row) => {
        const saved = valueMap.get(createRowIdentity(row));
        return {
          ...row,
          quantity: saved?.quantity ?? null,
          unit: normalizeUnit(saved?.unit),
        };
      });

      const selectedOptions = isInsulation
        ? []
        : [
            ...new Set(
              (Array.isArray(selections?.[processName])
                ? selections[processName]
                : [])
                .map((optionName) => normalizeText(optionName))
                .filter(Boolean),
            ),
          ];

      const optionRows = [];
      selectedOptions.forEach((optionName) => {
        typeNames.forEach((typeName) => {
          const unitCount =
            selectedOptionCounts.get(`${typeName}\u001f${optionName}`) || 0;
          if (unitCount <= 0) return;
          const row = {
            processName,
            kind: 'option',
            typeName,
            basisOption: '',
            optionName,
            unitCount,
          };
          const saved = valueMap.get(createRowIdentity(row));
          optionRows.push({
            ...row,
            quantity: saved?.quantity ?? null,
            unit: normalizeUnit(saved?.unit),
          });
        });
      });

      const baseTotal = baseRows.reduce(
        (total, row) => total + (Number(row.quantity) || 0) * row.unitCount,
        0,
      );
      const optionTotal = optionRows.reduce(
        (total, row) => total + (Number(row.quantity) || 0) * row.unitCount,
        0,
      );

      return {
        processName,
        isInsulation,
        baseRows,
        optionRows,
        unitCount: unitRows.length,
        baseTotal,
        optionTotal,
        totalQuantity: baseTotal + optionTotal,
      };
    });

  return {
    processes,
    unitCount: unitRows.length,
    typeCount: typeNames.length,
    processOptionSelections: selections,
  };
};

export const createHouseholdQuantityDocumentFromDefinitions = (
  definitions,
) => ({
  version: 1,
  processOptionSelections: definitions.processOptionSelections || {},
  values: definitions.processes.flatMap((process) => [
    ...process.baseRows,
    ...process.optionRows,
  ]).map((row) => normalizeValueRow(row)),
});

const createUniqueSheetName = (workbook, processName) => {
  const base =
    normalizeText(processName).replace(/[\\/*?:[\]]/g, '_').slice(0, 28) ||
    '공정';
  let name = base;
  let index = 2;
  while (workbook.getWorksheet(name)) {
    name = `${base.slice(0, 25)}_${index}`;
    index += 1;
  }
  return name;
};

const createMetaSheet = ({ workbook, projectName, definitions }) => {
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
  sheet.getCell('A5').value = 'process_option_selections';
  sheet.getCell('B5').value = JSON.stringify(
    definitions.processOptionSelections || {},
  );
  sheet.getRow(7).values = [
    'sheet_name',
    'quantity_cell',
    'unit_cell',
    'process_name',
    'kind',
    'type_name',
    'basis_option',
    'option_name',
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

export const saveHouseholdQuantityWorkbook = async ({
  projectName,
  definitions,
}) => {
  if (!definitions?.processes?.length) {
    throw new Error('엑셀로 내려받을 공정정보가 없습니다.');
  }
  if (!definitions.unitCount) {
    throw new Error('엑셀로 내려받을 골구도 세대정보가 없습니다.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = '공사관리 시스템';
  workbook.created = new Date();
  workbook.modified = new Date();
  const metaSheet = createMetaSheet({ workbook, projectName, definitions });
  let metaRowNumber = META_START_ROW;

  definitions.processes.forEach((process) => {
    const sheetName = createUniqueSheetName(workbook, process.processName);
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    });
    sheet.columns = [
      { width: 9 },
      { width: 14 },
      { width: 24 },
      { width: 13 },
      { width: 11 },
      { width: 13 },
      { width: 16 },
    ];

    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = `${projectName || '현장명 미등록'} · ${
      process.processName
    } 세대물량 갑지`;
    sheet.getCell('A1').font = {
      name: '맑은 고딕',
      size: 15,
      bold: true,
      color: { argb: 'FF0F172A' },
    };
    sheet.getCell('A1').alignment = {
      horizontal: 'center',
      vertical: 'middle',
    };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value = process.isInsulation
      ? '단열 옵션현황에 따라 타입·단열옵션별 기본물량을 입력하세요.'
      : '타입별 기본물량과 선택한 유상옵션별 증감물량을 입력하세요. 감소하는 물량은 음수(-)로 입력합니다.';
    sheet.getCell('A2').font = {
      name: '맑은 고딕',
      size: 9,
      color: { argb: 'FF475569' },
    };
    sheet.getCell('A2').alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
    };
    sheet.getRow(2).height = 24;

    sheet.mergeCells('A4:G4');
    sheet.getCell('A4').value = '타입별 기본물량';
    applyHeaderStyle(sheet.getCell('A4'), 'FF2563EB');
    sheet.getRow(5).values = [
      '구분',
      '타입',
      '단열 기준',
      '해당 세대',
      '기본물량',
      '단위',
      '자동 합계',
    ];
    sheet.getRow(5).eachCell((cell) => applyHeaderStyle(cell));

    let rowNumber = 6;
    process.baseRows.forEach((row) => {
      sheet.getRow(rowNumber).values = [
        '기본',
        row.typeName,
        row.basisOption || '-',
        row.unitCount,
        row.quantity,
        row.unit,
        { formula: `D${rowNumber}*E${rowNumber}` },
      ];
      for (let column = 1; column <= 7; column += 1) {
        applyBodyStyle(sheet.getCell(rowNumber, column), {
          fill: column === 5 || column === 6 ? 'FFFFFBEB' : undefined,
        });
      }
      sheet.getCell(rowNumber, 4).numFmt = '#,##0';
      sheet.getCell(rowNumber, 5).numFmt = '#,##0.###;[Red]-#,##0.###';
      sheet.getCell(rowNumber, 7).numFmt = '#,##0.###;[Red]-#,##0.###';
      metaSheet.getRow(metaRowNumber).values = [
        sheetName,
        sheet.getCell(rowNumber, 5).address,
        sheet.getCell(rowNumber, 6).address,
        row.processName,
        row.kind,
        row.typeName,
        row.basisOption,
        '',
      ];
      metaRowNumber += 1;
      rowNumber += 1;
    });

    rowNumber += 1;
    sheet.mergeCells(rowNumber, 1, rowNumber, 7);
    sheet.getCell(rowNumber, 1).value = '타입·유상옵션별 증감물량';
    applyHeaderStyle(sheet.getCell(rowNumber, 1), 'FF0F766E');
    rowNumber += 1;
    sheet.getRow(rowNumber).values = [
      '구분',
      '타입',
      '유상옵션',
      '해당 세대',
      '증감물량',
      '단위',
      '자동 합계',
    ];
    sheet.getRow(rowNumber).eachCell((cell) =>
      applyHeaderStyle(cell, 'FF475569'),
    );
    rowNumber += 1;

    if (process.optionRows.length === 0) {
      sheet.mergeCells(rowNumber, 1, rowNumber, 7);
      sheet.getCell(rowNumber, 1).value = process.isInsulation
        ? '단열공정은 상단 타입·단열옵션별 기본물량을 사용합니다.'
        : '이 공정에 연결된 유상옵션이 없습니다.';
      applyBodyStyle(sheet.getCell(rowNumber, 1), { fill: 'FFF8FAFC' });
      rowNumber += 1;
    } else {
      process.optionRows.forEach((row) => {
        sheet.getRow(rowNumber).values = [
          '옵션증감',
          row.typeName,
          row.optionName,
          row.unitCount,
          row.quantity,
          row.unit,
          { formula: `D${rowNumber}*E${rowNumber}` },
        ];
        for (let column = 1; column <= 7; column += 1) {
          applyBodyStyle(sheet.getCell(rowNumber, column), {
            fill: column === 5 || column === 6 ? 'FFFFFBEB' : undefined,
          });
        }
        sheet.getCell(rowNumber, 4).numFmt = '#,##0';
        sheet.getCell(rowNumber, 5).numFmt = '#,##0.###;[Red]-#,##0.###';
        sheet.getCell(rowNumber, 7).numFmt = '#,##0.###;[Red]-#,##0.###';
        metaSheet.getRow(metaRowNumber).values = [
          sheetName,
          sheet.getCell(rowNumber, 5).address,
          sheet.getCell(rowNumber, 6).address,
          row.processName,
          row.kind,
          row.typeName,
          '',
          row.optionName,
        ];
        metaRowNumber += 1;
        rowNumber += 1;
      });
    }

    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: 5, column: 7 },
    };
  });

  await downloadWorkbook(
    workbook,
    `${toSafeFilenamePart(projectName)}_세대물량관리.xlsx`,
  );

  return {
    processCount: definitions.processes.length,
    unitCount: definitions.unitCount,
  };
};

export const parseHouseholdQuantityWorkbookFile = async ({
  file,
  projectName,
}) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const metaSheet = workbook.getWorksheet(META_SHEET_NAME);
  if (!metaSheet) {
    throw new Error('세대물량관리에서 내려받은 양식이 아닙니다.');
  }
  if (normalizeText(metaSheet.getCell('B2').value) !== CATEGORY) {
    throw new Error('세대물량관리 Excel 분류정보가 일치하지 않습니다.');
  }
  const workbookProjectName = normalizeText(metaSheet.getCell('B3').value);
  if (
    projectName &&
    workbookProjectName &&
    workbookProjectName !== normalizeText(projectName)
  ) {
    throw new Error(
      `현재 현장(${projectName})과 Excel 현장(${workbookProjectName})이 다릅니다.`,
    );
  }

  let processOptionSelections = {};
  try {
    processOptionSelections = JSON.parse(
      normalizeText(metaSheet.getCell('B5').value) || '{}',
    );
  } catch {
    throw new Error('Excel의 공정별 옵션 연결정보를 읽을 수 없습니다.');
  }

  const values = [];
  let rowNumber = META_START_ROW;
  while (rowNumber <= metaSheet.rowCount) {
    const sheetName = normalizeText(metaSheet.getCell(rowNumber, 1).value);
    const quantityAddress = normalizeText(
      metaSheet.getCell(rowNumber, 2).value,
    );
    const unitAddress = normalizeText(metaSheet.getCell(rowNumber, 3).value);
    const processName = normalizeText(metaSheet.getCell(rowNumber, 4).value);
    const kind = normalizeText(metaSheet.getCell(rowNumber, 5).value);
    const typeName = normalizeText(metaSheet.getCell(rowNumber, 6).value);
    const basisOption = normalizeText(metaSheet.getCell(rowNumber, 7).value);
    const optionName = normalizeText(metaSheet.getCell(rowNumber, 8).value);
    if (!sheetName && !quantityAddress && !processName) {
      rowNumber += 1;
      continue;
    }
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet || !quantityAddress || !processName || !kind || !typeName) {
      throw new Error(`숨김 연결정보 ${rowNumber}행이 올바르지 않습니다.`);
    }
    values.push({
      processName,
      kind,
      typeName,
      basisOption,
      optionName,
      quantity: toQuantity(sheet.getCell(quantityAddress).value),
      unit: normalizeUnit(sheet.getCell(unitAddress).value),
    });
    rowNumber += 1;
  }

  if (values.length === 0) {
    throw new Error('불러올 타입·공정 물량행이 없습니다.');
  }

  const document = normalizeHouseholdQuantityDocument({
    processOptionSelections,
    values,
  });
  const filledCount = document.values.filter(
    (row) => row.quantity !== null,
  ).length;

  return {
    document,
    processCount: new Set(document.values.map((row) => row.processName)).size,
    filledCount,
  };
};
