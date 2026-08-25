const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.37';
const ROOT = process.cwd();
const PAGE = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');
const EDITOR = path.join(ROOT, 'src', 'utils', 'technicalImageSheetEditor.js');
const SQL_SRC = path.join(__dirname, 'supabase', 'v52.48.5.37_unit_price_annotation_accessories.sql');
const SQL_DST = path.join(ROOT, 'supabase', 'v52.48.5.37_unit_price_annotation_accessories.sql');

function stop(message) {
  console.error(`[적용 중단] ${message}`);
  process.exitCode = 1;
}

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`${label}: 기준 코드를 찾지 못했습니다.`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`${label}: 기준 코드가 2개 이상 발견되었습니다.`);
  }
  return source.slice(0, index) + replacement + source.slice(index + find.length);
}

function replaceRegexOnce(source, regex, replacement, label) {
  const matches = source.match(regex);
  if (!matches) throw new Error(`${label}: 기준 코드를 찾지 못했습니다.`);
  const globalRegex = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  const all = [...source.matchAll(globalRegex)];
  if (all.length !== 1) {
    throw new Error(`${label}: 기준 코드 발견 개수 ${all.length}개`);
  }
  return source.replace(regex, replacement);
}

if (!fs.existsSync(PAGE) || !fs.existsSync(EDITOR)) {
  stop('현재 프로젝트의 UnitPriceAnalysis.jsx 또는 technicalImageSheetEditor.js를 찾지 못했습니다.');
  return;
}
if (!fs.existsSync(SQL_SRC)) {
  stop('v52.48.5.37 SQL 파일을 찾지 못했습니다. ZIP을 다시 풀어주세요.');
  return;
}

let page = fs.readFileSync(PAGE, 'utf8').replace(/\r\n/g, '\n');
let editor = fs.readFileSync(EDITOR, 'utf8').replace(/\r\n/g, '\n');

if (page.includes('save_unit_price_technical_sheet_v37') || editor.includes('v52.48.5.37')) {
  console.log(`[${VERSION}] 이미 적용되어 있습니다.`);
  process.exitCode = 0;
  return;
}

