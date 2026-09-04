// v52.48.5.44.151 자재발주서 업무자료실 양식 Excel 다운로드
import ExcelJS from 'exceljs';
import { supabase } from '../supabaseClient';
import { BUSINESS_LIBRARY_BUCKET } from '../config/businessLibraryCatalog.js';

const ITEM_START_ROW = 7;
const TEMPLATE_ITEM_END_ROW = 27;
const EXCEL_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');
const normalizeTemplateName = (value) => normalizeText(value)
  .toLocaleLowerCase('ko-KR')
  .replace(/\.(xlsx|xlsm)$/i, '')
  .replace(/[^0-9a-z가-힣]/gi, '');

const safeFileName = (value) => normalizeText(value)
  .replace(/[\\/:*?"<>|]/g, '_')
  .replace(/\s+/g, '_');

const toExcelDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const numberValue = (value) => {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const isMaterialOrderTemplate = (row) => {
  const title = normalizeTemplateName(row?.title);
  const fileName = normalizeTemplateName(row?.original_file_name);
  return (
    title.includes('자재발주서') ||
    title.includes('자재발주') ||
    fileName.includes('자재발주서') ||
    fileName.includes('발주서양식')
  );
};

const getTemplateScore = (row, projectName) => {
  const title = normalizeTemplateName(row?.title);
  const fileName = normalizeTemplateName(row?.original_file_name);
  let score = 0;
  if (title === '자재발주서양식') score += 100;
  else if (title.includes('자재발주서')) score += 70;
  else if (title.includes('자재발주')) score += 50;
  if (fileName === '발주서양식' || fileName === '자재발주서양식') score += 90;
  else if (fileName.includes('발주서양식')) score += 60;
  if (
    row?.scope_type === 'project' &&
    normalizeText(row?.project_name) === normalizeText(projectName)
  ) score += 20;
  if (row?.scope_type === 'company') score += 10;
  if (row?.storage_provider === 'supabase') score += 5;
  return score;
};

const downloadBusinessLibraryTemplate = async (projectName) => {
  const { data, error } = await supabase
    .from('business_library_documents')
    .select(
      'id, title, scope_type, project_name, storage_provider, storage_path, external_url, original_file_name, created_at',
    )
    .eq('is_latest', true)
    .order('created_at', { ascending: false });

  if (error) return null;

  const candidates = (data || [])
    .filter(isMaterialOrderTemplate)
    .filter((row) => (
      row.scope_type !== 'project' ||
      normalizeText(row.project_name) === normalizeText(projectName)
    ))
    .sort((first, second) => (
      getTemplateScore(second, projectName) - getTemplateScore(first, projectName)
    ));
  const selected = candidates[0];
  if (!selected) return null;

  if (selected.storage_provider === 'supabase' && selected.storage_path) {
    const { data: blob, error: storageError } = await supabase.storage
      .from(BUSINESS_LIBRARY_BUCKET)
      .download(selected.storage_path);
    if (storageError || !(blob instanceof Blob)) return null;
    return {
      arrayBuffer: await blob.arrayBuffer(),
      source: '업무자료실 자재발주서 양식',
    };
  }

  if (selected.storage_provider === 'external' && selected.external_url) {
    try {
      const response = await fetch(selected.external_url, { cache: 'no-store' });
      if (response.ok) {
        return {
          arrayBuffer: await response.arrayBuffer(),
          source: '업무자료실 자재발주서 양식',
        };
      }
    } catch {
      return null;
    }
  }

  return null;
};

const loadTemplate = async (projectName) => {
  const businessLibraryTemplate = await downloadBusinessLibraryTemplate(projectName);
  if (businessLibraryTemplate) return businessLibraryTemplate;
  throw new Error('업무자료실에서 자재발주서 양식을 찾거나 내려받지 못했습니다.');
};

const cloneStyle = (style) => {
  if (!style) return {};
  return JSON.parse(JSON.stringify(style));
};

const findTemplateItemEndRow = (worksheet) => {
  let lastFormulaRow = TEMPLATE_ITEM_END_ROW;
  for (let rowNumber = ITEM_START_ROW; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= 11; columnNumber += 1) {
      const value = worksheet.getCell(rowNumber, columnNumber).value;
      if (
        value &&
        typeof value === 'object' &&
        (
          Object.prototype.hasOwnProperty.call(value, 'formula') ||
          Object.prototype.hasOwnProperty.call(value, 'sharedFormula')
        )
      ) {
        lastFormulaRow = Math.max(lastFormulaRow, rowNumber);
      }
    }
  }
  return lastFormulaRow;
};

const prepareItemRows = (worksheet, itemCount, templateItemEndRow) => {
  const lastItemRow = Math.max(
    templateItemEndRow,
    ITEM_START_ROW + Math.max(0, itemCount - 1),
  );

  for (let rowNumber = templateItemEndRow + 1; rowNumber <= lastItemRow; rowNumber += 1) {
    const sourceRow = worksheet.getRow(templateItemEndRow);
    const targetRow = worksheet.getRow(rowNumber);
    targetRow.height = sourceRow.height;
    for (let columnNumber = 1; columnNumber <= 9; columnNumber += 1) {
      const sourceCell = sourceRow.getCell(columnNumber);
      const targetCell = targetRow.getCell(columnNumber);
      targetCell.style = cloneStyle(sourceCell.style);
    }
  }

  return lastItemRow;
};

const clearDefinedNames = (workbook) => {
  try {
    if (workbook?.definedNames) workbook.definedNames.model = [];
  } catch {
    // 일부 외부 양식은 이름 범위를 제공하지 않습니다.
  }
};

const flattenWorkbookFormulas = (workbook) => {
  workbook.worksheets.forEach((worksheet) => {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value;
        if (
          value &&
          typeof value === 'object' &&
          (
            Object.prototype.hasOwnProperty.call(value, 'formula') ||
            Object.prototype.hasOwnProperty.call(value, 'sharedFormula')
          )
        ) {
          cell.value = value.result ?? null;
        }
      });
    });
  });
};

