const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.33';
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'utils', 'technicalImageAnnotations.js');

function fail(message) {
  console.error(`[적용 중단] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(TARGET)) {
  fail(`대상 파일을 찾을 수 없습니다: ${TARGET}`);
}

let source = fs.readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n');

if (!source.includes('기술자료 편집기 v1')) {
  fail('현재 technicalImageAnnotations.js가 v52.48.5.32 기준과 다릅니다. 기존 변경을 보호하기 위해 수정하지 않았습니다.');
}
if (source.includes('v52.48.5.33 지시선 각도')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_${VERSION}_${stamp}`);
fs.mkdirSync(path.dirname(path.join(backupDir, 'src', 'utils')), { recursive: true });
fs.copyFileSync(TARGET, path.join(backupDir, 'src', 'utils', 'technicalImageAnnotations.js'));

function replaceOnce(find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) fail(`${label} 기준 코드를 찾지 못했습니다.`);
  if (source.indexOf(find, index + find.length) >= 0 && label.startsWith('단일')) {
    fail(`${label} 기준 코드가 2개 이상 발견되었습니다.`);
  }
  source = source.slice(0, index) + replacement + source.slice(index + find.length);
}

function replaceAllChecked(find, replacement, minCount, label) {
  const parts = source.split(find);
  const count = parts.length - 1;
  if (count < minCount) fail(`${label} 기준 코드가 부족합니다. 발견 ${count}개`);
  source = parts.join(replacement);
}

// 1) 저장 데이터에 각도 / 시작위치 / 명칭방향 필드 추가
replaceOnce(
`const sanitizeColor = (value, fallback) => {
  const normalized = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
};

const createAnnotationId = () => (`,
`const sanitizeColor = (value, fallback) => {
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

const createAnnotationId = () => (`,
'단일 정규화 헬퍼'
);

replaceOnce(
`        description: String(item?.description || '').trim(),
        color: sanitizeColor(item?.color, fallbackColor),
        targetX: clampPercent(item?.targetX, 50),`,
`        description: String(item?.description || '').trim(),
        color: sanitizeColor(item?.color, fallbackColor),
        leaderAngle: normalizeLeaderAngle(item?.leaderAngle),
        leaderStart: normalizeLeaderStart(item?.leaderStart),
        labelDirection: normalizeLabelDirection(
          item?.labelDirection,
          clampPercent(item?.labelX, 20),
        ),
        targetX: clampPercent(item?.targetX, 50),`,
'단일 annotation 필드'
);

// 2) viewer/editor 공통 라벨 중심정렬 제거.
// 실제 anchor는 번호 원의 중심점으로 두고 좌/우 전개는 인라인 style로 처리.
replaceAllChecked(
`transform: translate(-50%,-50%); display: flex;`,
`display: flex;`,
2,
'라벨 중심정렬'
);

// 3) 상세보기 viewer: 직교/30/60도 polyline + 명칭 방향 반영
replaceOnce(
`      function setActive(id) {
        activeId = id || '';
        renderOverlay();
        renderLegend();
      }

      function renderOverlay() {`,
`      function setActive(id) {
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

      function renderOverlay() {`,
'단일 viewer geometry'
);

replaceOnce(
`        leaderLayer.innerHTML = annotations.map(function (item) {
          var active = !activeId || activeId === item.id;
          return '<line class="leader-line ' + (activeId ? (active ? 'active' : 'dimmed') : '') + '" data-id="' + esc(item.id) + '" x1="' + item.labelX + '" y1="' + item.labelY + '" x2="' + item.targetX + '" y2="' + item.targetY + '" stroke="' + esc(item.color) + '" />';
        }).join('');`,
`        leaderLayer.innerHTML = annotations.map(function (item) {
          var active = !activeId || activeId === item.id;
          return '<polyline class="leader-line ' + (activeId ? (active ? 'active' : 'dimmed') : '') + '" data-id="' + esc(item.id) + '" points="' + getLeaderPoints(item) + '" fill="none" stroke="' + esc(item.color) + '" />';
        }).join('');`,
'단일 viewer line'
);