if (!page.includes('save_unit_price_technical_sheet_v36')) {
  stop('UnitPriceAnalysis.jsx가 v52.48.5.36 기준과 다릅니다. 기존 변경 보호를 위해 적용하지 않았습니다.');
  return;
}
if (!editor.includes('부속자재 연결') || !editor.includes('showAllAccessories')) {
  stop('technicalImageSheetEditor.js가 v52.48.5.36 기준과 다릅니다. 기존 변경 보호를 위해 적용하지 않았습니다.');
  return;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupRoot = path.join(ROOT, `backup_${VERSION}_${stamp}`);
fs.mkdirSync(path.join(backupRoot, 'src', 'page'), { recursive: true });
fs.mkdirSync(path.join(backupRoot, 'src', 'utils'), { recursive: true });
fs.copyFileSync(PAGE, path.join(backupRoot, 'src', 'page', 'UnitPriceAnalysis.jsx'));
fs.copyFileSync(EDITOR, path.join(backupRoot, 'src', 'utils', 'technicalImageSheetEditor.js'));

try {
  // ---------------------------------------------------------------------------
  // UnitPriceAnalysis.jsx
  // ---------------------------------------------------------------------------
  page = replaceOnce(
    page,
    `.select('annotation_id, accessory_id, sort_order')`,
    `.select('annotation_id, annotation_symbol, annotation_title, accessory_id, sort_order')`,
    '부속자재 연결 조회 컬럼',
  );

  page = replaceOnce(
    page,
`        return {
          ...accessory,
          annotation_id: link.annotation_id,
          sort_order: link.sort_order ?? index,
        };`,
`        return {
          ...accessory,
          annotation_id: link.annotation_id,
          annotation_symbol: link.annotation_symbol || '',
          annotation_title: link.annotation_title || '',
          sort_order: link.sort_order ?? index,
        };`,
    'VIEW 부속자재 메타데이터',
  );

  page = page.replaceAll(
    `'save_unit_price_technical_sheet_v36'`,
    `'save_unit_price_technical_sheet_v37'`,
  );

  page = page.replaceAll(
    `message.includes('save_unit_price_technical_sheet_v36')`,
    `message.includes('save_unit_price_technical_sheet_v37')`,
  );

  page = page.replaceAll(
    `'v52.48.5.36 Supabase SQL을 먼저 실행해주세요.'`,
    `'v52.48.5.37 Supabase SQL을 먼저 실행해주세요.'`,
  );

  page = replaceOnce(
    page,
`      setTechnicalAnnotations(nextAnnotations);
      setTechnicalSheetLayout(nextLayout);
      setTechnicalAnnotationAccessoryLinks(nextAccessoryLinks);
      showToast(`,
`      setTechnicalAnnotations(nextAnnotations);
      setTechnicalSheetLayout(nextLayout);
      setTechnicalAnnotationAccessoryLinks(nextAccessoryLinks);
      await loadTechnicalAccessories(imageKey);
      showToast(`,
    '저장 후 부속자재 연결 재조회',
  );

  page = replaceOnce(
    page,
`    technicalAnnotationAccessoryLinks,
    upsertTechnicalAccessoryFromEditor,`,
`    technicalAnnotationAccessoryLinks,
    loadTechnicalAccessories,
    upsertTechnicalAccessoryFromEditor,`,
    '편집기 dependency 보강',
  );

  // ---------------------------------------------------------------------------
  // technicalImageSheetEditor.js
  // ---------------------------------------------------------------------------
  editor = replaceOnce(
    editor,
`        annotationId: String(item?.annotation_id || item?.annotationId || '').trim(),
        sortOrder: Number.isFinite(Number(item?.sort_order ?? item?.sortOrder))`,
`        annotationId: String(item?.annotation_id || item?.annotationId || '').trim(),
        annotationSymbol: String(item?.annotation_symbol || item?.annotationSymbol || '').trim(),
        annotationTitle: String(item?.annotation_title || item?.annotationTitle || '').trim(),
        sortOrder: Number.isFinite(Number(item?.sort_order ?? item?.sortOrder))`,
    '부속자재 VIEW 연결 메타데이터',
  );

  // VIEW accessory CSS: huge vertical images -> compact list + small preview panel
  editor = replaceRegexOnce(
    editor,
    /    \.accessory-list \{[^}]*\}\n    \.accessory-card \{[^}]*\}\n    \.accessory-name \{[^}]*\}\n    \.accessory-image \{[^}]*\}\n    \.accessory-empty \{[^}]*\}/,
