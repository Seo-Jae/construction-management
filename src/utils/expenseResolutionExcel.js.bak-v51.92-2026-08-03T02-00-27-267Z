const TEMPLATE_URL = '/templates/expense-resolution-template.xlsx';
const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_COVER_ROWS = 40;

const CATEGORY_KEYS = [
  'fuel',
  'toll',
  'entertainment',
  'lodging',
  'materials',
  'shipping',
  'other',
];

const CATEGORY_LABELS = {
  fuel: '유류대',
  toll: '통행료',
  entertainment: '접대비(회식)',
  lodging: '숙박비',
  materials: '잡자재',
  shipping: '우편·택배비',
  other: '기타',
};

const COVER_AMOUNT_COLUMNS = {
  fuel: 'C',
  toll: 'E',
  entertainment: 'F',
  lodging: 'G',
  materials: 'H',
  shipping: 'I',
  other: 'J',
};

const CALENDAR_COLUMNS = [2, 4, 6, 8, 10, 12, 14];

// 원본 상세내역 시트의 실제 RGB 색상입니다.
// 색상 인덱스를 사용하면 시트 복사·브라우저 생성 과정에서 색이 달라질 수 있어
// 생성할 때마다 RGB를 직접 적용합니다.
const CALENDAR_COLORS = {
  header: 'FF12346C',
  weekday: 'FFFFFFFF',
  weekend: 'FFF9F9E1',
  outsideMonth: 'FFD9D9D9',
  dateText: 'FF000080',
  bodyText: 'FF000000',
  grid: 'FF12346C',
};

const pad = (value) => String(value).padStart(2, '0');

const toNumber = (value) => {
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const parseIsoDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
};

const toExcelDate = (value) => {
  const parts = parseIsoDate(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0);
};

const sanitizeFileName = (value) =>
  String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

const cloneStyle = (style) => JSON.parse(JSON.stringify(style || {}));

const solidFill = (argb) => ({
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb },
  bgColor: { argb },
});

const recolorCalendarBorder = (cell) => {
  const border = cloneStyle(cell.border);
  ['top', 'left', 'bottom', 'right'].forEach((side) => {
    const edge = border[side];
    if (!edge?.style) return;

    // 본문 입력줄을 나누는 흰색 선은 원본 그대로 유지합니다.
    const argb = String(edge.color?.argb || '').toUpperCase();
    if (argb === 'FFFFFFFF') return;
    border[side] = { ...edge, color: { argb: CALENDAR_COLORS.grid } };
  });
  cell.border = border;
};

const setCalendarCellColors = (cell, fillColor, fontColor) => {
  cell.fill = solidFill(fillColor);
  cell.font = {
    ...cloneStyle(cell.font),
    color: { argb: fontColor },
  };
  recolorCalendarBorder(cell);
};

const applyCalendarColors = ({ sheet, firstWeekday, daysInMonth }) => {
  // 제목과 요일 머리글은 원본의 진한 남색으로 고정합니다.
  for (let row = 2; row <= 3; row += 1) {
    for (let col = 2; col <= 15; col += 1) {
      setCalendarCellColors(
        sheet.getCell(row, col),
        CALENDAR_COLORS.header,
        'FFFFFFFF',
      );
    }
  }

  // 평일·주말·작성월 바깥 칸을 달력 배치에 맞춰 매번 다시 칠합니다.
  for (let week = 0; week < 6; week += 1) {
    const dateRow = 4 + week * 6;
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const slot = week * 7 + weekday;
      const day = slot - firstWeekday + 1;
      const isInMonth = day >= 1 && day <= daysInMonth;
      const isWeekend = weekday === 0 || weekday === 6;
      const fillColor = isInMonth
        ? (isWeekend ? CALENDAR_COLORS.weekend : CALENDAR_COLORS.weekday)
        : CALENDAR_COLORS.outsideMonth;
      const startCol = CALENDAR_COLUMNS[weekday];

      for (let rowOffset = 0; rowOffset < 6; rowOffset += 1) {
        const fontColor = rowOffset === 0
          ? CALENDAR_COLORS.dateText
          : CALENDAR_COLORS.bodyText;
        for (let colOffset = 0; colOffset < 2; colOffset += 1) {
          setCalendarCellColors(
            sheet.getCell(dateRow + rowOffset, startCol + colOffset),
            fillColor,
            fontColor,
          );
        }
      }
    }
  }
};

const groupToKorean = (value) => {
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const units = ['', '십', '백', '천'];
  let result = '';

  for (let position = 3; position >= 0; position -= 1) {
    const divisor = 10 ** position;
    const digit = Math.floor(value / divisor) % 10;
    if (!digit) continue;
    if (!(digit === 1 && position > 0)) result += digits[digit];
    result += units[position];
  }

  return result;
};

