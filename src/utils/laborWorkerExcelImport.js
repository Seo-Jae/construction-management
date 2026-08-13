const normalizeText = (value) =>
  String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const digitsOnly = (value) =>
  String(value ?? '').replace(/\D/g, '');

const getCellText = (sheet, row, column) => {
  const cell = sheet.getCell(row, column);
  return normalizeText(
    cell?.text ??
      cell?.value ??
      '',
  );
};

const normalizeHeader = (value) =>
  normalizeText(value)
    .replace(/\s+/g, '')
    .toLowerCase();

const validateTemplate = (sheet) => {
  const expected = [
    [3, 1, '순서'],
    [3, 2, '직종'],
    [3, 3, '성명'],
    [3, 4, '내/외국인'],
    [3, 5, '주민등록번호'],
    [4, 5, '연락처'],
    [4, 6, '은행명'],
    [4, 7, '예금주'],
    [4, 8, '계좌번호'],
  ];

  const failed = expected.filter(
    ([row, column, label]) =>
      !normalizeHeader(
        getCellText(
          sheet,
          row,
          column,
        ),
      ).includes(
        normalizeHeader(label),
      ),
  );

  if (failed.length > 0) {
    throw new Error(
      '욱림건설 노무비명세서 A:H 양식을 확인할 수 없습니다. ' +
        '3~4행의 순서·직종·성명·내/외국인·주민등록번호·연락처·은행명·예금주·계좌번호 형식을 확인해주세요.',
    );
  }
};

const normalizeDomesticForeign = (value) => {
  const text = normalizeText(value)
    .replace(/\s+/g, '')
    .toLowerCase();

  if (
    text === '내국인' ||
    text === '내국' ||
    text === 'domestic' ||
    text === 'korean'
  ) {
    return '내국인';
  }

  if (
    text === '외국인' ||
    text === '외국' ||
    text === 'foreign' ||
    text === 'foreigner'
  ) {
    return '외국인';
  }

  return normalizeText(value);
};

export const maskIdentityNumber = (value) => {
  const digits = digitsOnly(value);
  if (digits.length !== 13) {
    return value ? '형식확인필요' : '-';
  }

  return `${digits.slice(0, 6)}-*******`;
};

export const maskPhoneNumber = (value) => {
  const digits = digitsOnly(value);
  if (digits.length < 4) {
    return '-';
  }

  return `****${digits.slice(-4)}`;
};

export const maskAccountNumber = (value) => {
  const digits = digitsOnly(value);
  if (digits.length < 4) {
    return '-';
  }

  return `****${digits.slice(-4)}`;
};

export async function parseLaborWorkerExcelFile(file) {
  if (!file) {
    throw new Error('Excel 파일을 선택해주세요.');
  }

  const module = await import('exceljs');
  const ExcelJS = module.default || module;
  const workbook = new ExcelJS.Workbook();

  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];

  if (!sheet) {
    throw new Error('Excel 첫 번째 시트를 찾을 수 없습니다.');
  }

  validateTemplate(sheet);

  const rows = [];
  const lastRow = Math.max(
    5,
    sheet.actualRowCount ||
      sheet.rowCount ||
      5,
  );

  // 회사 양식은 1명당 2행입니다.
  // 5/6행 = 1번, 7/8행 = 2번 ...
  // 시스템 이관에서는 A:H만 읽고 I:AV는 읽지 않습니다.
  for (
    let topRow = 5;
    topRow <= lastRow;
    topRow += 2
  ) {
    const bottomRow = topRow + 1;
    const nameKo = getCellText(
      sheet,
      topRow,
      3,
    );

    if (!nameKo) {
      continue;
    }

    const normalizedName =
      normalizeText(nameKo)
        .replace(/\s+/g, '');

    if (
      ['소계', '합계', '총계', '계'].includes(
        normalizedName,
      )
    ) {
      continue;
    }

    const domesticForeign =
      normalizeDomesticForeign(
        getCellText(
          sheet,
          topRow,
          4,
        ),
      );

    // 실제 근로자 행은 D열이 반드시 '내국인' 또는 '외국인'입니다.
    // 소계/합계/총계처럼 A:H가 병합된 요약행은 ExcelJS에서
    // 병합영역의 값이 C/D열에도 보일 수 있으므로 이 단계에서 제외합니다.
    if (
      domesticForeign !== '내국인' &&
      domesticForeign !== '외국인'
    ) {
      continue;
    }

    const residentNo = digitsOnly(
      getCellText(
        sheet,
        topRow,
        5,
      ),
    );

    const fullPhone = digitsOnly(
      getCellText(
        sheet,
        bottomRow,
        5,
      ),
    );

    const accountNumber = digitsOnly(
      getCellText(
        sheet,
        topRow,
        8,
      ),
    );

    rows.push({
      source_row: topRow,
      sequence: getCellText(
        sheet,
        topRow,
        1,
      ),
      recent_trade: getCellText(
        sheet,
        topRow,
        2,
      ),
      name_ko: nameKo,
      english_name: getCellText(
        sheet,
        bottomRow,
        3,
      ),
      domestic_foreign:
        domesticForeign,
      stay_status: getCellText(
        sheet,
        bottomRow,
        4,
      ),
      resident_no: residentNo,
      phone_number: fullPhone,
      bank_name: getCellText(
        sheet,
        topRow,
        6,
      ),
      account_holder: getCellText(
        sheet,
        topRow,
        7,
      ),
      english_account_holder:
        getCellText(
          sheet,
          bottomRow,
          7,
        ),
      account_number:
        accountNumber,
      nationality:
        domesticForeign === '내국인'
          ? '대한민국'
          : '',
      include: true,
    });
  }

  if (rows.length === 0) {
    throw new Error(
      'A:H 영역에서 등록할 근로자를 찾지 못했습니다. 성명이 입력된 행을 확인해주세요.',
    );
  }

  // JSON serializable boolean correction for browser.
  return rows.map((row) => ({
    ...row,
    include: true,
  }));
}
