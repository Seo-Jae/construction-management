const fs = require('fs');
const path = require('path');

const VERSION = 'v52.48.5.31';
const ROOT = process.cwd();
const unitPricePath = path.join(ROOT, 'src', 'page', 'UnitPriceAnalysis.jsx');

if (!fs.existsSync(unitPricePath)) {
  console.error(`[적용 중단] 필수 파일을 찾지 못했습니다: ${path.relative(ROOT, unitPricePath)}`);
  process.exit(1);
}

const original = fs.readFileSync(unitPricePath, 'utf8');

if (original.includes('v52.48.5.31 기술자료 새창 보기')) {
  console.log(`[${VERSION}] 이미 적용된 코드입니다. 중복 적용하지 않습니다.`);
  process.exit(0);
}

function assertContains(source, needle, label) {
  if (!source.includes(needle)) {
    console.error(`[적용 중단] ${label} 기준 위치를 찾지 못했습니다.`);
    console.error('현재 코드를 유지하기 위해 아무 파일도 수정하지 않았습니다.');
    process.exit(1);
  }
}

function replaceOnce(source, needle, replacement, label) {
  assertContains(source, needle, label);
  const first = source.indexOf(needle);
  const second = source.indexOf(needle, first + needle.length);
  if (second !== -1) {
    console.error(`[적용 중단] ${label} 기준 위치가 2개 이상 발견되었습니다.`);
    console.error('안전한 자동 적용을 위해 아무 파일도 수정하지 않았습니다.');
    process.exit(1);
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

// v52.48.5.30까지 정상 적용된 현재 코드만 대상으로 합니다.
assertContains(original, 'v52.48.5.30 기술자료 이미지 상세보기', 'v52.48.5.30 상세보기 기능');
assertContains(original, 'canManageTechnicalImages = false', '기술자료 관리권한');
assertContains(original, '기술자료 이미지 업로드', '기술자료 업로드 UI');

let next = original;

// 1) 모달 상세보기용 state 제거. 새 브라우저 창은 별도 state가 필요 없습니다.
const previewState = `  // v52.48.5.30 기술자료 이미지 상세보기\n  const [technicalImagePreviewOpen, setTechnicalImagePreviewOpen] = useState(false);`;
next = replaceOnce(next, previewState, '', '기존 상세보기 state 제거');

// 2) 기존 기술자료 동작 로직 뒤에 새 브라우저 창 뷰어 함수 추가
const accessibleProjectsAnchor = `  const accessibleProjects = useMemo(() => {`;
assertContains(next, accessibleProjectsAnchor, '새창 보기 함수 삽입 위치');

const newWindowFunction = `  // v52.48.5.31 기술자료 새창 보기\n  // 일위대가 화면을 닫지 않고 기술자료를 나란히 참고할 수 있도록 별도 브라우저 창을 엽니다.\n  const openTechnicalImageWindow = useCallback(() => {\n    const imageUrl = String(selectedSpec?.image_url || '').trim();\n    if (!imageUrl) return;\n\n    const imageTitle = [selectedMiddle, selectedDetail]\n      .filter(Boolean)\n      .join(' · ') || '기술자료';\n\n    const escapeHtml = (value) => String(value || '')\n      .replaceAll('&', '&amp;')\n      .replaceAll('<', '&lt;')\n      .replaceAll('>', '&gt;')\n      .replaceAll('"', '&quot;')\n      .replaceAll("'", '&#039;');\n\n    const availableWidth = window.screen?.availWidth || window.innerWidth || 1440;\n    const availableHeight = window.screen?.availHeight || window.innerHeight || 900;\n    const popupWidth = Math.max(760, Math.min(1500, Math.floor(availableWidth * 0.78)));\n    const popupHeight = Math.max(620, Math.min(1100, Math.floor(availableHeight * 0.88)));\n    const popupLeft = Math.max(0, Math.floor((availableWidth - popupWidth) / 2));\n    const popupTop = Math.max(0, Math.floor((availableHeight - popupHeight) / 2));\n\n    const previewWindow = window.open(\n      '',\n      'unitPriceTechnicalImagePreview',\n      [\n        'popup=yes',\n        \`width=\${popupWidth}\`,\n        \`height=\${popupHeight}\`,\n        \`left=\${popupLeft}\`,\n        \`top=\${popupTop}\`,\n        'resizable=yes',\n        'scrollbars=yes',\n      ].join(','),\n    );\n\n    if (!previewWindow) {\n      showToast('기술자료 새 창이 차단되었습니다. 브라우저의 팝업 허용 후 다시 눌러주세요.', 'warning');\n      return;\n    }\n\n    const safeImageUrl = escapeHtml(imageUrl);\n    const safeTitle = escapeHtml(imageTitle);\n\n    previewWindow.document.open();\n    previewWindow.document.write(\`<!doctype html>\n<html lang="ko">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width,initial-scale=1" />\n  <title>기술자료 · \${safeTitle}</title>\n  <style>\n    * { box-sizing: border-box; }\n    html, body { margin: 0; width: 100%; height: 100%; background: #0f172a; font-family: Arial, "Malgun Gothic", sans-serif; }\n    body { display: flex; flex-direction: column; overflow: hidden; }\n    .toolbar { height: 58px; min-height: 58px; padding: 8px 12px; display: flex; align-items: center; gap: 8px; background: #ffffff; border-bottom: 1px solid #cbd5e1; }\n    .title-wrap { min-width: 0; flex: 1; }\n    .title { color: #0f172a; font-size: 15px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n    .sub { margin-top: 3px; color: #64748b; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n    button { height: 32px; padding: 0 11px; border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff; color: #334155; font-size: 12px; font-weight: 700; cursor: pointer; }\n    button:hover { background: #f8fafc; }\n    .viewer { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: center; padding: 14px; }\n    .image-wrap { min-width: 100%; min-height: 100%; display: grid; place-items: center; }\n    img { display: block; background: #ffffff; box-shadow: 0 12px 36px rgba(0,0,0,.32); }\n    img.fit { max-width: calc(100vw - 28px); max-height: calc(100vh - 86px); width: auto; height: auto; object-fit: contain; }\n    img.original { max-width: none; max-height: none; width: auto; height: auto; object-fit: initial; }\n  </style>\n</head>\n<body>\n  <div class="toolbar">\n    <div class="title-wrap">\n      <div class="title">기술자료 상세보기</div>\n      <div class="sub">\${safeTitle} · 본 창을 열어둔 상태로 기존 일위대가 화면을 함께 확인할 수 있습니다.</div>\n    </div>\n    <button id="fitButton" type="button">화면 맞춤</button>\n    <button id="originalButton" type="button">원본 크기</button>\n    <button id="closeButton" type="button">닫기</button>\n  </div>\n  <div class="viewer" id="viewer">\n    <div class="image-wrap">\n      <img id="technicalImage" class="fit" src="\${safeImageUrl}" alt="\${safeTitle}" />\n    </div>\n  </div>\n  <script>\n    (function () {\n      var image = document.getElementById('technicalImage');\n      var viewer = document.getElementById('viewer');\n      document.getElementById('fitButton').addEventListener('click', function () {\n        image.className = 'fit';\n        viewer.scrollTo({ top: 0, left: 0, behavior: 'smooth' });\n      });\n      document.getElementById('originalButton').addEventListener('click', function () {\n        image.className = 'original';\n      });\n      document.getElementById('closeButton').addEventListener('click', function () {\n        window.close();\n      });\n    }());\n  <\/script>\n</body>\n</html>\`);\n    previewWindow.document.close();\n    previewWindow.focus();\n  }, [selectedDetail, selectedMiddle, selectedSpec?.image_url, showToast]);\n\n`;

next = next.replace(accessibleProjectsAnchor, newWindowFunction + accessibleProjectsAnchor);

// 3) 썸네일 클릭 동작을 화면 위 모달이 아니라 새 브라우저 창으로 변경
const imageBefore = `                          <Tooltip title="클릭해서 크게 보기" arrow>\n                            <Box\n                              component="img"\n                              src={selectedSpec.image_url}\n                              alt={selectedSpec.detail_category || '기술자료'}\n                              role="button"\n                              tabIndex={0}\n                              aria-label="기술자료 이미지 크게 보기"\n                              onClick={() => setTechnicalImagePreviewOpen(true)}\n                              onKeyDown={(event) => {\n                                if (event.key === 'Enter' || event.key === ' ') {\n                                  event.preventDefault();\n                                  setTechnicalImagePreviewOpen(true);\n                                }\n                              }}\n                              sx={{\n                                width: '100%',\n                                maxHeight: 260,\n                                objectFit: 'contain',\n                                display: 'block',\n                                cursor: 'zoom-in',\n                                transition: 'opacity 0.15s ease, transform 0.15s ease',\n                                '&:hover': {\n                                  opacity: 0.92,\n                                  transform: 'scale(1.01)',\n                                },\n                                '&:focus-visible': {\n                                  outline: '2px solid #2563eb',\n                                  outlineOffset: 2,\n                                },\n                              }}\n                            />\n                          </Tooltip>`;

const imageAfter = `                          <Tooltip title="새 창에서 크게 보기" arrow>\n                            <Box\n                              component="img"\n                              src={selectedSpec.image_url}\n                              alt={selectedSpec.detail_category || '기술자료'}\n                              role="button"\n                              tabIndex={0}\n                              aria-label="기술자료 이미지를 새 창에서 보기"\n                              onClick={openTechnicalImageWindow}\n                              onKeyDown={(event) => {\n                                if (event.key === 'Enter' || event.key === ' ') {\n                                  event.preventDefault();\n                                  openTechnicalImageWindow();\n                                }\n                              }}\n                              sx={{\n                                width: '100%',\n                                maxHeight: 260,\n                                objectFit: 'contain',\n                                display: 'block',\n                                cursor: 'pointer',\n                                transition: 'opacity 0.15s ease, transform 0.15s ease',\n                                '&:hover': {\n                                  opacity: 0.92,\n                                  transform: 'scale(1.01)',\n                                },\n                                '&:focus-visible': {\n                                  outline: '2px solid #2563eb',\n                                  outlineOffset: 2,\n                                },\n                              }}\n                            />\n                          </Tooltip>`;

next = replaceOnce(next, imageBefore, imageAfter, '기술자료 썸네일 새창 보기');

// 4) v52.48.5.30에서 추가한 화면 위 Dialog 상세보기 전체 제거
const previewDialogStart = `      {/* v52.48.5.30 기술자료 이미지 상세보기 - 조회는 모든 일위대가 열람 사용자에게 제공 */}`;
const nameGuideDialogAnchor = `      <Dialog\n        open={nameGuideDialogOpen}`;
const previewStartIndex = next.indexOf(previewDialogStart);
const previewEndIndex = next.indexOf(nameGuideDialogAnchor, previewStartIndex);
if (previewStartIndex === -1 || previewEndIndex === -1) {
  console.error('[적용 중단] 기존 기술자료 상세보기 Dialog 영역을 정확히 찾지 못했습니다.');
  console.error('현재 코드를 유지하기 위해 아무 파일도 수정하지 않았습니다.');
  process.exit(1);
}
next = next.slice(0, previewStartIndex) + next.slice(previewEndIndex);

// 모든 변환이 성공한 뒤에만 백업하고 실제 파일을 수정합니다.
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, `backup_${VERSION}_${timestamp}`);
fs.mkdirSync(path.join(backupDir, 'src', 'page'), { recursive: true });
fs.copyFileSync(unitPricePath, path.join(backupDir, 'src', 'page', 'UnitPriceAnalysis.jsx'));
fs.writeFileSync(unitPricePath, next, 'utf8');

console.log('');
console.log(`[${VERSION}] 적용 완료`);
console.log(`백업: ${path.relative(ROOT, backupDir)}`);
console.log('수정: src/page/UnitPriceAnalysis.jsx');
console.log('DB / Supabase SQL 변경 없음');
console.log('기존 계산·저장·버전관리·업로드 권한·이미지 데이터 변경 없음');
console.log('');
console.log('[변경 내용]');
console.log('- 기존 화면을 덮는 상세보기 Dialog 제거');
console.log('- 기술자료 클릭 시 독립 브라우저 창으로 표시');
console.log('- 새 창을 열어둔 채 기존 일위대가 화면 계속 조작 가능');
console.log('- 새 창에서 화면 맞춤 / 원본 크기 전환 가능');
console.log('');
console.log('[다음 단계]');
console.log('1) npm.cmd run build');
console.log('2) npm.cmd run dev');
console.log('3) 일위대가작성 > 기술자료 클릭 > 새 창을 열어둔 채 일위대가 값 확인');
console.log('');