const numberToKorean = (value) => {
  const number = Math.max(0, Math.floor(toNumber(value)));
  if (number === 0) return '영';

  const bigUnits = ['', '만', '억', '조', '경'];
  let remaining = number;
  let unitIndex = 0;
  const parts = [];

  while (remaining > 0 && unitIndex < bigUnits.length) {
    const group = remaining % 10000;
    if (group) parts.unshift(`${groupToKorean(group)}${bigUnits[unitIndex]}`);
    remaining = Math.floor(remaining / 10000);
    unitIndex += 1;
  }

  return parts.join('');
};

const cleanRoutePlace = (value) =>
  String(value || '')
    .trim()
    .replace(/\s*영업소\s*$/u, '')
    .trim();

const sanitizeDistanceInput = (value) => {
  const cleaned = String(value ?? '')
    .replace(/,/g, '.')
    .replace(/[^0-9.]/g, '');
  const [whole = '', ...decimalParts] = cleaned.split('.');
  if (decimalParts.length === 0) return whole;
  const decimal = decimalParts.join('').slice(0, 1);
  return decimal ? `${whole || '0'}.${decimal}` : whole;
};

const getDistanceText = (item) => {
  const distance = sanitizeDistanceInput(item?.description);
  return distance ? `${distance}km` : '';
};

const buildRouteText = (item) => {
  const route = [cleanRoutePlace(item.origin), cleanRoutePlace(item.destination)]
    .filter(Boolean)
    .join('→');
  return [route || '이동', getDistanceText(item)].filter(Boolean).join(' ');
};

const getCalendarEntryText = (item) => {
  const label = CATEGORY_LABELS[item.category] || '기타';
  if (item.category === 'fuel') {
    return `${buildRouteText(item)}(유류비)`;
  }
  if (item.category === 'toll') {
    return `${buildRouteText(item)}(통행료)`;
  }
  return `${item.description || label}(${label})`;
};

const normalizeItems = (items) =>
  [...(items || [])]
    .map((item, index) => ({
      ...item,
      amount: toNumber(item.amount),
      sort_order: item.sort_order ?? index,
    }))
    .filter((item) => item.expense_date && item.amount > 0)
    .sort((first, second) => {
      const dateCompare = first.expense_date.localeCompare(second.expense_date);
      if (dateCompare !== 0) return dateCompare;
      return (first.sort_order || 0) - (second.sort_order || 0);
    });

const packCoverRows = (items) => {
  const groups = new Map();

  items.forEach((item) => {
    const key = item.expense_date;
    if (!groups.has(key)) groups.set(key, []);
    const rows = groups.get(key);
    const isRouteItem = item.category === 'fuel' || item.category === 'toll';
    let target = rows.find((row) => (
      !row[item.category]
      && (!isRouteItem || (!row.fuel && !row.toll))
    ));
    if (!target) {
      target = { expense_date: key };
      rows.push(target);
    }
    target[item.category] = item;
  });

  return [...groups.values()].flat();
};

const calculateTotals = (items) => {
  const totals = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0]));
  items.forEach((item) => {
    totals[item.category] = (totals[item.category] || 0) + toNumber(item.amount);
  });
  return totals;
};

const clearCells = (sheet, startRow, endRow, startCol, endCol) => {
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      sheet.getCell(row, col).value = null;
    }
  }
};

const setFormulaWithResult = (cell, formula, result) => {
  cell.value = { formula, result };
};

