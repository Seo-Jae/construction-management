import { normalizeTechnicalAnnotations } from './technicalImageAnnotations';

export const DEFAULT_TECHNICAL_SHEET_LAYOUT = Object.freeze({
  columns: 2,
  footerHeight: 190,
  fontSize: 18,
  rowGap: 5,
  columnGap: 34,
  boxLeft: 5,
  boxTop: 10,
  boxWidth: 90,
  showDescription: false,
});

const clampNumber = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export const normalizeTechnicalSheetLayout = (value) => {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  return {
    columns: Math.round(clampNumber(
      source.columns,
      1,
      4,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.columns,
    )),
    footerHeight: Math.round(clampNumber(
      source.footerHeight,
      100,
      360,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.footerHeight,
    )),
    fontSize: Math.round(clampNumber(
      source.fontSize,
      11,
      30,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.fontSize,
    )),
    rowGap: Math.round(clampNumber(
      source.rowGap,
      0,
      24,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.rowGap,
    )),
    columnGap: Math.round(clampNumber(
      source.columnGap,
      0,
      80,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.columnGap,
    )),
    boxLeft: clampNumber(
      source.boxLeft,
      0,
      35,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.boxLeft,
    ),
    boxTop: clampNumber(
      source.boxTop,
      0,
      65,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.boxTop,
    ),
    boxWidth: clampNumber(
      source.boxWidth,
      45,
      100,
      DEFAULT_TECHNICAL_SHEET_LAYOUT.boxWidth,
    ),
    showDescription: source.showDescription === true,
  };
};