const triggerWorkbookDownload = async (workbook, fileName) => {
  const outputBuffer = await workbook.xlsx.writeBuffer();
  const objectUrl = URL.createObjectURL(
    new Blob([outputBuffer], { type: EXCEL_MIME_TYPE }),
  );
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60 * 1000);
};

export const saveMaterialOrderWorkbook = async ({
  projectName,
  order,
  items,
}) => {
  const template = await loadTemplate(projectName);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template.arrayBuffer);
  const worksheet = workbook.getWorksheet('발주서') || workbook.worksheets[0];
  if (!worksheet) throw new Error('자재발주서 양식에서 발주서 시트를 찾지 못했습니다.');
  const templateItemEndRow = findTemplateItemEndRow(worksheet);
  // 업무자료실에 등록된 일부 기존 양식은 공유 수식의 기준 셀이 제거된
  // 상태라 ExcelJS로 다시 저장할 때 오류가 납니다. 양식의 계산 결과와
  // 서식은 유지하고 수식만 일반 값으로 바꾼 뒤 현재 발주값을 입력합니다.
  flattenWorkbookFormulas(workbook);
  clearDefinedNames(workbook);

  const lastItemRow = prepareItemRows(
    worksheet,
    items.length,
    templateItemEndRow,
  );

  worksheet.getCell('B2').value = toExcelDate(order.orderDate);
  worksheet.getCell('B2').numFmt = 'yyyy.mm.dd';
  worksheet.getCell('B3').value = normalizeText(projectName);
  worksheet.getCell('B4').value = normalizeText(order.deliveryLocation);
  worksheet.getCell('E2').value = normalizeText(order.receiverName);
  worksheet.getCell('E3').value = toExcelDate(order.deliveryDate);
  worksheet.getCell('E3').numFmt = 'yyyy.mm.dd';

  for (let rowNumber = ITEM_START_ROW; rowNumber <= lastItemRow; rowNumber += 1) {
    const item = items[rowNumber - ITEM_START_ROW];
    const columnsToClear = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    columnsToClear.forEach((column) => {
      worksheet.getCell(`${column}${rowNumber}`).value = null;
    });
    if (!item) continue;

    const executionQuantity = numberValue(item.executionQuantity);
    const previousQuantity = numberValue(item.previousQuantity);
    const currentQuantity = numberValue(item.currentQuantity);
    const cumulativeQuantity = previousQuantity + currentQuantity;

    worksheet.getCell(`A${rowNumber}`).value = normalizeText(item.standardName);
    worksheet.getCell(`B${rowNumber}`).value = normalizeText(item.specification);
    worksheet.getCell(`C${rowNumber}`).value = normalizeText(item.unit);
    worksheet.getCell(`D${rowNumber}`).value = executionQuantity;
    worksheet.getCell(`E${rowNumber}`).value = previousQuantity;
    worksheet.getCell(`F${rowNumber}`).value = currentQuantity;
    worksheet.getCell(`G${rowNumber}`).value = cumulativeQuantity;
    worksheet.getCell(`H${rowNumber}`).value = executionQuantity > 0
      ? cumulativeQuantity / executionQuantity
      : '-';
    worksheet.getCell(`I${rowNumber}`).value = normalizeText(item.note);

    [
      ['D', executionQuantity],
      ['E', previousQuantity],
      ['F', currentQuantity],
      ['G', cumulativeQuantity],
    ].forEach(([column, value]) => {
      worksheet.getCell(`${column}${rowNumber}`).numFmt = Number.isInteger(value)
        ? '#,##0'
        : '#,##0.###';
    });
    worksheet.getCell(`H${rowNumber}`).numFmt = '0.0%';
  }

  worksheet.pageSetup.printArea = `A1:I${lastItemRow}`;
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;

  const datePart = String(order.orderDate || '').replace(/-/g, '') || '작성중';
  const orderPart = normalizeText(order.orderNo) || datePart;
  const fileName = `자재발주서_${safeFileName(projectName)}_${safeFileName(orderPart)}.xlsx`;
  await triggerWorkbookDownload(workbook, fileName);

  return { source: template.source, fileName };
};