replaceOnce(
`            '<div class="annotation-label ' + stateClass + '" data-id="' + esc(item.id) + '" style="left:' + item.labelX + '%;top:' + item.labelY + '%;--color:' + esc(item.color) + '">' +`,
`            '<div class="annotation-label ' + stateClass + '" data-id="' + esc(item.id) + '" style="left:' + item.labelX + '%;top:' + item.labelY + '%;--color:' + esc(item.color) + ';' + getLabelStyle(item) + '">' +`,
'단일 viewer label style'
);

// 4) 편집기 UI: select 지원 및 3개 설정 필드 추가
replaceOnce(
`    button, input, textarea { font: inherit; }`,
`    button, input, textarea, select { font: inherit; }`,
'단일 폰트 selector'
);

replaceOnce(
`    .field input[type="text"], .field textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 7px; color: #0f172a; font-size: 11px; outline: none; }
    .field input:focus, .field textarea:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.12); }`,
`    .field input[type="text"], .field textarea, .field select { width: 100%; border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 7px; color: #0f172a; background: #fff; font-size: 11px; outline: none; }
    .field input:focus, .field textarea:focus, .field select:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.12); }`,
'단일 field selector'
);

replaceOnce(
`    .field-row { display: grid; grid-template-columns: 90px minmax(0,1fr); gap: 8px; }`,
`    .field-row { display: grid; grid-template-columns: 90px minmax(0,1fr); gap: 8px; }
    .field-row.three { grid-template-columns: repeat(3, minmax(0,1fr)); }`,
'단일 field-row css'
);

replaceOnce(
`          </div>
          <div class="field">
            <label for="titleInput">명칭</label>`,
`          </div>
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
            <label for="titleInput">명칭</label>`,
'단일 편집 필드 UI'
);

replaceOnce(
`      var colorInput = document.getElementById('colorInput');
      var colorText = document.getElementById('colorText');`,
`      var colorInput = document.getElementById('colorInput');
      var colorText = document.getElementById('colorText');
      var leaderAngleInput = document.getElementById('leaderAngleInput');
      var leaderStartInput = document.getElementById('leaderStartInput');
      var labelDirectionInput = document.getElementById('labelDirectionInput');`,
'단일 select DOM'
);

// 5) 편집기 geometry helper
replaceOnce(
`      function current() { return annotations.find(function (item) { return item.id === selectedId; }) || null; }
      function markDirty() { dirty = true; document.getElementById('dirtyText').textContent = '저장 필요'; }`,
`      function current() { return annotations.find(function (item) { return item.id === selectedId; }) || null; }

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

      function markDirty() { dirty = true; document.getElementById('dirtyText').textContent = '저장 필요'; }`,
'단일 editor geometry'
);

// 6) 필드 렌더링
replaceOnce(
`        descriptionInput.disabled = disabled;
        colorInput.disabled = disabled;
        symbolInput.value = item ? item.symbol : '';
        titleInput.value = item ? item.title : '';
        descriptionInput.value = item ? item.description : '';
        colorInput.value = item ? item.color : '#dc2626';
        colorText.textContent = item ? item.color : '';`,
`        descriptionInput.disabled = disabled;
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
          : 'right';`,
'단일 renderFields'
);

// 7) editor line -> polyline, label anchor direction
replaceOnce(
`        leaderLayer.innerHTML = annotations.map(function (item) {
          return '<line class="leader-line ' + (item.id === selectedId ? 'selected' : '') + '" x1="' + item.labelX + '" y1="' + item.labelY + '" x2="' + item.targetX + '" y2="' + item.targetY + '" stroke="' + esc(item.color) + '" />';
        }).join('');`,
`        leaderLayer.innerHTML = annotations.map(function (item) {
          return '<polyline class="leader-line ' + (item.id === selectedId ? 'selected' : '') + '" points="' + getLeaderPoints(item) + '" fill="none" stroke="' + esc(item.color) + '" />';
        }).join('');`,
'단일 editor line'
);