const escapeHtml = (value) => String(value || '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

const serializeForInlineScript = (value) => JSON.stringify(value)
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029');

const createSessionId = () => (
  globalThis.crypto?.randomUUID?.() ||
  `sheet-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const getPopupGeometry = ({ widthRatio = 0.9, heightRatio = 0.94 } = {}) => {
  const availableWidth = window.screen?.availWidth || window.innerWidth || 1440;
  const availableHeight = window.screen?.availHeight || window.innerHeight || 900;
  const width = Math.max(900, Math.min(1800, Math.floor(availableWidth * widthRatio)));
  const height = Math.max(680, Math.min(1200, Math.floor(availableHeight * heightRatio)));
  return {
    width,
    height,
    left: Math.max(0, Math.floor((availableWidth - width) / 2)),
    top: Math.max(0, Math.floor((availableHeight - height) / 2)),
  };
};

const openPopup = (name, geometry) => window.open(
  '',
  name,
  [
    'popup=yes',
    `width=${geometry.width}`,
    `height=${geometry.height}`,
    `left=${geometry.left}`,
    `top=${geometry.top}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(','),
);

const getSharedPopupScript = () => String.raw`
      function esc(value) {
        return String(value || '').replace(/[&<>\"']/g, function (char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char];
        });
      }

      function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value) || 0));
      }

      function getStartSide(item) {
        var requested = String(item.leaderStart || 'auto');
        if (requested !== 'auto') return requested;
        var dx = Number(item.targetX) - Number(item.labelX);
        var dy = Number(item.targetY) - Number(item.labelY);
        if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right';
        return dy < 0 ? 'top' : 'bottom';
      }

      function getLeaderPoints(item) {
        var labelX = Number(item.labelX);
        var labelY = Number(item.labelY);
        var targetX = Number(item.targetX);
        var targetY = Number(item.targetY);
        var side = getStartSide(item);
        var angle = [30, 60, 90].indexOf(Number(item.leaderAngle)) >= 0
          ? Number(item.leaderAngle)
          : 90;
        var startX = labelX;
        var startY = labelY;
        var edge = 1.15;

        if (side === 'left') startX -= edge;
        if (side === 'right') startX += edge;
        if (side === 'top') startY -= edge;
        if (side === 'bottom') startY += edge;

        var elbowX = startX;
        var elbowY = startY;

        if (angle === 90) {
          if (side === 'left' || side === 'right') {
            elbowX = targetX;
            elbowY = startY;
          } else {
            elbowX = startX;
            elbowY = targetY;
          }
        } else {
          var radians = angle * Math.PI / 180;
          if (side === 'left' || side === 'right') {
            var verticalDistance = Math.abs(targetY - startY);
            var horizontalOffset = verticalDistance / Math.tan(radians);
            var horizontalDirection = targetX >= startX ? 1 : -1;
            elbowX = targetX - (horizontalDirection * horizontalOffset);
            elbowY = startY;
          } else {
            var horizontalDistance = Math.abs(targetX - startX);
            var verticalOffset = horizontalDistance * Math.tan(radians);
            var verticalDirection = targetY >= startY ? 1 : -1;
            elbowX = startX;
            elbowY = targetY - (verticalDirection * verticalOffset);
          }
        }

        return [
          clamp(startX, 0, 100) + ',' + clamp(startY, 0, 100),
          clamp(elbowX, 0, 100) + ',' + clamp(elbowY, 0, 100),
          clamp(targetX, 0, 100) + ',' + clamp(targetY, 0, 100)
        ].join(' ');
      }

      function buildColumnGroups(items, columnCount) {
        var columns = Math.max(1, Math.min(4, Number(columnCount) || 2));
        var rowsPerColumn = Math.max(1, Math.ceil(items.length / columns));
        var groups = [];
        for (var columnIndex = 0; columnIndex < columns; columnIndex += 1) {
          groups.push(items.slice(
            columnIndex * rowsPerColumn,
            (columnIndex + 1) * rowsPerColumn
          ));
        }
        return groups;
      }
`;

const viewerHtml = ({ imageUrl, title, annotations, layout }) => {
  const safeImageUrl = escapeHtml(imageUrl);
  const safeTitle = escapeHtml(title);
  const annotationJson = serializeForInlineScript(normalizeTechnicalAnnotations(annotations));
  const layoutJson = serializeForInlineScript(normalizeTechnicalSheetLayout(layout));

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>기술자료 · ${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; font-family: Arial, "Malgun Gothic", sans-serif; color: #111827; }
    body { display: flex; flex-direction: column; overflow: hidden; background: #e2e8f0; }
    .toolbar { height: 58px; min-height: 58px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; background: #fff; border-bottom: 1px solid #cbd5e1; }
    .title-wrap { min-width: 0; flex: 1; }
    .title { font-size: 15px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { margin-top: 3px; color: #64748b; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button { height: 32px; padding: 0 11px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; font-size: 12px; font-weight: 800; cursor: pointer; }
    button:hover { background: #f8fafc; }
    .viewer { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 16px; background: #0f172a; }
    .sheet { background: #fff; box-shadow: 0 12px 36px rgba(0,0,0,.34); }
    .sheet.fit { width: min(1120px, calc(100vw - 36px)); }
    .sheet.original { width: max-content; }
    .image-stage { position: relative; width: 100%; line-height: 0; background: #fff; }
    .sheet.fit .image-stage img { display: block; width: 100%; height: auto; }
    .sheet.original .image-stage img { display: block; width: auto; height: auto; max-width: none; max-height: none; }
    .leader-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    .leader-line { stroke: #2563eb; stroke-width: .78; vector-effect: non-scaling-stroke; fill: none; opacity: .82; transition: stroke-width .12s ease, opacity .12s ease; }
    .leader-line.dimmed { opacity: .22; }
    .leader-line.active { stroke: #2563eb; stroke-width: 1.65; opacity: 1; }
    .target-dot { position: absolute; width: 5px; height: 5px; border-radius: 50%; transform: translate(-50%,-50%); background: #2563eb; pointer-events: none; opacity: .82; }
    .target-dot.active { width: 8px; height: 8px; opacity: 1; }
    .number-marker { position: absolute; width: 25px; height: 25px; transform: translate(-50%,-50%); border: 1.8px solid #2563eb; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #2563eb; font-family: "Arial Narrow", Arial, "Malgun Gothic", sans-serif; font-size: 12px; font-weight: 800; line-height: 1; cursor: default; transition: transform .12s ease, border-width .12s ease, box-shadow .12s ease; }
    .number-marker.active { transform: translate(-50%,-50%) scale(1.12); border-width: 2.6px; box-shadow: 0 0 0 4px rgba(37,99,235,.14); z-index: 10; }
    .number-marker.dimmed { opacity: .3; }
    .footer { position: relative; width: 100%; height: var(--footer-height); background: #fff; overflow: hidden; }
    .caption-box { position: absolute; left: var(--box-left); top: var(--box-top); width: var(--box-width); display: grid; grid-template-columns: repeat(var(--columns), minmax(0,1fr)); column-gap: var(--column-gap); align-items: start; }
    .caption-column { min-width: 0; display: flex; flex-direction: column; gap: var(--row-gap); }
    .caption-item { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr); align-items: start; gap: .35em; cursor: default; font-family: "Arial Narrow", "Roboto Condensed", Arial, "Malgun Gothic", sans-serif; font-stretch: condensed; font-size: var(--font-size); font-weight: 700; line-height: 1.18; letter-spacing: -.025em; color: #111; }
    .caption-number { min-width: 1.55em; text-align: right; white-space: nowrap; }
    .caption-name { min-width: 0; overflow-wrap: anywhere; }
    .caption-desc { grid-column: 2; margin-top: 1px; color: #475569; font-family: Arial, "Malgun Gothic", sans-serif; font-size: .64em; font-weight: 500; line-height: 1.25; letter-spacing: 0; white-space: pre-wrap; }
    .caption-item.active { text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 3px; }
    .caption-item.dimmed { opacity: .26; }
    .empty-caption { color: #94a3b8; font-size: 12px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title-wrap">
      <div class="title">기술자료 상세보기</div>
      <div class="sub">${safeTitle} · 지시선과 하단 부재명은 시스템에서 작성된 기술자료입니다.</div>
    </div>
    <button id="fitButton" type="button">화면 맞춤</button>
    <button id="originalButton" type="button">원본 크기</button>
    <button id="closeButton" type="button">닫기</button>
  </div>
  <div class="viewer" id="viewer">
    <div class="sheet fit" id="sheet">
      <div class="image-stage" id="imageStage">
        <img id="technicalImage" src="${safeImageUrl}" alt="${safeTitle}" />
        <svg class="leader-layer" id="leaderLayer" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
        <div id="overlayLayer"></div>
      </div>
      <div class="footer" id="footer">
        <div class="caption-box" id="captionBox"></div>
      </div>
    </div>
  </div>
  <script>
    (function () {
      var annotations = ${annotationJson};
      var layout = ${layoutJson};
      var activeId = '';
      var sheet = document.getElementById('sheet');
      var leaderLayer = document.getElementById('leaderLayer');
      var overlayLayer = document.getElementById('overlayLayer');
      var captionBox = document.getElementById('captionBox');
      var technicalImage = document.getElementById('technicalImage');
${getSharedPopupScript()}

      function applyLayout() {
        document.getElementById('footer').style.setProperty('--footer-height', layout.footerHeight + 'px');
        document.getElementById('footer').style.height = layout.footerHeight + 'px';
        captionBox.style.setProperty('--columns', layout.columns);
        captionBox.style.setProperty('--font-size', layout.fontSize + 'px');
        captionBox.style.setProperty('--row-gap', layout.rowGap + 'px');
        captionBox.style.setProperty('--column-gap', layout.columnGap + 'px');
        captionBox.style.setProperty('--box-left', layout.boxLeft + '%');
        captionBox.style.setProperty('--box-top', layout.boxTop + '%');
        captionBox.style.setProperty('--box-width', layout.boxWidth + '%');
      }

      function setActive(id) {
        activeId = id || '';
        renderOverlay();
        renderCaption();
      }

      function renderOverlay() {
        leaderLayer.innerHTML = annotations.map(function (item) {
          var active = !activeId || activeId === item.id;
          return '<polyline class="leader-line ' + (activeId ? (active ? 'active' : 'dimmed') : '') + '" points="' + getLeaderPoints(item) + '" />';
        }).join('');

        overlayLayer.innerHTML = annotations.map(function (item) {
          var active = !activeId || activeId === item.id;
          var stateClass = activeId ? (active ? 'active' : 'dimmed') : '';
          return '<div class="target-dot ' + (activeId && active ? 'active' : '') + '" style="left:' + item.targetX + '%;top:' + item.targetY + '%"></div>' +
            '<div class="number-marker ' + stateClass + '" data-id="' + esc(item.id) + '" style="left:' + item.labelX + '%;top:' + item.labelY + '%">' + esc(item.symbol) + '</div>';
        }).join('');

        Array.prototype.forEach.call(overlayLayer.querySelectorAll('.number-marker'), function (element) {
          element.addEventListener('mouseenter', function () { setActive(element.getAttribute('data-id')); });
          element.addEventListener('mouseleave', function () { setActive(''); });
        });
      }

      function renderCaption() {
        if (!annotations.length) {
          captionBox.innerHTML = '<div class="empty-caption">등록된 하단 부재명이 없습니다.</div>';
          return;
        }
        var groups = buildColumnGroups(annotations, layout.columns);
        captionBox.innerHTML = groups.map(function (group) {
          return '<div class="caption-column">' + group.map(function (item) {
            var active = !activeId || activeId === item.id;
            var stateClass = activeId ? (active ? 'active' : 'dimmed') : '';
            return '<div class="caption-item ' + stateClass + '" data-id="' + esc(item.id) + '">' +
              '<span class="caption-number">' + esc(item.symbol) + '.</span>' +
              '<span class="caption-name">' + esc(item.title || '명칭 미입력') + '</span>' +
              (layout.showDescription && item.description
                ? '<span class="caption-desc">' + esc(item.description) + '</span>'
                : '') +
              '</div>';
          }).join('') + '</div>';
        }).join('');

        Array.prototype.forEach.call(captionBox.querySelectorAll('.caption-item'), function (element) {
          element.addEventListener('mouseenter', function () { setActive(element.getAttribute('data-id')); });
          element.addEventListener('mouseleave', function () { setActive(''); });
        });
      }

      document.getElementById('fitButton').addEventListener('click', function () {
        sheet.className = 'sheet fit';
        sheet.style.width = '';
      });
      document.getElementById('originalButton').addEventListener('click', function () {
        sheet.className = 'sheet original';
        if (technicalImage.naturalWidth) sheet.style.width = technicalImage.naturalWidth + 'px';
      });
      document.getElementById('closeButton').addEventListener('click', function () { window.close(); });

      applyLayout();
      renderOverlay();
      renderCaption();
    }());
  </script>
</body>
</html>`;
};

export const openTechnicalSheetViewerWindow = ({
  imageUrl,
  title = '기술자료',
  annotations = [],
  layout = DEFAULT_TECHNICAL_SHEET_LAYOUT,
}) => {
  const normalizedUrl = String(imageUrl || '').trim();
  if (!normalizedUrl) return null;

  const popup = openPopup(
    'unitPriceTechnicalSheetPreview',
    getPopupGeometry({ widthRatio: 0.86, heightRatio: 0.92 }),
  );
  if (!popup) return null;

  popup.document.open();
  popup.document.write(viewerHtml({
    imageUrl: normalizedUrl,
    title,
    annotations,
    layout,
  }));
  popup.document.close();
  popup.focus();
  return popup;
};

const editorHtml = ({ imageUrl, title, annotations, layout, sessionId }) => {
  const safeImageUrl = escapeHtml(imageUrl);
  const safeTitle = escapeHtml(title);
  const annotationJson = serializeForInlineScript(normalizeTechnicalAnnotations(annotations));
  const layoutJson = serializeForInlineScript(normalizeTechnicalSheetLayout(layout));
  const safeSessionId = serializeForInlineScript(sessionId);

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>기술자료 편집 · ${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; font-family: Arial, "Malgun Gothic", sans-serif; color: #0f172a; }
    body { overflow: hidden; background: #e2e8f0; }
    button, input, textarea, select { font: inherit; }
    button { min-height: 32px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; font-size: 12px; font-weight: 800; cursor: pointer; }
    button:hover:not(:disabled) { background: #f8fafc; }
    button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
    button.danger { color: #b91c1c; border-color: #fecaca; }
    button:disabled { opacity: .45; cursor: default; }
    .app { width: 100%; height: 100%; display: flex; flex-direction: column; }
    .toolbar { min-height: 62px; padding: 8px 10px; display: flex; align-items: center; gap: 6px; background: #fff; border-bottom: 1px solid #cbd5e1; }
    .title-wrap { flex: 1; min-width: 0; margin-right: 8px; }
    .title { font-size: 14px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { margin-top: 3px; color: #64748b; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) 390px; }
    .viewer { min-width: 0; min-height: 0; overflow: auto; display: grid; place-items: start center; padding: 14px; background: #0f172a; }
    .sheet { width: min(1020px, calc(100vw - 440px)); background: #fff; box-shadow: 0 12px 36px rgba(0,0,0,.34); }
    .image-stage { position: relative; width: 100%; line-height: 0; background: #fff; cursor: crosshair; }
    .image-stage img { display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; }
    .leader-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    .leader-line { stroke: #111827; stroke-width: .7; vector-effect: non-scaling-stroke; fill: none; opacity: .72; }
    .leader-line.selected { stroke: #2563eb; stroke-width: 1.5; opacity: 1; }
    .target { position: absolute; width: 11px; height: 11px; border-radius: 50%; transform: translate(-50%,-50%); border: 2px solid #fff; background: #111827; box-shadow: 0 1px 4px rgba(0,0,0,.45); cursor: move; z-index: 5; }
    .target.selected { width: 17px; height: 17px; background: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.18), 0 1px 4px rgba(0,0,0,.45); }
    .number-marker { position: absolute; width: 27px; height: 27px; transform: translate(-50%,-50%); border: 2px solid #111827; border-radius: 50%; display: grid; place-items: center; background: #fff; color: #111827; font-family: "Arial Narrow", Arial, "Malgun Gothic", sans-serif; font-size: 12px; font-weight: 800; line-height: 1; cursor: move; z-index: 5; }
    .number-marker.selected { width: 31px; height: 31px; border-color: #2563eb; color: #2563eb; box-shadow: 0 0 0 4px rgba(37,99,235,.14); z-index: 9; }
    .footer { position: relative; width: 100%; height: var(--footer-height); background: #fff; overflow: hidden; border-top: 1px dashed #cbd5e1; }
    .caption-box { position: absolute; left: var(--box-left); top: var(--box-top); width: var(--box-width); display: grid; grid-template-columns: repeat(var(--columns), minmax(0,1fr)); column-gap: var(--column-gap); align-items: start; border: 1px dashed #94a3b8; padding: 4px; }
    .caption-box::before { content: "하단 설명 박스 · VIEW에서는 테두리 숨김"; position: absolute; top: -15px; left: 0; color: #64748b; background: rgba(255,255,255,.94); padding: 0 4px; font-size: 9px; line-height: 14px; }
    .caption-column { min-width: 0; display: flex; flex-direction: column; gap: var(--row-gap); }
    .caption-item { min-width: 0; display: grid; grid-template-columns: auto minmax(0,1fr); align-items: start; gap: .35em; font-family: "Arial Narrow", "Roboto Condensed", Arial, "Malgun Gothic", sans-serif; font-stretch: condensed; font-size: var(--font-size); font-weight: 700; line-height: 1.18; letter-spacing: -.025em; color: #111; cursor: pointer; }
    .caption-item.selected { color: #2563eb; }
    .caption-number { min-width: 1.55em; text-align: right; white-space: nowrap; }
    .caption-name { min-width: 0; overflow-wrap: anywhere; }
    .caption-desc { grid-column: 2; margin-top: 1px; color: #475569; font-family: Arial, "Malgun Gothic", sans-serif; font-size: .64em; font-weight: 500; line-height: 1.25; letter-spacing: 0; white-space: pre-wrap; }
    .panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #fff; border-left: 1px solid #cbd5e1; }
    .panel-scroll { min-height: 0; overflow: auto; }
    .status { min-height: 46px; padding: 8px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .status strong { display: block; font-size: 11px; }
    .status span { display: block; margin-top: 2px; color: #64748b; font-size: 10px; line-height: 1.35; }
    .section { padding: 10px; border-bottom: 1px solid #e2e8f0; }
    .section-title { margin-bottom: 8px; color: #0f172a; font-size: 11px; font-weight: 900; }
    .fields { display: grid; gap: 8px; }
    .field label { display: block; margin-bottom: 3px; color: #475569; font-size: 10px; font-weight: 800; }
    .field input[type="text"], .field input[type="number"], .field textarea, .field select { width: 100%; border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 7px; color: #0f172a; background: #fff; font-size: 11px; outline: none; }
    .field input:focus, .field textarea:focus, .field select:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.12); }
    .field textarea { min-height: 54px; resize: vertical; }
    .field-row { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 8px; }
    .field-row.three { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .check-row { display: flex; align-items: center; gap: 6px; min-height: 28px; font-size: 10px; font-weight: 800; color: #475569; }
    .list-head { padding: 8px 10px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e2e8f0; }
    .list-head strong { flex: 1; font-size: 11px; }
    .list { max-height: 260px; overflow: auto; padding: 6px; }
    .item { margin-bottom: 5px; padding: 7px; display: grid; grid-template-columns: 26px minmax(0,1fr); gap: 6px; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; }
    .item:hover { background: #f8fafc; }
    .item.selected { border-color: #2563eb; background: #eff6ff; }
    .item-symbol { width: 23px; height: 23px; border: 1.5px solid #111827; border-radius: 50%; display: grid; place-items: center; color: #111827; background: #fff; font-size: 10px; font-weight: 900; }
    .item.selected .item-symbol { border-color: #2563eb; color: #2563eb; }
    .item-name { font-size: 10px; font-weight: 900; line-height: 1.3; }
    .item-desc { margin-top: 2px; color: #64748b; font-size: 9px; line-height: 1.3; white-space: pre-wrap; }
    .empty { padding: 16px 8px; color: #94a3b8; font-size: 10px; text-align: center; line-height: 1.5; }
    .unsaved { color: #b45309; font-weight: 900; }
    @media (max-width: 1150px) { .main { grid-template-columns: minmax(0,1fr) 350px; } .sheet { width: min(900px, calc(100vw - 400px)); } }
  </style>
</head>
<body>
  <div class="app">
    <div class="toolbar">
      <div class="title-wrap">
        <div class="title">기술자료 편집기 v2 · ${safeTitle}</div>
        <div class="sub">원본 이미지는 깨끗한 도식만 사용하고, 지시선·번호·하단 부재명은 시스템에서 작성합니다.</div>
      </div>
      <button id="addButton" type="button">+ 지시선 추가</button>
      <button id="deleteButton" type="button" class="danger">선택 삭제</button>
      <button id="upButton" type="button">↑</button>
      <button id="downButton" type="button">↓</button>
      <button id="saveButton" type="button" class="primary">저장</button>
      <button id="closeButton" type="button">닫기</button>
    </div>
    <div class="main">
      <div class="viewer">
        <div class="sheet" id="sheet">
          <div class="image-stage" id="imageStage">
            <img id="technicalImage" src="${safeImageUrl}" alt="${safeTitle}" />
            <svg class="leader-layer" id="leaderLayer" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
            <div id="overlayLayer"></div>
          </div>
          <div class="footer" id="footer">
            <div class="caption-box" id="captionBox"></div>
          </div>
        </div>
      </div>
      <aside class="panel">
        <div class="status" id="statusBox"></div>
        <div class="panel-scroll">
          <div class="section">
            <div class="section-title">지시선 · 번호 · 부재명</div>
            <div class="fields">
              <div class="field-row">
                <div class="field">
                  <label for="symbolInput">번호/기호</label>
                  <input id="symbolInput" type="text" maxlength="8" placeholder="1" />
                </div>
                <div class="field">
                  <label for="leaderAngleInput">지시선 각도</label>
                  <select id="leaderAngleInput">
                    <option value="90">90° 직교</option>
                    <option value="60">60°</option>
                    <option value="30">30°</option>
                  </select>
                </div>
              </div>
              <div class="field">
                <label for="leaderStartInput">지시선 시작 위치</label>
                <select id="leaderStartInput">
                  <option value="auto">자동</option>
                  <option value="left">번호 왼쪽</option>
                  <option value="right">번호 오른쪽</option>
                  <option value="top">번호 위</option>
                  <option value="bottom">번호 아래</option>
                </select>
              </div>
              <div class="field">
                <label for="titleInput">하단 부재명</label>
                <input id="titleInput" type="text" maxlength="160" placeholder="예: CARRYING CHANNEL (38×12×1.2t)" />
              </div>
              <div class="field">
                <label for="descriptionInput">추가 설명 (선택)</label>
                <textarea id="descriptionInput" maxlength="500" placeholder="필요한 경우에만 작성합니다. 기본 VIEW에서는 숨김입니다."></textarea>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">하단 설명 박스</div>
            <div class="fields">
              <div class="field-row three">
                <div class="field">
                  <label for="columnsInput">열 수</label>
                  <select id="columnsInput">
                    <option value="1">1열</option>
                    <option value="2">2열</option>
                    <option value="3">3열</option>
                    <option value="4">4열</option>
                  </select>
                </div>
                <div class="field">
                  <label for="fontSizeInput">글자 크기</label>
                  <input id="fontSizeInput" type="number" min="11" max="30" step="1" />
                </div>
                <div class="field">
                  <label for="footerHeightInput">영역 높이</label>
                  <input id="footerHeightInput" type="number" min="100" max="360" step="10" />
                </div>
              </div>
              <div class="field-row">
                <div class="field">
                  <label for="rowGapInput">줄 간격</label>
                  <input id="rowGapInput" type="number" min="0" max="24" step="1" />
                </div>
                <div class="field">
                  <label for="columnGapInput">열 간격</label>
                  <input id="columnGapInput" type="number" min="0" max="80" step="2" />
                </div>
              </div>
              <div class="field-row three">
                <div class="field">
                  <label for="boxLeftInput">왼쪽 위치 %</label>
                  <input id="boxLeftInput" type="number" min="0" max="35" step="1" />
                </div>
                <div class="field">
                  <label for="boxTopInput">위쪽 위치 %</label>
                  <input id="boxTopInput" type="number" min="0" max="65" step="1" />
                </div>
                <div class="field">
                  <label for="boxWidthInput">박스 너비 %</label>
                  <input id="boxWidthInput" type="number" min="45" max="100" step="1" />
                </div>
              </div>
              <label class="check-row">
                <input id="showDescriptionInput" type="checkbox" />
                VIEW에서 추가 설명도 함께 표시
              </label>
            </div>
          </div>

          <div class="list-head">
            <strong>등록 항목 <span id="countText">0</span></strong>
            <span class="unsaved" id="dirtyText"></span>
          </div>
          <div class="list" id="itemList"></div>
        </div>
      </aside>
    </div>
  </div>
  <script>
    (function () {
      var annotations = ${annotationJson};
      var layout = ${layoutJson};
      var sessionId = ${safeSessionId};
      var selectedId = annotations[0] ? annotations[0].id : '';
      var addStep = '';
      var pendingTarget = null;
      var dragState = null;
      var dirty = false;

      var imageStage = document.getElementById('imageStage');
      var leaderLayer = document.getElementById('leaderLayer');
      var overlayLayer = document.getElementById('overlayLayer');
      var captionBox = document.getElementById('captionBox');
      var footer = document.getElementById('footer');
      var itemList = document.getElementById('itemList');
      var statusBox = document.getElementById('statusBox');
      var symbolInput = document.getElementById('symbolInput');
      var titleInput = document.getElementById('titleInput');
      var descriptionInput = document.getElementById('descriptionInput');
      var leaderAngleInput = document.getElementById('leaderAngleInput');
      var leaderStartInput = document.getElementById('leaderStartInput');

      var columnsInput = document.getElementById('columnsInput');
      var fontSizeInput = document.getElementById('fontSizeInput');
      var footerHeightInput = document.getElementById('footerHeightInput');
      var rowGapInput = document.getElementById('rowGapInput');
      var columnGapInput = document.getElementById('columnGapInput');
      var boxLeftInput = document.getElementById('boxLeftInput');
      var boxTopInput = document.getElementById('boxTopInput');
      var boxWidthInput = document.getElementById('boxWidthInput');
      var showDescriptionInput = document.getElementById('showDescriptionInput');

${getSharedPopupScript()}

      function createId() {
        return (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : 'annotation-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      }

      function current() {
        return annotations.find(function (item) { return item.id === selectedId; }) || null;
      }

      function markDirty() {
        dirty = true;
        document.getElementById('dirtyText').textContent = '저장 필요';
      }

      function pointFromEvent(event) {
        var rect = imageStage.getBoundingClientRect();
        return {
          x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
          y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
        };
      }

      function reindex() {
        annotations = annotations.map(function (item, index) {
          return Object.assign({}, item, { sortOrder: index });
        });
      }

      function select(id) {
        selectedId = id || '';
        render();
      }

      function renderStatus() {
        var selected = current();
        if (addStep === 'target') {
          statusBox.innerHTML = '<strong>① 부재 위치를 클릭하세요.</strong><span>지시선이 가리킬 실제 부재·접합부를 클릭합니다.</span>';
        } else if (addStep === 'label') {
          statusBox.innerHTML = '<strong>② 번호 위치를 클릭하세요.</strong><span>도면에 표시할 번호 원의 위치를 클릭하면 90° 직교 지시선이 생성됩니다.</span>';
        } else if (selected) {
          statusBox.innerHTML = '<strong>' + esc(selected.symbol) + '. ' + esc(selected.title || '부재명 미입력') + '</strong><span>번호 또는 끝점을 드래그해 위치를 조정하고, 하단 설명 박스에서 최종 VIEW 형태를 맞춥니다.</span>';
        } else {
          statusBox.innerHTML = '<strong>지시선을 추가하거나 항목을 선택하세요.</strong><span>색상 구분 없이 실제 기술자료와 유사한 흑백 VIEW로 저장됩니다.</span>';
        }
      }

      function renderFields() {
        var item = current();
        var disabled = !item;
        symbolInput.disabled = disabled;
        titleInput.disabled = disabled;
        descriptionInput.disabled = disabled;
        leaderAngleInput.disabled = disabled;
        leaderStartInput.disabled = disabled;

        symbolInput.value = item ? item.symbol : '';
        titleInput.value = item ? item.title : '';
        descriptionInput.value = item ? item.description : '';
        leaderAngleInput.value = item ? String(item.leaderAngle || 90) : '90';
        leaderStartInput.value = item ? String(item.leaderStart || 'auto') : 'auto';

        columnsInput.value = String(layout.columns);
        fontSizeInput.value = String(layout.fontSize);
        footerHeightInput.value = String(layout.footerHeight);
        rowGapInput.value = String(layout.rowGap);
        columnGapInput.value = String(layout.columnGap);
        boxLeftInput.value = String(layout.boxLeft);
        boxTopInput.value = String(layout.boxTop);
        boxWidthInput.value = String(layout.boxWidth);
        showDescriptionInput.checked = layout.showDescription === true;
      }

      function applyLayout() {
        footer.style.height = layout.footerHeight + 'px';
        footer.style.setProperty('--footer-height', layout.footerHeight + 'px');
        captionBox.style.setProperty('--columns', layout.columns);
        captionBox.style.setProperty('--font-size', layout.fontSize + 'px');
        captionBox.style.setProperty('--row-gap', layout.rowGap + 'px');
        captionBox.style.setProperty('--column-gap', layout.columnGap + 'px');
        captionBox.style.setProperty('--box-left', layout.boxLeft + '%');
        captionBox.style.setProperty('--box-top', layout.boxTop + '%');
        captionBox.style.setProperty('--box-width', layout.boxWidth + '%');
      }

      function renderOverlay() {
        leaderLayer.innerHTML = annotations.map(function (item) {
          return '<polyline class="leader-line ' + (item.id === selectedId ? 'selected' : '') + '" points="' + getLeaderPoints(item) + '" />';
        }).join('');

        overlayLayer.innerHTML = annotations.map(function (item) {
          var selected = item.id === selectedId ? 'selected' : '';
          return '<div class="target ' + selected + '" data-id="' + esc(item.id) + '" data-kind="target" style="left:' + item.targetX + '%;top:' + item.targetY + '%"></div>' +
            '<div class="number-marker ' + selected + '" data-id="' + esc(item.id) + '" data-kind="label" style="left:' + item.labelX + '%;top:' + item.labelY + '%">' + esc(item.symbol) + '</div>';
        }).join('');

        Array.prototype.forEach.call(overlayLayer.querySelectorAll('[data-id]'), function (element) {
          element.addEventListener('pointerdown', function (event) {
            event.preventDefault();
            event.stopPropagation();
            var id = element.getAttribute('data-id');
            selectedId = id;
            dragState = { id: id, kind: element.getAttribute('data-kind') };
            renderStatus();
            renderFields();
            renderList();
            renderCaption();
          });
        });
      }

      function renderCaption() {
        applyLayout();
        if (!annotations.length) {
          captionBox.innerHTML = '<div class="empty">등록된 하단 부재명이 없습니다.</div>';
          return;
        }
        var groups = buildColumnGroups(annotations, layout.columns);
        captionBox.innerHTML = groups.map(function (group) {
          return '<div class="caption-column">' + group.map(function (item) {
            var selected = item.id === selectedId ? 'selected' : '';
            return '<div class="caption-item ' + selected + '" data-id="' + esc(item.id) + '">' +
              '<span class="caption-number">' + esc(item.symbol) + '.</span>' +
              '<span class="caption-name">' + esc(item.title || '부재명 미입력') + '</span>' +
              (layout.showDescription && item.description
                ? '<span class="caption-desc">' + esc(item.description) + '</span>'
                : '') +
              '</div>';
          }).join('') + '</div>';
        }).join('');

        Array.prototype.forEach.call(captionBox.querySelectorAll('.caption-item'), function (element) {
          element.addEventListener('click', function () {
            select(element.getAttribute('data-id'));
          });
        });
      }

      function renderList() {
        document.getElementById('countText').textContent = String(annotations.length);
        if (!annotations.length) {
          itemList.innerHTML = '<div class="empty">아직 등록된 항목이 없습니다.<br/>상단 “+ 지시선 추가”로 시작하세요.</div>';
          return;
        }
        itemList.innerHTML = annotations.map(function (item) {
          var selected = item.id === selectedId ? 'selected' : '';
          return '<div class="item ' + selected + '" data-id="' + esc(item.id) + '">' +
            '<div class="item-symbol">' + esc(item.symbol) + '</div>' +
            '<div><div class="item-name">' + esc(item.title || '부재명 미입력') + '</div>' +
            (item.description ? '<div class="item-desc">' + esc(item.description) + '</div>' : '') +
            '</div></div>';
        }).join('');

        Array.prototype.forEach.call(itemList.querySelectorAll('.item'), function (element) {
          element.addEventListener('click', function () {
            select(element.getAttribute('data-id'));
          });
        });
      }

      function renderButtons() {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        document.getElementById('deleteButton').disabled = index < 0;
        document.getElementById('upButton').disabled = index <= 0;
        document.getElementById('downButton').disabled = index < 0 || index >= annotations.length - 1;
      }

      function render() {
        renderStatus();
        renderFields();
        renderOverlay();
        renderCaption();
        renderList();
        renderButtons();
      }

      function updateSelected(field, value) {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index < 0) return;
        var patch = {};
        patch[field] = value;
        annotations[index] = Object.assign({}, annotations[index], patch);
        markDirty();
        renderOverlay();
        renderCaption();
        renderList();
        renderStatus();
      }

      function updateLayout(field, value) {
        layout[field] = value;
        markDirty();
        renderCaption();
      }

      document.getElementById('addButton').addEventListener('click', function () {
        addStep = 'target';
        pendingTarget = null;
        renderStatus();
      });

      imageStage.addEventListener('click', function (event) {
        if (!addStep) return;
        if (event.target.closest && event.target.closest('[data-id]')) return;
        var point = pointFromEvent(event);

        if (addStep === 'target') {
          pendingTarget = point;
          addStep = 'label';
          renderStatus();
          return;
        }

        if (addStep === 'label' && pendingTarget) {
          var nextNumber = annotations.length + 1;
          var item = {
            id: createId(),
            symbol: String(nextNumber),
            title: '',
            description: '',
            color: '#111111',
            leaderAngle: 90,
            leaderStart: 'auto',
            labelDirection: 'right',
            targetX: pendingTarget.x,
            targetY: pendingTarget.y,
            labelX: point.x,
            labelY: point.y,
            sortOrder: annotations.length
          };
          annotations.push(item);
          selectedId = item.id;
          addStep = '';
          pendingTarget = null;
          markDirty();
          render();
          titleInput.focus();
        }
      });

      window.addEventListener('pointermove', function (event) {
        if (!dragState) return;
        var point = pointFromEvent(event);
        var index = annotations.findIndex(function (item) { return item.id === dragState.id; });
        if (index < 0) return;

        if (dragState.kind === 'target') {
          annotations[index] = Object.assign({}, annotations[index], {
            targetX: point.x,
            targetY: point.y
          });
        } else {
          annotations[index] = Object.assign({}, annotations[index], {
            labelX: point.x,
            labelY: point.y
          });
        }

        markDirty();
        renderOverlay();
      });

      window.addEventListener('pointerup', function () {
        if (!dragState) return;
        dragState = null;
        renderCaption();
      });

      symbolInput.addEventListener('input', function () { updateSelected('symbol', symbolInput.value); });
      titleInput.addEventListener('input', function () { updateSelected('title', titleInput.value); });
      descriptionInput.addEventListener('input', function () { updateSelected('description', descriptionInput.value); });
      leaderAngleInput.addEventListener('change', function () { updateSelected('leaderAngle', Number(leaderAngleInput.value) || 90); });
      leaderStartInput.addEventListener('change', function () { updateSelected('leaderStart', leaderStartInput.value); });

      columnsInput.addEventListener('change', function () { updateLayout('columns', Number(columnsInput.value) || 2); });
      fontSizeInput.addEventListener('input', function () { updateLayout('fontSize', clamp(fontSizeInput.value, 11, 30)); });
      footerHeightInput.addEventListener('input', function () { updateLayout('footerHeight', clamp(footerHeightInput.value, 100, 360)); });
      rowGapInput.addEventListener('input', function () { updateLayout('rowGap', clamp(rowGapInput.value, 0, 24)); });
      columnGapInput.addEventListener('input', function () { updateLayout('columnGap', clamp(columnGapInput.value, 0, 80)); });
      boxLeftInput.addEventListener('input', function () { updateLayout('boxLeft', clamp(boxLeftInput.value, 0, 35)); });
      boxTopInput.addEventListener('input', function () { updateLayout('boxTop', clamp(boxTopInput.value, 0, 65)); });
      boxWidthInput.addEventListener('input', function () { updateLayout('boxWidth', clamp(boxWidthInput.value, 45, 100)); });
      showDescriptionInput.addEventListener('change', function () { updateLayout('showDescription', showDescriptionInput.checked); });

      document.getElementById('deleteButton').addEventListener('click', function () {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index < 0) return;
        annotations.splice(index, 1);
        reindex();
        selectedId = annotations[Math.min(index, annotations.length - 1)]?.id || '';
        markDirty();
        render();
      });

      document.getElementById('upButton').addEventListener('click', function () {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index <= 0) return;
        var temp = annotations[index - 1];
        annotations[index - 1] = annotations[index];
        annotations[index] = temp;
        reindex();
        markDirty();
        render();
      });

      document.getElementById('downButton').addEventListener('click', function () {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index < 0 || index >= annotations.length - 1) return;
        var temp = annotations[index + 1];
        annotations[index + 1] = annotations[index];
        annotations[index] = temp;
        reindex();
        markDirty();
        render();
      });

      document.getElementById('saveButton').addEventListener('click', function () {
        reindex();
        if (!window.opener || window.opener.closed) {
          window.alert('원래 일위대가 화면을 찾을 수 없습니다. 일위대가 화면을 닫지 않은 상태에서 저장해주세요.');
          return;
        }

        window.opener.postMessage({
          type: 'unit-price-technical-sheet-save',
          sessionId: sessionId,
          annotations: annotations,
          layout: layout
        }, '*');

        dirty = false;
        document.getElementById('dirtyText').textContent = '저장 요청됨';
      });

      document.getElementById('closeButton').addEventListener('click', function () {
        if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 편집 창을 닫을까요?')) return;
        window.close();
      });

      window.addEventListener('beforeunload', function (event) {
        if (!dirty) return;
        event.preventDefault();
        event.returnValue = '';
      });

      render();
    }());
  </script>
</body>
</html>`;
};

export const openTechnicalSheetEditorWindow = ({
  imageUrl,
  title = '기술자료',
  annotations = [],
  layout = DEFAULT_TECHNICAL_SHEET_LAYOUT,
}) => {
  const normalizedUrl = String(imageUrl || '').trim();
  if (!normalizedUrl) {
    return Promise.resolve({ opened: false, saved: false, reason: 'missing-image' });
  }

  const geometry = getPopupGeometry({ widthRatio: 0.94, heightRatio: 0.96 });
  const popup = openPopup('unitPriceTechnicalSheetEditor', geometry);
  if (!popup) {
    return Promise.resolve({ opened: false, saved: false, reason: 'blocked' });
  }

  const sessionId = createSessionId();
  popup.document.open();
  popup.document.write(editorHtml({
    imageUrl: normalizedUrl,
    title,
    annotations,
    layout,
    sessionId,
  }));
  popup.document.close();
  popup.focus();

  return new Promise((resolve) => {
    let finished = false;

    const cleanup = () => {
      window.removeEventListener('message', handleMessage);
      window.clearInterval(closeWatcher);
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    const handleMessage = (event) => {
      if (event.source !== popup) return;
      if (event.data?.type !== 'unit-price-technical-sheet-save') return;
      if (event.data?.sessionId !== sessionId) return;

      finish({
        opened: true,
        saved: true,
        annotations: normalizeTechnicalAnnotations(event.data.annotations),
        layout: normalizeTechnicalSheetLayout(event.data.layout),
        popup,
      });
    };

    window.addEventListener('message', handleMessage);

    const closeWatcher = window.setInterval(() => {
      if (popup.closed) {
        finish({ opened: true, saved: false, reason: 'closed' });
      }
    }, 500);
  });
};