const populateCoverSheet = ({ sheet, month, claimDate, claimantName, items }) => {
  const coverRows = packCoverRows(items);
  if (coverRows.length > MAX_COVER_ROWS) {
    throw new Error(
      `갑지 양식에 표시할 행이 ${coverRows.length}개입니다. 현재 양식은 최대 ${MAX_COVER_ROWS}행까지 출력할 수 있습니다.`,
    );
  }

  const totals = calculateTotals(items);
  const grandTotal = Object.values(totals).reduce((sum, value) => sum + value, 0);

  clearCells(sheet, 8, 47, 1, 10);

  coverRows.forEach((rowData, index) => {
    const rowNumber = 8 + index;
    const dateCell = sheet.getCell(`A${rowNumber}`);
    dateCell.value = toExcelDate(rowData.expense_date);
    dateCell.numFmt = 'yyyy-mm-dd aaa';

    if (rowData.fuel) {
      sheet.getCell(`B${rowNumber}`).value = buildRouteText(rowData.fuel);
      sheet.getCell(`C${rowNumber}`).value = toNumber(rowData.fuel.amount);
    }
    if (rowData.toll) {
      sheet.getCell(`B${rowNumber}`).value = buildRouteText(rowData.toll);
      sheet.getCell(`D${rowNumber}`).value = null;
      sheet.getCell(`E${rowNumber}`).value = toNumber(rowData.toll.amount);
    }
    if (rowData.entertainment) sheet.getCell(`F${rowNumber}`).value = toNumber(rowData.entertainment.amount);
    if (rowData.lodging) sheet.getCell(`G${rowNumber}`).value = toNumber(rowData.lodging.amount);
    if (rowData.materials) sheet.getCell(`H${rowNumber}`).value = toNumber(rowData.materials.amount);
    if (rowData.shipping) sheet.getCell(`I${rowNumber}`).value = toNumber(rowData.shipping.amount);
    if (rowData.other) sheet.getCell(`J${rowNumber}`).value = toNumber(rowData.other.amount);
  });

  Object.entries(COVER_AMOUNT_COLUMNS).forEach(([category, column]) => {
    const result = totals[category] || 0;
    setFormulaWithResult(sheet.getCell(`${column}48`), `SUM(${column}8:${column}47)`, result);
  });

  setFormulaWithResult(sheet.getCell('J49'), 'SUM(B48:J48)', grandTotal);
  const amountText = `一      金: ${numberToKorean(grandTotal)} 원整.(\\${grandTotal.toLocaleString('ko-KR')} )`;
  sheet.getCell('A5').value = {
    formula: '="一      金: "&NUMBERSTRING(J49,1)&" 원整.(\\"&TEXT(J49,"###,##0") &" )"',
    result: amountText,
  };

  const claimDateCell = sheet.getCell('A53');
  claimDateCell.value = toExcelDate(claimDate);
  claimDateCell.numFmt = 'yyyy"년" m"월" d"일"';
  sheet.getCell('A54').value = `영 수 자   ${claimantName}`;
  sheet.pageSetup.printArea = 'A1:J54';
};

const normalizeCalendarLayout = (sheet) => {
  const longMerges = ['J25:K27', 'J31:K33'];
  longMerges.forEach((range) => {
    try {
      sheet.unMergeCells(range);
    } catch (error) {
      // 기존 양식의 병합 상태가 다르더라도 계속 진행합니다.
    }
  });

  // 6주차는 원본의 5주차 서식을 복사해 월 배치에 관계없이 사용할 수 있게 합니다.
  sheet.getRow(34).height = sheet.getRow(28).height;
  for (let col = 2; col <= 15; col += 1) {
    sheet.getCell(34, col).style = cloneStyle(sheet.getCell(28, col).style);
  }

  for (let offset = 0; offset < 5; offset += 1) {
    const sourceRow = 29 + offset;
    const targetRow = 35 + offset;
    sheet.getRow(targetRow).height = sheet.getRow(sourceRow).height;
    for (let col = 2; col <= 15; col += 1) {
      sheet.getCell(targetRow, col).style = cloneStyle(sheet.getCell(sourceRow, col).style);
    }
  }

  const contentRows = [];
  for (let week = 0; week < 6; week += 1) {
    const dateRow = 4 + week * 6;
    for (let offset = 1; offset <= 5; offset += 1) contentRows.push(dateRow + offset);
  }

  contentRows.forEach((row) => {
    CALENDAR_COLUMNS.forEach((col) => {
      const range = `${sheet.getColumn(col).letter}${row}:${sheet.getColumn(col + 1).letter}${row}`;
      try {
        sheet.unMergeCells(range);
      } catch (error) {
        // 이미 해제된 경우 무시합니다.
      }
      try {
        sheet.mergeCells(range);
      } catch (error) {
        // 동일 범위가 이미 병합된 경우 무시합니다.
      }
    });
  });
};

const updateCalendarInstructions = (sheet) => {
  const instructions = {
    Q4: '*작성방법',
    Q5: '1. 유류대 내용칸에는 출발지→도착지와 이동거리(km)를 작성',
    Q6: '2. 통행료 PDF 내역도 경로와 이동거리를 유류대 내용칸에 작성',
    Q7: '3. 영업소 표기와 도착시간은 사용내용에서 제외',
    Q8: '4. 접대비·식대는 참석자 등 사용내용 입력',
    Q9: '5. 자재·문구·기타는 구입 내용을 입력',
    Q11: '6. 관련된 모든 사용내역은 영수증 첨부',
    Q12: '7. 사용목적을 상세내역에 빠짐없이 작성',
    Q13: null,
    Q14: null,
  };

  Object.entries(instructions).forEach(([address, value]) => {
    sheet.getCell(address).value = value;
  });
};

