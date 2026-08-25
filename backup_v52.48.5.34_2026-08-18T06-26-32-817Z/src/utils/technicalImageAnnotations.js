const ANNOTATION_COLORS = [
  '#dc2626',
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#be123c',
  '#4f46e5',
];

const clampPercent = (value, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(100, parsed));
};

const sanitizeColor = (value, fallback) => {
  const normalized = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
};

// v52.48.5.33 지시선 각도 / 시작위치 / 명칭 방향
const normalizeLeaderAngle = (value) => {
  const parsed = Number(value);
  return [30, 60, 90].includes(parsed) ? parsed : 90;
};

const normalizeLeaderStart = (value) => (
  ['auto', 'left', 'right', 'top', 'bottom'].includes(String(value || ''))
    ? String(value)
    : 'auto'
);

const normalizeLabelDirection = (value, labelX = 50) => {
  const normalized = String(value || '').trim();
  if (normalized === 'left' || normalized === 'right') return normalized;
  return Number(labelX) <= 50 ? 'right' : 'left';
};

const createAnnotationId = () => (
  globalThis.crypto?.randomUUID?.() ||
  `tech-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

export const normalizeTechnicalAnnotations = (value) => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, 100)
    .map((item, index) => {
      const fallbackColor = ANNOTATION_COLORS[index % ANNOTATION_COLORS.length];
      return {
        id: String(item?.id || createAnnotationId()),
        symbol: String(item?.symbol ?? index + 1).trim() || String(index + 1),
        title: String(item?.title || '').trim(),
        description: String(item?.description || '').trim(),
        color: sanitizeColor(item?.color, fallbackColor),
        leaderAngle: normalizeLeaderAngle(item?.leaderAngle),
        leaderStart: normalizeLeaderStart(item?.leaderStart),
        labelDirection: normalizeLabelDirection(
          item?.labelDirection,
          clampPercent(item?.labelX, 20),
        ),
        targetX: clampPercent(item?.targetX, 50),
        targetY: clampPercent(item?.targetY, 50),
        labelX: clampPercent(item?.labelX, 20),
        labelY: clampPercent(item?.labelY, 20),
        sortOrder: Number.isFinite(Number(item?.sortOrder))
          ? Number(item.sortOrder)
          : index,
      };
    })
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((item, index) => ({ ...item, sortOrder: index }));
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

const getPopupGeometry = ({ widthRatio = 0.82, heightRatio = 0.9 } = {}) => {
  const availableWidth = window.screen?.availWidth || window.innerWidth || 1440;
  const availableHeight = window.screen?.availHeight || window.innerHeight || 900;
  const width = Math.max(820, Math.min(1680, Math.floor(availableWidth * widthRatio)));
  const height = Math.max(650, Math.min(1160, Math.floor(availableHeight * heightRatio)));
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

const viewerHtml = ({ imageUrl, title, annotations }) => {
  const safeImageUrl = escapeHtml(imageUrl);
  const safeTitle = escapeHtml(title);
  const annotationJson = serializeForInlineScript(normalizeTechnicalAnnotations(annotations));

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>기술자료 · ${safeTitle}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; font-family: Arial, "Malgun Gothic", sans-serif; color: #0f172a; }
    body { display: flex; flex-direction: column; overflow: hidden; background: #e2e8f0; }
    .toolbar { height: 58px; min-height: 58px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; background: #fff; border-bottom: 1px solid #cbd5e1; }
    .title-wrap { min-width: 0; flex: 1; }
    .title { font-size: 15px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sub { margin-top: 3px; color: #64748b; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    button { height: 32px; padding: 0 11px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: #334155; font-size: 12px; font-weight: 800; cursor: pointer; }
    button:hover { background: #f8fafc; }
    .content { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .viewer { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 14px; background: #0f172a; }
    .image-wrap { min-width: 100%; min-height: 100%; display: grid; place-items: center; }
    .stage { position: relative; display: inline-block; line-height: 0; background: #fff; box-shadow: 0 12px 36px rgba(0,0,0,.32); }
    .stage.fit img { display: block; max-width: calc(100vw - 32px); max-height: calc(100vh - 300px); width: auto; height: auto; object-fit: contain; }
    .stage.original img { display: block; max-width: none; max-height: none; width: auto; height: auto; }
    .leader-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
    .leader-line { stroke-width: 0.45; vector-effect: non-scaling-stroke; transition: stroke-width .12s ease, opacity .12s ease; }
    .leader-line.dimmed { opacity: .28; }
    .leader-line.active { stroke-width: 1.2; opacity: 1; }
    .target-highlight { position: absolute; width: 18px; height: 18px; border-radius: 50%; transform: translate(-50%,-50%); border: 3px solid var(--color); background: color-mix(in srgb, var(--color) 18%, transparent); opacity: .35; pointer-events: none; transition: width .12s ease, height .12s ease, opacity .12s ease, box-shadow .12s ease; }
    .target-highlight.active { width: 34px; height: 34px; opacity: 1; box-shadow: 0 0 0 7px color-mix(in srgb, var(--color) 20%, transparent); }
    .annotation-label { position: absolute; display: flex; align-items: center; gap: 6px; max-width: 42%; line-height: 1.15; cursor: default; pointer-events: auto; filter: drop-shadow(0 1px 1px rgba(255,255,255,.9)); }
    .annotation-label.dimmed { opacity: .36; }
    .annotation-label.active { opacity: 1; z-index: 10; }
    .symbol { width: 26px; height: 26px; min-width: 26px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--color); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); font-size: 12px; font-weight: 900; line-height: 1; }
    .label-text { padding: 3px 5px; border-radius: 4px; color: #111827; background: rgba(255,255,255,.86); border: 1px solid rgba(148,163,184,.75); font-size: 11px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .annotation-label.active .label-text { border-color: var(--color); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color) 18%, transparent); }
    .legend { flex: 0 0 auto; max-height: 210px; overflow: auto; background: #fff; border-top: 1px solid #cbd5e1; }
    .legend-head { position: sticky; top: 0; z-index: 2; padding: 8px 12px; display: flex; align-items: center; gap: 8px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .legend-title { font-size: 12px; font-weight: 900; }
    .legend-help { color: #64748b; font-size: 10px; }
    .legend-list { display: grid; grid-template-columns: repeat(auto-fit,minmax(260px,1fr)); gap: 6px; padding: 8px; }
    .legend-item { min-height: 48px; padding: 6px 8px; display: grid; grid-template-columns: 28px minmax(0,1fr); gap: 7px; align-items: start; border: 1px solid #e2e8f0; border-radius: 7px; background: #fff; cursor: default; transition: border-color .12s ease, background .12s ease, transform .12s ease; }
    .legend-item:hover, .legend-item.active { border-color: var(--color); background: color-mix(in srgb, var(--color) 7%, white); transform: translateY(-1px); }
    .legend-symbol { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--color); font-size: 11px; font-weight: 900; }
    .legend-name { font-size: 11px; font-weight: 900; line-height: 1.3; }
    .legend-desc { margin-top: 2px; color: #64748b; font-size: 10px; line-height: 1.35; white-space: pre-wrap; }
    .empty { padding: 12px; color: #94a3b8; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="title-wrap">
      <div class="title">기술자료 상세보기</div>
      <div class="sub">${safeTitle} · 일위대가 화면과 나란히 열어두고 부재 위치·지시선을 함께 확인할 수 있습니다.</div>
    </div>
    <button id="fitButton" type="button">화면 맞춤</button>
    <button id="originalButton" type="button">원본 크기</button>
    <button id="closeButton" type="button">닫기</button>
  </div>
  <div class="content">
    <div class="viewer" id="viewer">
      <div class="image-wrap">
        <div class="stage fit" id="stage">
          <img id="technicalImage" src="${safeImageUrl}" alt="${safeTitle}" />
          <svg class="leader-layer" id="leaderLayer" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
          <div id="overlayLayer"></div>
        </div>
      </div>
    </div>
    <div class="legend">
      <div class="legend-head">
        <div class="legend-title">기술자료 항목</div>
        <div class="legend-help">항목에 마우스를 올리면 이미지의 지시선과 해당 위치가 강조됩니다.</div>
      </div>
      <div class="legend-list" id="legendList"></div>
    </div>
  </div>
  <script>
    (function () {
      var annotations = ${annotationJson};
      var stage = document.getElementById('stage');
      var leaderLayer = document.getElementById('leaderLayer');
      var overlayLayer = document.getElementById('overlayLayer');
      var legendList = document.getElementById('legendList');
      var viewer = document.getElementById('viewer');
      var activeId = '';

      function esc(value) {
        return String(value || '').replace(/[&<>\"']/g, function (char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' })[char];
        });
      }

      function setActive(id) {
        activeId = id || '';
        renderOverlay();
        renderLegend();
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
        var edge = 1.35;

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

        function clampPoint(value) { return Math.max(0, Math.min(100, value)); }
        return [
          clampPoint(startX) + ',' + clampPoint(startY),
          clampPoint(elbowX) + ',' + clampPoint(elbowY),
          clampPoint(targetX) + ',' + clampPoint(targetY)
        ].join(' ');
      }

      function getLabelStyle(item) {
        var direction = item.labelDirection === 'left' ? 'left' : 'right';
        return direction === 'left'
          ? 'transform:translate(calc(-100% + 13px),-50%);flex-direction:row-reverse;'
          : 'transform:translate(-13px,-50%);flex-direction:row;';
      }

      function renderOverlay() {
        leaderLayer.innerHTML = annotations.map(function (item) {
          var active = !activeId || activeId === item.id;
          return '<polyline class="leader-line ' + (activeId ? (active ? 'active' : 'dimmed') : '') + '" data-id="' + esc(item.id) + '" points="' + getLeaderPoints(item) + '" fill="none" stroke="' + esc(item.color) + '" />';
        }).join('');

        overlayLayer.innerHTML = annotations.map(function (item) {
          var active = !activeId || activeId === item.id;
          var stateClass = activeId ? (active ? 'active' : 'dimmed') : '';
          var title = item.title || '명칭 미입력';
          return '<div class="target-highlight ' + (activeId && active ? 'active' : '') + '" style="left:' + item.targetX + '%;top:' + item.targetY + '%;--color:' + esc(item.color) + '"></div>' +
            '<div class="annotation-label ' + stateClass + '" data-id="' + esc(item.id) + '" style="left:' + item.labelX + '%;top:' + item.labelY + '%;--color:' + esc(item.color) + ';' + getLabelStyle(item) + '">' +
              '<span class="symbol">' + esc(item.symbol) + '</span>' +
              '<span class="label-text">' + esc(title) + '</span>' +
            '</div>';
        }).join('');

        Array.prototype.forEach.call(overlayLayer.querySelectorAll('.annotation-label'), function (element) {
          element.addEventListener('mouseenter', function () { setActive(element.getAttribute('data-id')); });
          element.addEventListener('mouseleave', function () { setActive(''); });
        });
      }

      function renderLegend() {
        if (!annotations.length) {
          legendList.innerHTML = '<div class="empty">등록된 지시선·명칭이 없습니다.</div>';
          return;
        }
        legendList.innerHTML = annotations.map(function (item) {
          var title = item.title || '명칭 미입력';
          var active = activeId === item.id;
          return '<div class="legend-item ' + (active ? 'active' : '') + '" data-id="' + esc(item.id) + '" style="--color:' + esc(item.color) + '">' +
            '<div class="legend-symbol">' + esc(item.symbol) + '</div>' +
            '<div><div class="legend-name">' + esc(title) + '</div>' +
            (item.description ? '<div class="legend-desc">' + esc(item.description) + '</div>' : '') + '</div></div>';
        }).join('');
        Array.prototype.forEach.call(legendList.querySelectorAll('.legend-item'), function (element) {
          element.addEventListener('mouseenter', function () { setActive(element.getAttribute('data-id')); });
          element.addEventListener('mouseleave', function () { setActive(''); });
        });
      }

      document.getElementById('fitButton').addEventListener('click', function () {
        stage.className = 'stage fit';
        viewer.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      });
      document.getElementById('originalButton').addEventListener('click', function () {
        stage.className = 'stage original';
      });
      document.getElementById('closeButton').addEventListener('click', function () { window.close(); });

      renderOverlay();
      renderLegend();
    }());
  </script>
</body>
</html>`;
};

