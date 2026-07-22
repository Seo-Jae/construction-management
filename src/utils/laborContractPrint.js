const CONTRACT_BACKGROUND_URL =
  '/templates/근로계약서_배경.svg';
const CONTRACT_FONT_REGULAR_URL =
  '/templates/fonts/NanumGothic-Regular.ttf';
const CONTRACT_FONT_BOLD_URL =
  '/templates/fonts/NanumGothic-Bold.ttf';
const PAGE_WIDTH = 595.303937;
const PAGE_HEIGHT = 841.889764;
const BASE_FONT_SIZE = 9.24;

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const normalizeFilePart = (value) =>
  String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_');

const formatKoreanDate = (value) => {
  const matched = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})/,
  );

  if (!matched) {
    return String(value || '');
  }

  return `${matched[1]}년 ${Number(matched[2])}월 ${Number(matched[3])}일`;
};

const getFittedFontSize = (
  value,
  maxWidth,
  fontSize = BASE_FONT_SIZE,
) => {
  const estimatedWidth = [...String(value || '')]
    .reduce(
      (total, character) =>
        total +
        (/^[\x00-\x7F]$/.test(character)
          ? fontSize * 0.55
          : fontSize),
      0,
    );

  if (!estimatedWidth || estimatedWidth <= maxWidth) {
    return fontSize;
  }

  return Math.max(
    7,
    fontSize * (maxWidth / estimatedWidth),
  );
};

const createText = ({
  value,
  x,
  y,
  anchor = 'middle',
  weight = 400,
  maxWidth = 200,
}) => {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  const fontSize = getFittedFontSize(
    text,
    maxWidth,
  );

  return [
    '<text',
    ` x="${x}"`,
    ` y="${y}"`,
    ` text-anchor="${anchor}"`,
    ' font-family="NanumGothic, Dotum, 돋움, sans-serif"',
    ` font-size="${fontSize.toFixed(3)}"`,
    ` font-weight="${weight}"`,
    ' fill="#000000"',
    '>',
    escapeHtml(text),
    '</text>',
  ].join('');
};

const buildFieldLayer = (
  projectName,
  worker,
) => {
  const name = String(worker.name || '').trim();
  const residentNumber = String(
    worker.residentNumber || '',
  ).trim();
  const address = String(worker.address || '').trim();
  const contractStart = formatKoreanDate(
    worker.contractStartDate,
  );
  const contractEnd = formatKoreanDate(
    worker.contractEndDate,
  );

  return [
    `<svg class="field-layer" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}" aria-hidden="true">`,
    createText({
      value: name,
      x: 210.624,
      y: 107.1,
      weight: 700,
      maxWidth: 116,
    }),
    createText({
      value: residentNumber,
      x: 483.849,
      y: 107.25,
      maxWidth: 104,
    }),
    createText({
      value: address,
      x: 158.581,
      y: 121.7,
      anchor: 'start',
      maxWidth: 408,
    }),
    createText({
      value: contractStart,
      x: 210.625,
      y: 167.75,
      maxWidth: 116,
    }),
    createText({
      value: contractEnd,
      x: 332.046,
      y: 167.75,
      maxWidth: 116,
    }),
    createText({
      value: projectName,
      x: 240.969,
      y: 207.65,
      maxWidth: 180,
    }),
    createText({
      value: name,
      x: 453.479,
      y: 661.75,
      maxWidth: 96,
    }),
    createText({
      value: name,
      x: 483.85,
      y: 720.3,
      maxWidth: 82,
    }),
    createText({
      value: contractStart,
      x: 297.48,
      y: 760.8,
      weight: 700,
      maxWidth: 170,
    }),
    createText({
      value: name,
      x: 453.479,
      y: 775.1,
      maxWidth: 82,
    }),
    '</svg>',
  ].join('');
};

const buildPage = (
  projectName,
  worker,
) => [
  `<section class="contract-page" aria-label="${escapeHtml(worker.name)} 근로계약서">`,
  `<img class="contract-background" src="${CONTRACT_BACKGROUND_URL}" alt="">`,
  buildFieldLayer(projectName, worker),
  '</section>',
].join('');