const populateCalendarSheet = ({ sheet, month, items }) => {
  normalizeCalendarLayout(sheet);
  clearCells(sheet, 4, 39, 2, 15);

  const [year, monthNumber] = month.split('-').map(Number);
  sheet.getCell('F2').value = `~ ${year}.${pad(monthNumber)} ~`;

  const firstWeekday = new Date(year, monthNumber - 1, 1, 12, 0, 0).getDay();
  const daysInMonth = new Date(year, monthNumber, 0, 12, 0, 0).getDate();
  const weekCount = Math.ceil((firstWeekday + daysInMonth) / 7);
  for (let row = 34; row <= 39; row += 1) {
    sheet.getRow(row).hidden = weekCount < 6;
  }
  applyCalendarColors({ sheet, firstWeekday, daysInMonth });

  for (let day = 1; day <= daysInMonth; day += 1) {
    const offset = firstWeekday + day - 1;
    const week = Math.floor(offset / 7);
    const weekday = offset % 7;
    const dateRow = 4 + week * 6;
    const col = CALENDAR_COLUMNS[weekday];
    sheet.getCell(dateRow, col).value = day;
  }

  const entriesByDate = new Map();
  items.forEach((item) => {
    if (!entriesByDate.has(item.expense_date)) entriesByDate.set(item.expense_date, []);
    entriesByDate.get(item.expense_date).push(getCalendarEntryText(item));
  });

  entriesByDate.forEach((entries, dateValue) => {
    const parts = parseIsoDate(dateValue);
    if (!parts || parts.year !== year || parts.month !== monthNumber) return;

    const offset = firstWeekday + parts.day - 1;
    const week = Math.floor(offset / 7);
    const weekday = offset % 7;
    if (week > 5) return;
    const dateRow = 4 + week * 6;
    const col = CALENDAR_COLUMNS[weekday];

    entries.slice(0, 4).forEach((entry, index) => {
      const cell = sheet.getCell(dateRow + 1 + index, col);
      cell.value = entry;
      cell.alignment = { ...cell.alignment, vertical: 'middle', horizontal: 'left', wrapText: true };
    });

    if (entries.length >= 5) {
      const lastCell = sheet.getCell(dateRow + 5, col);
      lastCell.value = entries.slice(4).join('\n');
      lastCell.alignment = { ...lastCell.alignment, vertical: 'middle', horizontal: 'left', wrapText: true };
      if (entries.length > 5) sheet.getRow(dateRow + 5).height = Math.max(sheet.getRow(dateRow + 5).height || 12.75, 26);
    }
  });

  updateCalendarInstructions(sheet);
  sheet.pageSetup.printArea = weekCount === 6 ? 'B1:O39' : 'B1:O33';
};

const triggerDownload = (buffer, fileName) => {
  const blob = new Blob([buffer], { type: EXCEL_MIME });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
};

export async function downloadExpenseResolutionExcel({
  month,
  claimDate,
  claimantName,
  projectName,
  items,
}) {
  const normalizedItems = normalizeItems(items);
  if (!month || !/^\d{4}-\d{2}$/.test(month)) throw new Error('작성월을 확인해주세요.');
  if (!claimDate) throw new Error('청구일을 확인해주세요.');
  if (!claimantName?.trim()) throw new Error('영수자 이름을 확인해주세요.');
  if (normalizedItems.length === 0) throw new Error('출력할 사용내역이 없습니다.');

  const response = await fetch(TEMPLATE_URL, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`엑셀 양식 파일을 불러오지 못했습니다. (${response.status})`);
  }

  const excelJsModule = await import('exceljs');
  const ExcelJS = excelJsModule.default || excelJsModule;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  workbook.creator = claimantName.trim();
  workbook.lastModifiedBy = claimantName.trim();
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties = {
    ...(workbook.calcProperties || {}),
    fullCalcOnLoad: true,
    forceFullCalc: true,
    calcMode: 'auto',
  };

  const coverSheet = workbook.worksheets[0];
  const calendarSheet = workbook.worksheets[1];
  if (!coverSheet || !calendarSheet) throw new Error('지출결의서 엑셀 양식의 시트 구성을 확인해주세요.');

  const monthNumber = month.slice(5, 7);
  coverSheet.name = `(${monthNumber}월)갑지`;
  calendarSheet.name = `(${monthNumber}월)상세내역`;

  populateCoverSheet({
    sheet: coverSheet,
    month,
    claimDate,
    claimantName: claimantName.trim(),
    items: normalizedItems,
  });
  populateCalendarSheet({ sheet: calendarSheet, month, items: normalizedItems });

  const buffer = await workbook.xlsx.writeBuffer();
  const safeProjectName = sanitizeFileName(projectName) || '현장';
  const safeClaimantName = sanitizeFileName(claimantName) || '영수자';
  const fileName = `${month.slice(0, 4)}년_${monthNumber}월_지출결의서_${safeProjectName}_${safeClaimantName}.xlsx`;
  triggerDownload(buffer, fileName);
  return fileName;
}
