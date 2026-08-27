// v52.48.5.44.47 시스템 가이드 별도 팝업 창
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const textToHtml = (value) => escapeHtml(value).replace(/\r?\n/g, '<br />');

const popupGeometry = () => {
  const aw = window.screen?.availWidth || window.innerWidth || 1440;
  const ah = window.screen?.availHeight || window.innerHeight || 900;
  const width = Math.max(980, Math.min(1540, Math.floor(aw * 0.88)));
  const height = Math.max(720, Math.min(1080, Math.floor(ah * 0.92)));
  return { width, height, left: Math.max(0, Math.floor((aw - width) / 2)), top: Math.max(0, Math.floor((ah - height) / 2)) };
};

const openPopup = (name) => {
  const g = popupGeometry();
  return window.open('', name, [
    'popup=yes', `width=${g.width}`, `height=${g.height}`, `left=${g.left}`, `top=${g.top}`,
    'resizable=yes', 'scrollbars=yes',
  ].join(','));
};

const style = `
*{box-sizing:border-box}html,body{margin:0;min-width:100%;min-height:100%;font-family:Arial,"Malgun Gothic",sans-serif;color:#0f172a;background:#e2e8f0}body{overflow-y:auto}button{font:inherit}.app{min-height:100vh;display:flex;flex-direction:column}.toolbar{position:sticky;top:0;z-index:10;min-height:58px;padding:8px 14px;display:flex;align-items:center;gap:10px;background:#0f172a;color:#fff;border-bottom:1px solid #334155}.toolbar-title{min-width:0;flex:1}.toolbar-kicker{color:#94a3b8;font-size:11px;font-weight:700}.toolbar-name{margin-top:2px;font-size:16px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.toolbar button{min-height:32px;padding:0 11px;border:1px solid #475569;border-radius:6px;background:#1e293b;color:#fff;font-size:12px;font-weight:800;cursor:pointer}.toolbar button:hover{background:#334155}.main{width:min(1180px,calc(100vw - 28px));margin:14px auto 30px}.hero,.section{background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 8px 24px rgba(15,23,42,.08)}.hero{padding:20px 22px}.breadcrumb{color:#64748b;font-size:12px;font-weight:800}h1{margin:6px 0 0;font-size:24px;line-height:1.25;letter-spacing:-.03em}.summary{margin-top:12px;color:#475569;font-size:14px;line-height:1.75}.status{margin-top:12px;display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:900}.sections{margin-top:12px;display:flex;flex-direction:column;gap:12px}.section{padding:18px 20px}.section-head{display:flex;align-items:center;gap:9px}.step{flex:0 0 auto;min-width:30px;height:30px;padding:0 7px;border-radius:999px;display:grid;place-items:center;background:#2563eb;color:#fff;font-size:12px;font-weight:900}.section-title{font-size:17px;font-weight:900}.section-content{margin-top:11px;color:#334155;font-size:14px;line-height:1.8}.guide-image-wrap{margin-top:14px;overflow:hidden;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}.guide-image{display:block;width:100%;max-height:720px;object-fit:contain;background:#fff}.image-caption{padding:8px 10px;color:#64748b;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.55}.note{margin-top:12px;padding:10px 12px;border-left:4px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:12px;font-weight:700;line-height:1.7}.empty{min-height:470px;display:grid;place-items:center;padding:30px;text-align:center}.empty-card{max-width:620px;padding:32px 34px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.08)}.empty-icon{width:58px;height:58px;margin:0 auto 13px;display:grid;place-items:center;border-radius:14px;background:#f1f5f9;color:#64748b;font-size:30px}.empty-title{font-size:18px;font-weight:900}.empty-desc{margin-top:8px;color:#64748b;font-size:13px;line-height:1.75}@media print{body{background:#fff}.toolbar{display:none}.main{width:100%;margin:0}.hero,.section{box-shadow:none;break-inside:avoid}}
`;

const shell = ({ title, breadcrumb, body }) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>시스템 가이드 · ${escapeHtml(title)}</title><style>${style}</style></head><body><div class="app"><div class="toolbar"><div class="toolbar-title"><div class="toolbar-kicker">시스템 가이드</div><div class="toolbar-name">${escapeHtml(breadcrumb || title)}</div></div><button onclick="window.print()">인쇄</button><button onclick="window.close()">닫기</button></div>${body}</div></body></html>`;
const write = (popup, html) => { if (!popup || popup.closed) return false; popup.document.open(); popup.document.write(html); popup.document.close(); popup.focus(); return true; };

export const openSystemGuidePopup = ({ menuKey, label, breadcrumb }) => {
  const popup = openPopup(`systemGuide_${String(menuKey || 'unknown').replace(/[^a-z0-9_-]/gi, '_')}`);
  if (!popup) return null;
  write(popup, shell({ title: label || '가이드', breadcrumb: breadcrumb || label || '가이드', body: `<main class="main"><div class="empty"><div class="empty-card"><div class="empty-icon">?</div><div class="empty-title">가이드를 불러오는 중입니다.</div><div class="empty-desc">잠시만 기다려주세요.</div></div></div></main>` }));
  return popup;
};

export const renderSystemGuidePopup = (popup, { label='가이드', breadcrumb=label, title=label, summary='', sections=[], published=false, message='' }) => {
  const normalized = Array.isArray(sections) ? sections : [];
  if (!published) return write(popup, shell({ title: label, breadcrumb, body: `<main class="main"><div class="empty"><div class="empty-card"><div class="empty-icon">?</div><div class="empty-title">가이드 준비중</div><div class="empty-desc">${textToHtml(message || '현재 메뉴의 가이드는 아직 공개되지 않았습니다.')}</div></div></div></main>` }));
  const sectionHtml = normalized.map((section, index) => {
    const imageUrl = String(section?.imageUrl || '').trim();
    const caption = String(section?.imageCaption || '').trim();
    const note = String(section?.note || '').trim();
    return `<article class="section"><div class="section-head"><div class="step">${index + 1}</div><div class="section-title">${escapeHtml(section?.title || `단계 ${index + 1}`)}</div></div>${section?.content ? `<div class="section-content">${textToHtml(section.content)}</div>` : ''}${imageUrl ? `<div class="guide-image-wrap"><img class="guide-image" src="${escapeHtml(imageUrl)}" alt="가이드 이미지"/>${caption ? `<div class="image-caption">${textToHtml(caption)}</div>` : ''}</div>` : ''}${note ? `<div class="note">${textToHtml(note)}</div>` : ''}</article>`;
  }).join('');
  return write(popup, shell({ title, breadcrumb, body: `<main class="main"><section class="hero"><div class="breadcrumb">${escapeHtml(breadcrumb)}</div><h1>${escapeHtml(title)}</h1>${summary ? `<div class="summary">${textToHtml(summary)}</div>` : ''}<div class="status">공개 가이드</div></section><section class="sections">${sectionHtml || '<article class="section"><div class="section-content">등록된 단계가 없습니다.</div></article>'}</section></main>` }));
};
