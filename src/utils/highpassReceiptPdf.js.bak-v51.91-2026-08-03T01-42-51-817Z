const DATE_TIME_PATTERN = /(20\d{2})[-./](\d{1,2})[-./](\d{1,2})\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const AMOUNT_PATTERN = /금?\s*([0-9][0-9,]*)\s*원(?:정)?/;

const pad = (value) => String(value).padStart(2, '0');

const normalizeText = (value) =>
  String(value || '')
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, ' ')
    .replace(/\s+/g, '')
    .trim();

const cleanOutletName = (value) =>
  normalizeText(value)
    .replace(/^(한국도로공사|입구영업소|출구영업소|영업소|:)+/g, '')
    .replace(/\(\d+\)/g, '')
    .replace(/^[=:：]+|[=:：]+$/g, '')
    .trim();

const groupLines = (items, tolerance = 3.5) => {
  const lines = [];

  [...items]
    .sort((a, b) => a.top - b.top || a.x - b.x)
    .forEach((item) => {
      let line = lines.find((candidate) => Math.abs(candidate.top - item.top) <= tolerance);
      if (!line) {
        line = { top: item.top, items: [] };
        lines.push(line);
      }
      line.items.push(item);
      line.top = line.items.reduce((sum, current) => sum + current.top, 0) / line.items.length;
    });

  return lines
    .map((line) => {
      const sorted = [...line.items].sort((a, b) => a.x - b.x);
      return {
        top: line.top,
        items: sorted,
        text: sorted.map((item) => item.text).join(' '),
        compact: normalizeText(sorted.map((item) => item.text).join('')),
      };
    })
    .sort((a, b) => a.top - b.top);
};

const findNearLine = (lines, anchorTop, matcher, minOffset, maxOffset) =>
  lines.find((line) => {
    const offset = line.top - anchorTop;
    return offset >= minOffset && offset <= maxOffset && matcher(line.compact, line);
  });

const parseReceiptFromAnchor = ({ lines, anchorLine, pageNumber, columnIndex }) => {
  const dateTimeMatch = DATE_TIME_PATTERN.exec(anchorLine.compact);
  if (!dateTimeMatch) return null;

  const [, year, month, day, hour, minute, second = '00'] = dateTimeMatch;
  const expenseDate = `${year}-${pad(month)}-${pad(day)}`;
  const receiptTime = `${pad(hour)}:${pad(minute)}`;
  const receiptDateTime = `${expenseDate} ${receiptTime}:${pad(second)}`;

  const roadLine = findNearLine(
    lines,
    anchorLine.top,
    (text) => text.includes('한국도로공사'),
    -78,
    -25,
  );
  const entryLine = findNearLine(
    lines,
    anchorLine.top,
    (text) => text.includes('입구영업소'),
    -28,
    4,
  );
  const amountLine = findNearLine(
    lines,
    anchorLine.top,
    (text) => text.includes('영수금액') || AMOUNT_PATTERN.test(text),
    4,
    32,
  );

  const destination = cleanOutletName(
    roadLine?.compact.replace('한국도로공사', '') || '',
  );
  const entryPlaza = cleanOutletName(
    entryLine?.compact.replace('입구영업소', '') || '',
  );
  const amountMatch = AMOUNT_PATTERN.exec(amountLine?.compact || '');
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, '')) : 0;

  if (!destination || !amount) {
    return {
      invalid: true,
      pageNumber,
      columnIndex,
      receiptDateTime,
      destination,
      amount,
    };
  }

  return {
    receiptKey: `${receiptDateTime}|${destination}|${amount}`,
    expense_date: expenseDate,
    destination_time: receiptTime,
    destination,
    entry_plaza: entryPlaza,
    amount,
    receipt_datetime: receiptDateTime,
    page_number: pageNumber,
    column_number: columnIndex + 1,
  };
};

const loadPdfJs = async () => {
  const [pdfModule, workerModule] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.mjs?url'),
  ]);

  const pdfjs = pdfModule.default || pdfModule;
  if (pdfjs.GlobalWorkerOptions && workerModule.default) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  }
  return pdfjs;
};

export async function parseHiPlusReceiptPdf(file) {
  if (!file) throw new Error('PDF 파일을 선택해주세요.');
  if (file.type && file.type !== 'application/pdf' && !file.name?.toLowerCase().endsWith('.pdf')) {
    throw new Error('PDF 파일만 업로드할 수 있습니다.');
  }

  const pdfjs = await loadPdfJs();
  const source = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data: source });
  const pdf = await loadingTask.promise;
  const receipts = [];
  const warnings = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent();
      const columnWidth = viewport.width / 3;
      const columns = [[], [], []];

      textContent.items.forEach((item) => {
        const text = String(item.str || '').trim();
        if (!text) return;
        const x = Number(item.transform?.[4] || 0);
        const baselineY = Number(item.transform?.[5] || 0);
        const top = viewport.height - baselineY;
        const centerX = x + Number(item.width || 0) / 2;
        const columnIndex = Math.max(0, Math.min(2, Math.floor(centerX / columnWidth)));
        columns[columnIndex].push({ text, x, top });
      });

      columns.forEach((columnItems, columnIndex) => {
        const lines = groupLines(columnItems);
        const anchors = lines.filter(
          (line) => line.compact.includes('영수일시') && DATE_TIME_PATTERN.test(line.compact),
        );

        anchors.forEach((anchorLine) => {
          const receipt = parseReceiptFromAnchor({ lines, anchorLine, pageNumber, columnIndex });
          if (!receipt) return;
          if (receipt.invalid) {
            warnings.push(
              `${pageNumber}페이지 ${columnIndex + 1}열의 영수증 일부 정보를 읽지 못했습니다.`,
            );
            return;
          }
          receipts.push(receipt);
        });
      });
    }
  } finally {
    await loadingTask.destroy();
  }

  const unique = [];
  const seen = new Set();
  receipts
    .sort((a, b) => a.receipt_datetime.localeCompare(b.receipt_datetime))
    .forEach((receipt) => {
      if (seen.has(receipt.receiptKey)) return;
      seen.add(receipt.receiptKey);
      unique.push(receipt);
    });

  if (unique.length === 0) {
    throw new Error(
      'SM하이플러스 확인증 정보를 찾지 못했습니다. 문자 선택이 가능한 하이플러스 PDF인지 확인해주세요.',
    );
  }

  return {
    receipts: unique,
    warnings,
    pageCount: pdf.numPages,
  };
}