`    .accessory-list { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
    .accessory-card { flex: 0 0 auto; min-height: 62px; padding: 6px; display: grid; grid-template-columns: 58px minmax(0,1fr); gap: 8px; align-items: center; border: 1px solid #dbe3ec; border-radius: 7px; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.04); cursor: pointer; }
    .accessory-card:hover { border-color: #93c5fd; background: #eff6ff; }
    .accessory-thumb { width: 58px; height: 50px; display: block; object-fit: contain; background: #fff; border: 1px solid #eef2f7; border-radius: 4px; }
    .accessory-name { min-width: 0; color: #111827; font-size: 11px; font-weight: 900; line-height: 1.3; overflow-wrap: anywhere; }
    .accessory-note { margin-top: 3px; color: #64748b; font-size: 9px; line-height: 1.3; }
    .accessory-empty { margin: auto 8px; padding: 24px 10px; border: 1px dashed #cbd5e1; border-radius: 8px; background: #fff; color: #94a3b8; font-size: 11px; font-weight: 700; line-height: 1.55; text-align: center; }
    .accessory-preview { flex: 0 0 auto; display: none; margin: 8px 8px 0; overflow: hidden; border: 1px solid #93c5fd; border-radius: 8px; background: #fff; box-shadow: 0 6px 18px rgba(15,23,42,.12); }
    .accessory-preview.open { display: block; }
    .accessory-preview-head { height: 30px; padding: 0 7px 0 9px; display: flex; align-items: center; gap: 6px; border-bottom: 1px solid #e2e8f0; background: #eff6ff; }
    .accessory-preview-title { flex: 1; min-width: 0; color: #1e3a8a; font-size: 10px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .accessory-preview-close { width: 24px; min-width: 24px; height: 24px; min-height: 24px; padding: 0; border: 0; background: transparent; color: #64748b; font-size: 16px; }
    .accessory-preview-image-wrap { height: min(28vh, 250px); min-height: 150px; display: grid; place-items: center; padding: 7px; background: #fff; }
    .accessory-preview-image { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }`,
    'VIEW 부속자재 리스트/미리보기 CSS',
  );

  editor = replaceOnce(
    editor,
`      <div class="accessory-list" id="accessoryList"></div>
    </aside>`,
`      <div class="accessory-preview" id="accessoryPreview">
        <div class="accessory-preview-head">
          <div class="accessory-preview-title" id="accessoryPreviewTitle"></div>
          <button class="accessory-preview-close" id="accessoryPreviewClose" type="button" aria-label="미리보기 닫기">×</button>
        </div>
        <div class="accessory-preview-image-wrap">
          <img class="accessory-preview-image" id="accessoryPreviewImage" alt="" />
        </div>
      </div>
      <div class="accessory-list" id="accessoryList"></div>
    </aside>`,
    'VIEW 부속자재 작은 미리보기 DOM',
  );

  editor = replaceOnce(
    editor,
`      var accessoryContext = document.getElementById('accessoryContext');
      var allAccessoriesButton = document.getElementById('allAccessoriesButton');`,
`      var accessoryContext = document.getElementById('accessoryContext');
      var allAccessoriesButton = document.getElementById('allAccessoriesButton');
      var accessoryPreview = document.getElementById('accessoryPreview');
      var accessoryPreviewTitle = document.getElementById('accessoryPreviewTitle');
      var accessoryPreviewImage = document.getElementById('accessoryPreviewImage');
      var accessoryPreviewClose = document.getElementById('accessoryPreviewClose');`,
    'VIEW 미리보기 DOM 변수',
  );

  // Replace viewer accessory renderer completely.
  editor = replaceRegexOnce(
    editor,
    /      function uniqueAccessories\(items\) \{[\s\S]*?      allAccessoriesButton\.addEventListener\('click', function \(\) \{[\s\S]*?      \}\);\n\n      document\.getElementById\('fitButton'\)/,
`      function uniqueAccessories(items) {
        var seen = {};
        return items.filter(function (item) {
          if (!item || !item.id || seen[item.id]) return false;
          seen[item.id] = true;
          return true;
        });
      }

      function accessoryMatchesAnnotation(accessory, annotation) {
        if (!accessory || !annotation) return false;

        var accessoryId = String(accessory.annotationId || '').trim();
        var annotationId = String(annotation.id || '').trim();
        if (accessoryId && annotationId && accessoryId === annotationId) {
          return true;
        }

        // v52.48.5.37: 과거 연결정보의 id가 어긋난 경우에도
        // 번호/명칭 메타데이터로 한 번 더 확인합니다.
        var accessorySymbol = String(accessory.annotationSymbol || '').trim();
        var annotationSymbol = String(annotation.symbol || '').trim();
        var accessoryTitle = String(accessory.annotationTitle || '').trim();
        var annotationTitle = String(annotation.title || '').trim();

        if (accessorySymbol && annotationSymbol && accessorySymbol === annotationSymbol) {
          if (!accessoryTitle || !annotationTitle || accessoryTitle === annotationTitle) {
            return true;
          }
        }

        return false;
      }

      function getAccessoriesForAnnotation(annotation) {
        if (!annotation) return [];
        return uniqueAccessories(accessories.filter(function (item) {
          return accessoryMatchesAnnotation(item, annotation);
        }));
      }

      function hideAccessoryPreview() {
        accessoryPreview.classList.remove('open');
        accessoryPreviewTitle.textContent = '';
        accessoryPreviewImage.removeAttribute('src');
        accessoryPreviewImage.alt = '';
      }

      function showAccessoryPreview(item) {
        if (!item || !item.imageUrl) {
          hideAccessoryPreview();
          return;
        }
        accessoryPreviewTitle.textContent = item.name || '상세 부속자재';
        accessoryPreviewImage.src = item.imageUrl;
        accessoryPreviewImage.alt = item.name || '상세 부속자재';
        accessoryPreview.classList.add('open');
      }

      function renderAccessories() {
        var visible = [];
        var selectedAnnotation = annotations.find(function (item) {
          return String(item.id) === String(selectedAnnotationId);
        }) || null;

        if (showAllAccessories) {
          visible = uniqueAccessories(accessories);
          accessoryContext.textContent = visible.length
            ? '현재 기술자료에 연결된 부속자재 전체 · 항목을 클릭하면 작은 미리보기가 열립니다.'
            : '';
          hideAccessoryPreview();
        } else if (selectedAnnotation) {
          visible = getAccessoriesForAnnotation(selectedAnnotation);
          accessoryContext.textContent =
            selectedAnnotation.symbol + '. ' + (selectedAnnotation.title || '명칭 미입력')
            + ' · 연결 ' + visible.length + '개';

          // 번호/명칭을 클릭하면 연결된 첫 번째 부속자재가 우측에 즉시 보입니다.
          if (visible.length) showAccessoryPreview(visible[0]);
          else hideAccessoryPreview();
        } else {
          accessoryContext.textContent = '';
          hideAccessoryPreview();
        }

        allAccessoriesButton.classList.toggle('active', showAllAccessories);
        allAccessoriesButton.disabled = accessories.length === 0;

        if (!showAllAccessories && !selectedAnnotation) {
          accessoryList.innerHTML = '<div class="accessory-empty">도면의 번호 또는<br/>하단 부재명을 클릭하세요.<br/><br/>연결된 부속자재가 있으면<br/>우측에 바로 표시됩니다.</div>';
          return;
        }

        if (!visible.length) {
          accessoryList.innerHTML = '<div class="accessory-empty">선택한 항목에 연결된<br/>상세 부속자재가 없습니다.</div>';
          return;
        }

        accessoryList.innerHTML = visible.map(function (item) {
          return '<div class="accessory-card" data-id="' + esc(item.id) + '">' +
            '<img class="accessory-thumb" src="' + esc(item.imageUrl) + '" alt="' + esc(item.name) + '" />' +
            '<div>' +
              '<div class="accessory-name">' + esc(item.name) + '</div>' +
              '<div class="accessory-note">클릭하여 작은 미리보기</div>' +
            '</div>' +
          '</div>';
        }).join('');

        Array.prototype.forEach.call(accessoryList.querySelectorAll('.accessory-card'), function (card) {
          card.addEventListener('click', function () {
            var id = card.getAttribute('data-id');
            var item = visible.find(function (candidate) {
              return String(candidate.id) === String(id);
            });
            if (item) showAccessoryPreview(item);
          });
        });
      }

      accessoryPreviewClose.addEventListener('click', function () {
        hideAccessoryPreview();
      });

      allAccessoriesButton.addEventListener('click', function () {
        showAllAccessories = true;
        selectedAnnotationId = '';
        hoverAnnotationId = '';
        renderOverlay();
        renderCaption();
        renderAccessories();
      });

      document.getElementById('fitButton')`,
    'VIEW 선택연동/전체보기 리스트',
  );

  // Editor accessory CSS: make connection unmistakable.
  editor = replaceOnce(
    editor,
`    .accessory-editor-head { flex: 0 0 auto; padding: 9px 10px; border-bottom: 1px solid #e2e8f0; background: #fff; }`,
`    .accessory-editor-head { flex: 0 0 auto; padding: 9px 10px; border-bottom: 1px solid #e2e8f0; background: #fff; }
    .accessory-annotation-nav { margin-bottom: 8px; display: flex; gap: 5px; overflow-x: auto; padding-bottom: 3px; }
    .accessory-annotation-chip { flex: 0 0 auto; min-height: 29px; padding: 0 8px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid #cbd5e1; border-radius: 999px; background: #fff; color: #475569; font-size: 9px; font-weight: 900; white-space: nowrap; }
    .accessory-annotation-chip.active { border-color: #2563eb; background: #2563eb; color: #fff; }
    .accessory-annotation-count { min-width: 16px; height: 16px; padding: 0 4px; display: inline-grid; place-items: center; border-radius: 999px; background: #e2e8f0; color: #475569; font-size: 8px; }
    .accessory-annotation-chip.active .accessory-annotation-count { background: #fff; color: #2563eb; }
    .accessory-link-summary { margin-top: 4px; color: #b45309; font-size: 9px; font-weight: 900; line-height: 1.35; }
    .accessory-search { margin-top: 7px; width: 100%; border: 1px solid #cbd5e1; border-radius: 5px; padding: 6px 7px; font-size: 10px; outline: none; }
    .accessory-search:focus { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.12); }`,
    '편집기 직관적 연결 CSS 1',
  );

  editor = replaceOnce(
    editor,
`    .accessory-editor-card { margin-bottom: 6px; padding: 6px; display: grid; grid-template-columns: 24px 76px minmax(0,1fr); gap: 6px; align-items: center; border: 1px solid #dbe3ec; border-radius: 6px; background: #fff; }
    .accessory-editor-card.linked { border-color: #93c5fd; background: #eff6ff; }
    .accessory-editor-check { width: 17px; height: 17px; }`,
`    .accessory-editor-card { margin-bottom: 6px; padding: 6px; display: grid; grid-template-columns: 76px minmax(0,1fr) auto; gap: 7px; align-items: center; border: 1px solid #dbe3ec; border-radius: 6px; background: #fff; }
    .accessory-editor-card.linked { border: 2px solid #2563eb; background: #eff6ff; }
    .accessory-connect-button { min-width: 70px; min-height: 30px; padding: 0 7px; border-color: #cbd5e1; color: #475569; font-size: 9px; }
    .accessory-connect-button.linked { border-color: #2563eb; background: #2563eb; color: #fff; }`,
    '편집기 직관적 연결 CSS 2',
  );

  editor = replaceOnce(
    editor,
`          <div class="accessory-editor-head">
            <div class="accessory-selected" id="accessorySelectedTitle">연결할 지시선 항목을 선택하세요.</div>
            <div class="accessory-selected-help">공통 부속자재 이미지는 한 번만 업로드하고 여러 명칭에서 반복 연결할 수 있습니다.</div>
            <div class="accessory-upload-row">`,
`          <div class="accessory-editor-head">
            <div class="accessory-annotation-nav" id="accessoryAnnotationNav"></div>
            <div class="accessory-selected" id="accessorySelectedTitle">연결할 지시선 항목을 선택하세요.</div>
            <div class="accessory-selected-help">위 번호를 선택한 뒤 아래 공통자재의 [연결하기]를 누르면 해당 명칭과 연결됩니다.</div>
            <div class="accessory-link-summary" id="accessoryLinkSummary"></div>
            <input class="accessory-search" id="accessorySearchInput" type="search" placeholder="공통 부속자재명 검색" />
            <div class="accessory-upload-row">`,
    '편집기 연결 안내/검색 UI',
  );

  editor = replaceOnce(
    editor,
`      var accessoryEditorList = document.getElementById('accessoryEditorList');
      var accessorySelectedTitle = document.getElementById('accessorySelectedTitle');`,
`      var accessoryEditorList = document.getElementById('accessoryEditorList');
      var accessoryAnnotationNav = document.getElementById('accessoryAnnotationNav');
      var accessorySelectedTitle = document.getElementById('accessorySelectedTitle');
      var accessoryLinkSummary = document.getElementById('accessoryLinkSummary');
      var accessorySearchInput = document.getElementById('accessorySearchInput');`,
    '편집기 연결 DOM 변수',
  );

  // Replace accessory editor render function only; request handlers stay untouched.
  editor = replaceRegexOnce(
    editor,
    /      function renderAccessoryEditor\(\) \{[\s\S]*?      \}\n\n      function sendAccessoryRequest/,
`      function renderAccessoryEditor() {
        var selected = current();
        var linkedIds = selected ? getAccessoryLinkIds(selected.id) : [];
        var searchText = String(accessorySearchInput.value || '').trim().toLowerCase();

        accessoryAnnotationNav.innerHTML = annotations.map(function (item) {
          var count = getAccessoryLinkIds(item.id).length;
          var active = item.id === selectedId ? 'active' : '';
          return '<button type="button" class="accessory-annotation-chip ' + active + '" data-id="' + esc(item.id) + '">' +
            '<span>' + esc(item.symbol) + '. ' + esc(item.title || '명칭 미입력') + '</span>' +
            '<span class="accessory-annotation-count">' + count + '</span>' +
          '</button>';
        }).join('');

        Array.prototype.forEach.call(accessoryAnnotationNav.querySelectorAll('.accessory-annotation-chip'), function (chip) {
          chip.addEventListener('click', function () {
            selectedId = chip.getAttribute('data-id') || '';
            renderOverlay();
            renderCaption();
            renderList();
            renderStatus();
            renderAccessoryEditor();
          });
        });

        accessorySelectedTitle.textContent = selected
          ? selected.symbol + '. ' + (selected.title || '부재명 미입력') + '에 연결할 부속자재'
          : '연결할 지시선 항목을 선택하세요.';

        accessoryLinkSummary.textContent = selected
          ? '현재 ' + linkedIds.length + '개 연결됨 · 변경 후 우측 상단 [저장] 버튼을 눌러 확정합니다.'
          : '위 번호를 먼저 선택해주세요.';

        newAccessoryUploadButton.disabled = accessoryRequestBusy || !selected;
        newAccessoryNameInput.disabled = accessoryRequestBusy || !selected;
        accessorySearchInput.disabled = accessoryRequestBusy;
        accessoryEditorList.classList.toggle('accessory-busy', accessoryRequestBusy);

        var visibleLibrary = accessoryLibrary.filter(function (accessory) {
          if (!searchText) return true;
          return String(accessory.name || '').toLowerCase().indexOf(searchText) >= 0;
        });

        if (!visibleLibrary.length) {
          accessoryEditorList.innerHTML = accessoryLibrary.length
            ? '<div class="empty">검색 결과가 없습니다.</div>'
            : '<div class="empty">등록된 공통 부속자재가 없습니다.<br/>위에서 부속자재명 입력 후 이미지를 업로드하세요.</div>';
          return;
        }

        accessoryEditorList.innerHTML = visibleLibrary.map(function (accessory) {
          var linked = !!selected && linkedIds.indexOf(accessory.id) >= 0;
          return '<div class="accessory-editor-card ' + (linked ? 'linked' : '') + '" data-id="' + esc(accessory.id) + '">' +
            '<img class="accessory-editor-thumb" src="' + esc(accessory.imageUrl) + '" alt="' + esc(accessory.name) + '" />' +
            '<div class="accessory-editor-info">' +
              '<div class="accessory-editor-name">' + esc(accessory.name) + '</div>' +
              '<div class="accessory-editor-state">' + (linked ? '✓ 현재 명칭에 연결됨' : '공통 라이브러리 · 연결 안됨') + '</div>' +
              '<div class="accessory-editor-actions">' +
                '<button type="button" data-action="replace" ' + (accessoryRequestBusy ? 'disabled' : '') + '>이미지 교체</button>' +
                '<button type="button" class="danger" data-action="delete" ' + (accessoryRequestBusy ? 'disabled' : '') + '>삭제</button>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="accessory-connect-button ' + (linked ? 'linked' : '') + '" data-action="connect" ' + (!selected || accessoryRequestBusy ? 'disabled' : '') + '>' +
              (linked ? '연결됨 ✓' : '연결하기') +
            '</button>' +
          '</div>';
        }).join('');

        Array.prototype.forEach.call(accessoryEditorList.querySelectorAll('.accessory-editor-card'), function (card) {
          var accessoryId = card.getAttribute('data-id');
          var accessory = accessoryLibrary.find(function (item) { return item.id === accessoryId; });

          var connectButton = card.querySelector('[data-action="connect"]');
          if (connectButton) {
            connectButton.addEventListener('click', function () {
              if (!selectedId || accessoryRequestBusy) return;
              var currentlyLinked = getAccessoryLinkIds(selectedId).indexOf(accessoryId) >= 0;
              setAccessoryLinked(selectedId, accessoryId, !currentlyLinked);
            });
          }

          var replaceButton = card.querySelector('[data-action="replace"]');
          if (replaceButton) {
            replaceButton.addEventListener('click', function () {
              if (!accessory || accessoryRequestBusy) return;
              pendingAccessoryUpload = { mode: 'replace', accessory: accessory };
              accessoryFileInput.value = '';
              accessoryFileInput.click();
            });
          }

          var deleteButton = card.querySelector('[data-action="delete"]');
          if (deleteButton) {
            deleteButton.addEventListener('click', function () {
              if (!accessory || accessoryRequestBusy) return;
              if (!window.confirm('"' + accessory.name + '" 공통 부속자재를 삭제하시겠습니까?\\n다른 명칭에서 연결한 내용도 함께 제거됩니다.')) return;
              sendAccessoryRequest('delete', { accessory: accessory });
            });
          }
        });
      }

      function sendAccessoryRequest`,
    '편집기 직관적 부속자재 연결 렌더',
  );

  editor = replaceOnce(
    editor,
`      descriptionInput.addEventListener('input', function () { updateSelected('description', descriptionInput.value); });`,
`      descriptionInput.addEventListener('input', function () { updateSelected('description', descriptionInput.value); });
      accessorySearchInput.addEventListener('input', function () {
        if (activePanelTab === 'accessory') renderAccessoryEditor();
      });`,
    '부속자재 검색 이벤트',
  );

  editor = editor.replace(
    `const viewerHtml = ({ imageUrl, title, annotations, layout, accessories }) => {`,
    `// v52.48.5.37 VIEW 선택연동 + 직관적 부속자재 연결 UI\nconst viewerHtml = ({ imageUrl, title, annotations, layout, accessories }) => {`,
  );

  fs.writeFileSync(PAGE, page, 'utf8');
  fs.writeFileSync(EDITOR, editor, 'utf8');
  fs.mkdirSync(path.dirname(SQL_DST), { recursive: true });
  fs.copyFileSync(SQL_SRC, SQL_DST);

  console.log(`[${VERSION}] 적용 완료`);
  console.log('- VIEW 번호/하단 명칭 클릭 -> 해당 명칭 연결 부속자재 즉시 표시');
  console.log('- 연결 id가 과거 데이터와 어긋난 경우 번호/명칭으로 보조 매칭');
  console.log('- 전체보기 -> 큰 이미지 연속표시 대신 작은 리스트');
  console.log('- 리스트 클릭 -> 우측 작은 미리보기');
  console.log('- 지시선 편집 > 부속자재 연결: 번호별 연결현황/연결버튼/검색 추가');
  console.log('- 기존 일위대가/기술자료 이미지/지시선/권한은 유지');
  console.log(`- SQL 생성: ${path.relative(ROOT, SQL_DST)}`);
  console.log(`- 백업: ${path.relative(ROOT, backupRoot)}`);
} catch (error) {
  console.error(`[적용 중단] ${error.message}`);
  console.error('예상 기준과 다른 부분이 있으면 기존 파일을 보호하기 위해 중단합니다.');
  process.exitCode = 1;
}