export const openTechnicalImageViewerWindow = ({
  imageUrl,
  title = '기술자료',
  annotations = [],
}) => {
  const normalizedUrl = String(imageUrl || '').trim();
  if (!normalizedUrl) return null;

  const popup = openPopup(
    'unitPriceTechnicalImagePreview',
    getPopupGeometry({ widthRatio: 0.82, heightRatio: 0.9 }),
  );
  if (!popup) return null;

  popup.document.open();
  popup.document.write(viewerHtml({
    imageUrl: normalizedUrl,
    title,
    annotations,
  }));
  popup.document.close();
  popup.focus();
  return popup;
};

const editorHtml = ({ imageUrl, title, annotations, sessionId }) => {
  const safeImageUrl = escapeHtml(imageUrl);
  const safeTitle = escapeHtml(title);
  const annotationJson = serializeForInlineScript(normalizeTechnicalAnnotations(annotations));
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
    .main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0,1fr) 350px; }
    .viewer { min-width: 0; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 14px; background: #0f172a; }
    .stage { position: relative; display: inline-block; line-height: 0; background: #fff; box-shadow: 0 12px 36px rgba(0,0,0,.32); cursor: crosshair; }
    .stage img { display: block; max-width: calc(100vw - 392px); max-height: calc(100vh - 92px); width: auto; height: auto; user-select: none; -webkit-user-drag: none; }
    .leader-layer { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
    .leader-line { stroke-width: .5; vector-effect: non-scaling-stroke; opacity: .72; }
    .leader-line.selected { stroke-width: 1.3; opacity: 1; }
    .target { position: absolute; width: 16px; height: 16px; border-radius: 50%; transform: translate(-50%,-50%); border: 3px solid #fff; background: var(--color); box-shadow: 0 1px 5px rgba(0,0,0,.45); cursor: move; line-height: 1; z-index: 5; }
    .target.selected { width: 22px; height: 22px; box-shadow: 0 0 0 5px color-mix(in srgb, var(--color) 25%, transparent), 0 1px 5px rgba(0,0,0,.45); }
    .annotation-label { position: absolute; display: flex; align-items: center; gap: 5px; max-width: 44%; cursor: move; line-height: 1.1; z-index: 4; }
    .annotation-label.selected { z-index: 8; }
    .symbol { width: 27px; height: 27px; min-width: 27px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--color); border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.45); font-size: 12px; font-weight: 900; }
    .label-text { padding: 3px 5px; border-radius: 4px; color: #111827; background: rgba(255,255,255,.9); border: 1px solid #cbd5e1; font-size: 11px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .annotation-label.selected .label-text { border-color: var(--color); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color) 18%, transparent); }
    .panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: #fff; border-left: 1px solid #cbd5e1; }
    .status { min-height: 46px; padding: 8px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .status strong { display: block; font-size: 11px; }
    .status span { display: block; margin-top: 2px; color: #64748b; font-size: 10px; line-height: 1.35; }
    .fields { padding: 10px; border-bottom: 1px solid #e2e8f0; display: grid; gap: 8px; }
    .field label { display: block; margin-bottom: 3px; color: #475569; font-size: 10px; font-weight: 800; }
    .field input[type="text"], .field textarea, .field select { width: 100%; border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 7px; color: #0f172a; background: #fff; font-size: 11px; outline: none; }
    .field input:focus, .field textarea:focus, .field select:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.12); }
    .field textarea { min-height: 58px; resize: vertical; }
    .field-row { display: grid; grid-template-columns: 90px minmax(0,1fr); gap: 8px; }
    .field-row.three { grid-template-columns: repeat(3, minmax(0,1fr)); }
    .color-row { display: flex; align-items: center; gap: 7px; }
    .color-row input { width: 40px; height: 28px; padding: 1px; border: 1px solid #cbd5e1; border-radius: 5px; background: #fff; }
    .list-head { padding: 8px 10px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e2e8f0; }
    .list-head strong { flex: 1; font-size: 11px; }
    .list { flex: 1; min-height: 0; overflow: auto; padding: 6px; }
    .item { margin-bottom: 5px; padding: 7px; display: grid; grid-template-columns: 26px minmax(0,1fr); gap: 6px; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer; }
    .item:hover { background: #f8fafc; }
    .item.selected { border-color: var(--color); background: color-mix(in srgb, var(--color) 7%, white); }
    .item-symbol { width: 23px; height: 23px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: var(--color); font-size: 10px; font-weight: 900; }
    .item-name { font-size: 10px; font-weight: 900; line-height: 1.3; }
    .item-desc { margin-top: 2px; color: #64748b; font-size: 9px; line-height: 1.3; white-space: pre-wrap; }
    .empty { padding: 20px 8px; color: #94a3b8; font-size: 10px; text-align: center; line-height: 1.5; }
    .unsaved { color: #b45309; font-weight: 900; }
    @media (max-width: 1050px) { .main { grid-template-columns: minmax(0,1fr) 310px; } .stage img { max-width: calc(100vw - 352px); } }
  </style>
</head>
<body>
  <div class="app">
    <div class="toolbar">
      <div class="title-wrap">
        <div class="title">기술자료 편집기 v1.1 · ${safeTitle}</div>
        <div class="sub">기본 90° 직교 지시선으로 생성됩니다. 필요 시 30°·60°·90°, 시작 위치, 명칭 전개 방향을 선택할 수 있습니다.</div>
      </div>
      <button id="addButton" type="button">+ 지시선 추가</button>
      <button id="deleteButton" type="button" class="danger">선택 삭제</button>
      <button id="upButton" type="button">↑</button>
      <button id="downButton" type="button">↓</button>
      <button id="saveButton" type="button" class="primary">저장</button>
      <button id="closeButton" type="button">닫기</button>
    </div>
    <div class="main">
      <div class="viewer" id="viewer">
        <div class="stage" id="stage">
          <img id="technicalImage" src="${safeImageUrl}" alt="${safeTitle}" />
          <svg class="leader-layer" id="leaderLayer" viewBox="0 0 100 100" preserveAspectRatio="none"></svg>
          <div id="overlayLayer"></div>
        </div>
      </div>
      <aside class="panel">
        <div class="status" id="statusBox"></div>
        <div class="fields">
          <div class="field-row">
            <div class="field">
              <label for="symbolInput">번호/기호</label>
              <input id="symbolInput" type="text" maxlength="8" placeholder="1" />
            </div>
            <div class="field">
              <label for="colorInput">표시 색상</label>
              <div class="color-row"><input id="colorInput" type="color" value="#dc2626" /><span id="colorText"></span></div>
            </div>
          </div>
          <div class="field-row three">
            <div class="field">
              <label for="leaderAngleInput">지시선 각도</label>
              <select id="leaderAngleInput">
                <option value="90">90° 직교</option>
                <option value="60">60°</option>
                <option value="30">30°</option>
              </select>
            </div>
            <div class="field">
              <label for="leaderStartInput">지시선 시작</label>
              <select id="leaderStartInput">
                <option value="auto">자동</option>
                <option value="left">왼쪽</option>
                <option value="right">오른쪽</option>
                <option value="top">위</option>
                <option value="bottom">아래</option>
              </select>
            </div>
            <div class="field">
              <label for="labelDirectionInput">명칭 방향</label>
              <select id="labelDirectionInput">
                <option value="right">→ 오른쪽</option>
                <option value="left">← 왼쪽</option>
              </select>
            </div>
          </div>
          <div class="field">
            <label for="titleInput">명칭</label>
            <input id="titleInput" type="text" maxlength="120" placeholder="예: SQ-Bar Hanger+Pin" />
          </div>
          <div class="field">
            <label for="descriptionInput">명칭에 대한 설명</label>
            <textarea id="descriptionInput" maxlength="500" placeholder="하단 목록에 표시할 설명을 입력합니다."></textarea>
          </div>
        </div>
        <div class="list-head"><strong>등록 항목 <span id="countText">0</span></strong><span class="unsaved" id="dirtyText"></span></div>
        <div class="list" id="itemList"></div>
      </aside>
    </div>
  </div>
  <script>
    (function () {
      var annotations = ${annotationJson};
      var sessionId = ${safeSessionId};
      var selectedId = annotations[0] ? annotations[0].id : '';
      var addStep = '';
      var pendingTarget = null;
      var dragState = null;
      var dirty = false;
      var palette = ${serializeForInlineScript(ANNOTATION_COLORS)};
      var stage = document.getElementById('stage');
      var leaderLayer = document.getElementById('leaderLayer');
      var overlayLayer = document.getElementById('overlayLayer');
      var itemList = document.getElementById('itemList');
      var statusBox = document.getElementById('statusBox');
      var symbolInput = document.getElementById('symbolInput');
      var titleInput = document.getElementById('titleInput');
      var descriptionInput = document.getElementById('descriptionInput');
      var colorInput = document.getElementById('colorInput');
      var colorText = document.getElementById('colorText');
      var leaderAngleInput = document.getElementById('leaderAngleInput');
      var leaderStartInput = document.getElementById('leaderStartInput');
      var labelDirectionInput = document.getElementById('labelDirectionInput');

      function esc(value) {
        return String(value || '').replace(/[&<>\"']/g, function (char) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#039;' })[char];
        });
      }
      function clamp(value) { return Math.max(0, Math.min(100, value)); }
      function createId() {
        return (window.crypto && window.crypto.randomUUID)
          ? window.crypto.randomUUID()
          : 'annotation-' + Date.now() + '-' + Math.random().toString(16).slice(2);
      }
      function current() { return annotations.find(function (item) { return item.id === selectedId; }) || null; }

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
        var edge = 1.35;

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
          clamp(startX) + ',' + clamp(startY),
          clamp(elbowX) + ',' + clamp(elbowY),
          clamp(targetX) + ',' + clamp(targetY)
        ].join(' ');
      }

      function getLabelStyle(item) {
        var direction = item.labelDirection === 'left' ? 'left' : 'right';
        return direction === 'left'
          ? 'transform:translate(calc(-100% + 13.5px),-50%);flex-direction:row-reverse;'
          : 'transform:translate(-13.5px,-50%);flex-direction:row;';
      }

      function markDirty() { dirty = true; document.getElementById('dirtyText').textContent = '저장 필요'; }
      function pointFromEvent(event) {
        var rect = stage.getBoundingClientRect();
        return {
          x: clamp(((event.clientX - rect.left) / rect.width) * 100),
          y: clamp(((event.clientY - rect.top) / rect.height) * 100)
        };
      }
      function reindex() {
        annotations = annotations.map(function (item, index) { return Object.assign({}, item, { sortOrder: index }); });
      }
      function select(id) {
        selectedId = id || '';
        render();
      }
      function renderStatus() {
        var selected = current();
        if (addStep === 'target') {
          statusBox.innerHTML = '<strong>① 부재 위치를 클릭하세요.</strong><span>지시선이 가리킬 실제 부재·접합부 위치를 이미지에서 클릭합니다.</span>';
        } else if (addStep === 'label') {
          statusBox.innerHTML = '<strong>② 명칭을 둘 위치를 클릭하세요.</strong><span>번호/기호와 명칭이 표시될 위치를 클릭하면 새 항목이 생성됩니다.</span>';
        } else if (selected) {
          statusBox.innerHTML = '<strong>' + esc(selected.symbol) + ' · ' + esc(selected.title || '명칭 미입력') + '</strong><span>번호/명칭 또는 부재 위치를 드래그하고, 30°·60°·90° 각도와 시작 위치·명칭 방향을 조정할 수 있습니다.</span>';
        } else {
          statusBox.innerHTML = '<strong>지시선을 추가하거나 항목을 선택하세요.</strong><span>저장은 원본 이미지를 변경하지 않고 좌표·명칭 데이터만 별도로 보관합니다.</span>';
        }
      }
      function renderFields() {
        var item = current();
        var disabled = !item;
        symbolInput.disabled = disabled;
        titleInput.disabled = disabled;
        descriptionInput.disabled = disabled;
        colorInput.disabled = disabled;
        leaderAngleInput.disabled = disabled;
        leaderStartInput.disabled = disabled;
        labelDirectionInput.disabled = disabled;
        symbolInput.value = item ? item.symbol : '';
        titleInput.value = item ? item.title : '';
        descriptionInput.value = item ? item.description : '';
        colorInput.value = item ? item.color : '#dc2626';
        colorText.textContent = item ? item.color : '';
        leaderAngleInput.value = item ? String(item.leaderAngle || 90) : '90';
        leaderStartInput.value = item ? String(item.leaderStart || 'auto') : 'auto';
        labelDirectionInput.value = item
          ? String(item.labelDirection || (Number(item.labelX) <= 50 ? 'right' : 'left'))
          : 'right';
      }
      function renderOverlay() {
        leaderLayer.innerHTML = annotations.map(function (item) {
          return '<polyline class="leader-line ' + (item.id === selectedId ? 'selected' : '') + '" points="' + getLeaderPoints(item) + '" fill="none" stroke="' + esc(item.color) + '" />';
        }).join('');
        overlayLayer.innerHTML = annotations.map(function (item) {
          var selected = item.id === selectedId ? 'selected' : '';
          return '<div class="target ' + selected + '" data-id="' + esc(item.id) + '" data-kind="target" style="left:' + item.targetX + '%;top:' + item.targetY + '%;--color:' + esc(item.color) + '"></div>' +
            '<div class="annotation-label ' + selected + '" data-id="' + esc(item.id) + '" data-kind="label" style="left:' + item.labelX + '%;top:' + item.labelY + '%;--color:' + esc(item.color) + ';' + getLabelStyle(item) + '">' +
              '<span class="symbol">' + esc(item.symbol) + '</span><span class="label-text">' + esc(item.title || '명칭 미입력') + '</span></div>';
        }).join('');
        Array.prototype.forEach.call(overlayLayer.querySelectorAll('[data-id]'), function (element) {
          element.addEventListener('pointerdown', function (event) {
            event.preventDefault();
            event.stopPropagation();
            var id = element.getAttribute('data-id');
            selectedId = id;
            dragState = { id: id, kind: element.getAttribute('data-kind') };
            if (element.setPointerCapture) {
              try { element.setPointerCapture(event.pointerId); } catch (_error) { /* noop */ }
            }
            renderStatus();
            renderFields();
            renderList();
          });
        });
      }
      function renderList() {
        document.getElementById('countText').textContent = String(annotations.length);
        if (!annotations.length) {
          itemList.innerHTML = '<div class="empty">아직 등록된 항목이 없습니다.<br/>상단의 “지시선 추가”를 눌러 시작하세요.</div>';
          return;
        }
        itemList.innerHTML = annotations.map(function (item) {
          var selected = item.id === selectedId ? 'selected' : '';
          return '<div class="item ' + selected + '" data-id="' + esc(item.id) + '" style="--color:' + esc(item.color) + '">' +
            '<div class="item-symbol">' + esc(item.symbol) + '</div><div><div class="item-name">' + esc(item.title || '명칭 미입력') + '</div>' +
            (item.description ? '<div class="item-desc">' + esc(item.description) + '</div>' : '') + '</div></div>';
        }).join('');
        Array.prototype.forEach.call(itemList.querySelectorAll('.item'), function (element) {
          element.addEventListener('click', function () { select(element.getAttribute('data-id')); });
        });
      }
      function renderButtons() {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        document.getElementById('deleteButton').disabled = index < 0;
        document.getElementById('upButton').disabled = index <= 0;
        document.getElementById('downButton').disabled = index < 0 || index >= annotations.length - 1;
      }
      function render() {
        renderStatus(); renderFields(); renderOverlay(); renderList(); renderButtons();
      }
      function updateSelected(field, value) {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index < 0) return;
        annotations[index] = Object.assign({}, annotations[index], (function () { var o = {}; o[field] = value; return o; }()));
        markDirty();
        renderOverlay(); renderList(); renderStatus(); renderButtons();
      }

      document.getElementById('addButton').addEventListener('click', function () {
        addStep = 'target'; pendingTarget = null; renderStatus();
      });
      stage.addEventListener('click', function (event) {
        if (!addStep) return;
        if (event.target.closest && event.target.closest('[data-id]')) return;
        var point = pointFromEvent(event);
        if (addStep === 'target') {
          pendingTarget = point; addStep = 'label'; renderStatus(); return;
        }
        if (addStep === 'label' && pendingTarget) {
          var nextNumber = annotations.length + 1;
          var item = {
            id: createId(), symbol: String(nextNumber), title: '', description: '',
            color: palette[annotations.length % palette.length],
            leaderAngle: 90,
            leaderStart: 'auto',
            labelDirection: point.x <= 50 ? 'right' : 'left',
            targetX: pendingTarget.x, targetY: pendingTarget.y,
            labelX: point.x, labelY: point.y, sortOrder: annotations.length
          };
          annotations.push(item); selectedId = item.id; addStep = ''; pendingTarget = null; markDirty(); render();
          titleInput.focus();
        }
      });
      window.addEventListener('pointermove', function (event) {
        if (!dragState) return;
        var point = pointFromEvent(event);
        var index = annotations.findIndex(function (item) { return item.id === dragState.id; });
        if (index < 0) return;
        if (dragState.kind === 'target') {
          annotations[index] = Object.assign({}, annotations[index], { targetX: point.x, targetY: point.y });
        } else {
          annotations[index] = Object.assign({}, annotations[index], { labelX: point.x, labelY: point.y });
        }
        markDirty(); renderOverlay();
      });
      window.addEventListener('pointerup', function () { dragState = null; });

      symbolInput.addEventListener('input', function () { updateSelected('symbol', symbolInput.value); });
      titleInput.addEventListener('input', function () { updateSelected('title', titleInput.value); });
      descriptionInput.addEventListener('input', function () { updateSelected('description', descriptionInput.value); });
      colorInput.addEventListener('input', function () { colorText.textContent = colorInput.value; updateSelected('color', colorInput.value); });
      leaderAngleInput.addEventListener('change', function () { updateSelected('leaderAngle', Number(leaderAngleInput.value) || 90); });
      leaderStartInput.addEventListener('change', function () { updateSelected('leaderStart', leaderStartInput.value); });
      labelDirectionInput.addEventListener('change', function () { updateSelected('labelDirection', labelDirectionInput.value); });

      document.getElementById('deleteButton').addEventListener('click', function () {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index < 0) return;
        annotations.splice(index, 1); reindex(); selectedId = annotations[Math.min(index, annotations.length - 1)]?.id || ''; markDirty(); render();
      });
      document.getElementById('upButton').addEventListener('click', function () {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index <= 0) return;
        var temp = annotations[index - 1]; annotations[index - 1] = annotations[index]; annotations[index] = temp; reindex(); markDirty(); render();
      });
      document.getElementById('downButton').addEventListener('click', function () {
        var index = annotations.findIndex(function (item) { return item.id === selectedId; });
        if (index < 0 || index >= annotations.length - 1) return;
        var temp = annotations[index + 1]; annotations[index + 1] = annotations[index]; annotations[index] = temp; reindex(); markDirty(); render();
      });
      document.getElementById('saveButton').addEventListener('click', function () {
        reindex();
        if (!window.opener || window.opener.closed) {
          window.alert('원래 일위대가 화면을 찾을 수 없습니다. 일위대가 화면을 닫지 않은 상태에서 저장해주세요.');
          return;
        }
        window.opener.postMessage({
          type: 'unit-price-technical-annotations-save',
          sessionId: sessionId,
          annotations: annotations
        }, window.location.origin);
        dirty = false; document.getElementById('dirtyText').textContent = '저장 요청됨';
      });
      document.getElementById('closeButton').addEventListener('click', function () {
        if (dirty && !window.confirm('저장하지 않은 변경사항이 있습니다. 편집 창을 닫을까요?')) return;
        window.close();
      });
      window.addEventListener('beforeunload', function (event) {
        if (!dirty) return;
        event.preventDefault(); event.returnValue = '';
      });

      render();
    }());
  </script>
</body>
</html>`;
};

export const openTechnicalImageEditorWindow = ({
  imageUrl,
  title = '기술자료',
  annotations = [],
}) => {
  const normalizedUrl = String(imageUrl || '').trim();
  if (!normalizedUrl) return Promise.resolve({ opened: false, saved: false, reason: 'missing-image' });

  const geometry = getPopupGeometry({ widthRatio: 0.92, heightRatio: 0.94 });
  const popup = openPopup('unitPriceTechnicalAnnotationEditor', geometry);
  if (!popup) return Promise.resolve({ opened: false, saved: false, reason: 'blocked' });

  const sessionId = createAnnotationId();
  popup.document.open();
  popup.document.write(editorHtml({
    imageUrl: normalizedUrl,
    title,
    annotations,
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
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'unit-price-technical-annotations-save') return;
      if (event.data?.sessionId !== sessionId) return;
      finish({
        opened: true,
        saved: true,
        annotations: normalizeTechnicalAnnotations(event.data.annotations),
        popup,
      });
    };
    window.addEventListener('message', handleMessage);
    const closeWatcher = window.setInterval(() => {
      if (popup.closed) finish({ opened: true, saved: false, reason: 'closed' });
    }, 500);
  });
};