replaceOnce(
`            '<div class="annotation-label ' + selected + '" data-id="' + esc(item.id) + '" data-kind="label" style="left:' + item.labelX + '%;top:' + item.labelY + '%;--color:' + esc(item.color) + '">' +`,
`            '<div class="annotation-label ' + selected + '" data-id="' + esc(item.id) + '" data-kind="label" style="left:' + item.labelX + '%;top:' + item.labelY + '%;--color:' + esc(item.color) + ';' + getLabelStyle(item) + '">' +`,
'단일 editor label style'
);

// 8) 새 항목 기본값: 90도 + 위치에 맞춰 글자가 이미지 안쪽으로 전개
replaceOnce(
`            color: palette[annotations.length % palette.length],
            targetX: pendingTarget.x, targetY: pendingTarget.y,
            labelX: point.x, labelY: point.y, sortOrder: annotations.length`,
`            color: palette[annotations.length % palette.length],
            leaderAngle: 90,
            leaderStart: 'auto',
            labelDirection: point.x <= 50 ? 'right' : 'left',
            targetX: pendingTarget.x, targetY: pendingTarget.y,
            labelX: point.x, labelY: point.y, sortOrder: annotations.length`,
'단일 new annotation defaults'
);

// 9) select 변경 이벤트
replaceOnce(
`      colorInput.addEventListener('input', function () { colorText.textContent = colorInput.value; updateSelected('color', colorInput.value); });

      document.getElementById('deleteButton').addEventListener('click', function () {`,
`      colorInput.addEventListener('input', function () { colorText.textContent = colorInput.value; updateSelected('color', colorInput.value); });
      leaderAngleInput.addEventListener('change', function () { updateSelected('leaderAngle', Number(leaderAngleInput.value) || 90); });
      leaderStartInput.addEventListener('change', function () { updateSelected('leaderStart', leaderStartInput.value); });
      labelDirectionInput.addEventListener('change', function () { updateSelected('labelDirection', labelDirectionInput.value); });

      document.getElementById('deleteButton').addEventListener('click', function () {`,
'단일 select events'
);

// 10) 안내문구 업데이트
source = source.replace(
  '기술자료 편집기 v1 · ${safeTitle}',
  '기술자료 편집기 v1.1 · ${safeTitle}',
);
source = source.replace(
  '지시선 추가 → 이미지의 부재 위치 클릭 → 명칭을 둘 위치 클릭. 생성 후 양 끝점을 마우스로 끌어 위치를 조정합니다.',
  '기본 90° 직교 지시선으로 생성됩니다. 필요 시 30°·60°·90°, 시작 위치, 명칭 전개 방향을 선택할 수 있습니다.',
);
source = source.replace(
  `statusBox.innerHTML = '<strong>' + esc(selected.symbol) + ' · ' + esc(selected.title || '명칭 미입력') + '</strong><span>원형 번호 또는 부재 위치 점을 드래그하면 지시선 위치를 바꿀 수 있습니다.</span>';`,
  `statusBox.innerHTML = '<strong>' + esc(selected.symbol) + ' · ' + esc(selected.title || '명칭 미입력') + '</strong><span>번호/명칭 또는 부재 위치를 드래그하고, 30°·60°·90° 각도와 시작 위치·명칭 방향을 조정할 수 있습니다.</span>';`,
);

fs.writeFileSync(TARGET, source, 'utf8');

console.log(`[${VERSION}] 적용 완료`);
console.log(`- 수정: src/utils/technicalImageAnnotations.js`);
console.log(`- 백업: ${path.relative(ROOT, backupDir)}`);
console.log('- 기본 지시선 각도: 90° 직교');
console.log('- 선택 각도: 30° / 60° / 90°');
console.log('- 지시선 시작 위치: 자동 / 왼쪽 / 오른쪽 / 위 / 아래');
console.log('- 명칭 방향: 오른쪽 / 왼쪽');
console.log('- 기존 일위대가/이미지/권한/저장 데이터 구조는 유지됩니다.');