const buildPrintDocument = ({
  pages,
  fileName,
  batchId,
}) => `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(fileName.replace(/\.pdf$/i, ''))}</title>
  <style>
    @font-face {
      font-family: NanumGothic;
      src: url('${CONTRACT_FONT_REGULAR_URL}') format('truetype');
      font-weight: 400;
      font-style: normal;
      font-display: block;
    }
    @font-face {
      font-family: NanumGothic;
      src: url('${CONTRACT_FONT_BOLD_URL}') format('truetype');
      font-weight: 700;
      font-style: normal;
      font-display: block;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #e2e8f0; }
    body { font-family: NanumGothic, Dotum, 돋움, sans-serif; color: #000; }
    .print-toolbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px;
      background: #0f172a;
      color: #fff;
      font-size: 14px;
    }
    .print-toolbar button {
      border: 0;
      border-radius: 6px;
      padding: 9px 16px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .print-toolbar button:disabled {
      cursor: wait;
      opacity: 0.55;
    }
    .print-button { background: #2563eb; color: #fff; }
    .close-button { background: #e2e8f0; color: #0f172a; }
    .contract-page {
      position: relative;
      width: 210mm;
      height: 297mm;
      margin: 10px auto;
      overflow: hidden;
      background: #fff;
      page-break-after: always;
    }
    .contract-page:last-of-type { page-break-after: auto; }
    .contract-background,
    .field-layer {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
    }
    .field-layer { z-index: 2; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      html, body { background: #fff; }
      .print-toolbar { display: none !important; }
      .contract-page {
        width: 210mm;
        height: 297mm;
        margin: 0;
      }
    }
  </style>
</head>
<body>
  <div class="print-toolbar">
    <span id="load-status">계약서 원본 양식을 불러오는 중입니다.</span>
    <button id="print-button" class="print-button" type="button" onclick="window.print()" disabled>인쇄 / PDF 저장</button>
    <button class="close-button" type="button" onclick="disposeAndClose(false)">닫기 및 폐기</button>
  </div>
  ${pages.join('')}
  <script>
    let disposed = false;
    function disposeAndClose(printed) {
      if (disposed) return;
      disposed = true;
      try {
        if (window.opener) {
          window.opener.postMessage({
            type: 'labor-contract-print-closed',
            batchId: ${JSON.stringify(batchId)},
            printed: Boolean(printed),
          }, window.location.origin);
        }
      } catch (error) {
        console.error(error);
      }
      document.body.innerHTML = '<div style="padding:24px;font-family:sans-serif">계약서 임시 데이터가 폐기되었습니다.</div>';
      setTimeout(() => window.close(), 120);
    }
    async function preparePrint() {
      const images = Array.from(document.querySelectorAll('.contract-background'));
      try {
        await Promise.all([
          document.fonts ? document.fonts.ready : Promise.resolve(),
          ...images.map((item) => item.decode ? item.decode() : new Promise((resolve, reject) => {
            if (item.complete && item.naturalWidth > 0) return resolve();
            item.addEventListener('load', resolve, { once: true });
            item.addEventListener('error', reject, { once: true });
          })),
        ]);
        document.getElementById('load-status').textContent = '${pages.length}명 통합 계약서 · 원본 양식 준비 완료';
        document.getElementById('print-button').disabled = false;
      } catch (error) {
        document.getElementById('load-status').textContent = '원본 양식을 불러오지 못했습니다. 창을 닫고 다시 시도해주세요.';
      }
    }
    window.addEventListener('load', preparePrint);
    window.addEventListener('afterprint', () => disposeAndClose(true));
  </script>
</body>
</html>`;

export const createLaborContractPrintWindow = async ({
  workers,
  projectName,
  selectedMonth,
  batchId,
}) => {
  const printWindow = window.open(
    '',
    `labor_contract_${Date.now()}`,
    'popup=yes,width=1100,height=900,scrollbars=yes,resizable=yes',
  );

  if (!printWindow) {
    throw new Error(
      '인쇄창이 차단되었습니다. 브라우저 주소창의 팝업 차단을 해제한 뒤 다시 시도해주세요.',
    );
  }

  const fileName = [
    '근로계약서',
    normalizeFilePart(projectName),
    selectedMonth,
    `${workers.length}명`,
  ]
    .filter(Boolean)
    .join('_') + '.pdf';
  const pages = workers.map((worker) =>
    buildPage(
      projectName,
      worker,
    ),
  );

  try {
    printWindow.document.open();
    printWindow.document.write(
      buildPrintDocument({
        pages,
        fileName,
        batchId,
      }),
    );
    printWindow.document.close();
    printWindow.focus();

    return {
      count: workers.length,
      fileName,
    };
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
