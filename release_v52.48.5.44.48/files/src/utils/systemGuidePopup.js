// v52.48.5.44.48 시스템 가이드 별도 팝업 창 - 실제 화면 이미지 + 표시/설명 중심
import { normalizeGuideAnnotations, normalizeGuideSections } from '../config/guideCatalog.js';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const textToHtml = (value) => escapeHtml(value).replace(/\r?\n/g, '<br />');

const popupGeometry = () => {
  const aw = window.screen?.availWidth || window.innerWidth || 1440;
  const ah = window.screen?.availHeight || window.innerHeight || 900;
  const width = Math.max(1100, Math.min(1720, Math.floor(aw * 0.93)));
  const height = Math.max(760, Math.min(1140, Math.floor(ah * 0.94)));
  return { width, height, left: Math.max(0, Math.floor((aw-width)/2)), top: Math.max(0, Math.floor((ah-height)/2)) };
};
const openPopup = (name) => { const g=popupGeometry(); return window.open('',name,['popup=yes',`width=${g.width}`,`height=${g.height}`,`left=${g.left}`,`top=${g.top}`,'resizable=yes','scrollbars=yes'].join(',')); };

const style = `
*{box-sizing:border-box}html,body{margin:0;min-width:100%;min-height:100%;font-family:Arial,"Malgun Gothic",sans-serif;color:#0f172a;background:#f1f5f9}body{overflow-y:auto}button{font:inherit}.app{min-height:100vh;display:flex;flex-direction:column}.toolbar{position:sticky;top:0;z-index:20;min-height:58px;padding:8px 14px;display:flex;align-items:center;gap:10px;background:#0f172a;color:#fff;border-bottom:1px solid #334155}.toolbar-title{min-width:0;flex:1}.toolbar-kicker{color:#94a3b8;font-size:11px;font-weight:700}.toolbar-name{margin-top:2px;font-size:16px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.toolbar button{min-height:32px;padding:0 11px;border:1px solid #475569;border-radius:6px;background:#1e293b;color:#fff;font-size:12px;font-weight:800;cursor:pointer}.toolbar button:hover{background:#334155}.main{width:min(1320px,calc(100vw - 30px));margin:16px auto 34px}.hero{padding:18px 22px;background:#fff;border:1px solid #dbe3ec;border-radius:10px}.breadcrumb{color:#64748b;font-size:12px;font-weight:800}h1{margin:6px 0 0;font-size:25px;line-height:1.25;letter-spacing:-.035em}.summary{margin-top:10px;color:#475569;font-size:14px;line-height:1.7}.status{margin-top:11px;display:inline-flex;align-items:center;min-height:23px;padding:0 9px;border-radius:999px;background:#dcfce7;color:#166534;font-size:10px;font-weight:900}.overview{margin-top:16px;padding:20px 22px;background:#fff;border:1px solid #dbe3ec;border-radius:10px}.overview-title,.detail-title{margin:0;color:#ea580c;font-size:20px;font-weight:950;letter-spacing:-.03em}.overview-sub{margin-top:5px;color:#64748b;font-size:11px}.overview-grid{margin-top:15px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.overview-card{min-width:0}.overview-image{border:1px solid #d1d5db;border-radius:9px;overflow:hidden;background:#fff}.overview-caption{margin-top:9px;display:grid;grid-template-columns:26px minmax(0,1fr);gap:7px;align-items:start}.overview-num{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;background:#111827;color:#fff;font-size:11px;font-weight:900}.overview-name{font-size:12px;font-weight:900;line-height:1.4}.overview-desc{margin-top:3px;color:#64748b;font-size:10px;line-height:1.45}.details{margin-top:16px;display:flex;flex-direction:column;gap:18px}.section{padding:20px 22px;background:#fff;border:1px solid #dbe3ec;border-radius:10px;box-shadow:0 4px 14px rgba(15,23,42,.04)}.section-head{display:flex;align-items:flex-start;gap:10px}.section-index{flex:0 0 auto;min-width:42px;color:#ea580c;font-size:19px;font-weight:950;line-height:1.35}.section-title{font-size:19px;font-weight:950;line-height:1.35;color:#ea580c}.section-content{margin:7px 0 0 52px;color:#475569;font-size:12px;line-height:1.65}.guide-image-wrap{margin-top:14px;border:1px solid #cbd5e1;border-radius:10px;overflow:auto;background:#fff}.annotated-stage{position:relative;display:block;width:max-content;max-width:100%;margin:0 auto;line-height:0}.guide-image{display:block;width:auto;max-width:100%;max-height:820px;object-fit:contain;background:#fff}.ann-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.ann-badge{position:absolute;width:26px;height:26px;transform:translate(-50%,-50%);border-radius:50%;display:grid;place-items:center;color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4);font-size:11px;font-weight:950;line-height:1}.image-caption{padding:8px 10px;color:#64748b;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:10px;line-height:1.5}.annotation-list{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.annotation-item{display:grid;grid-template-columns:28px minmax(0,1fr);gap:8px;align-items:start;padding:8px 9px;border:1px solid #e2e8f0;border-radius:7px;background:#fff}.annotation-number{width:25px;height:25px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:11px;font-weight:950}.annotation-title{font-size:11px;font-weight:950;line-height:1.4}.annotation-desc{margin-top:3px;color:#64748b;font-size:10px;line-height:1.55;white-space:pre-wrap}.note{margin-top:12px;padding:9px 11px;border-left:4px solid #f59e0b;background:#fffbeb;color:#92400e;font-size:11px;font-weight:700;line-height:1.6}.empty{min-height:470px;display:grid;place-items:center;padding:30px;text-align:center}.empty-card{max-width:620px;padding:32px 34px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;box-shadow:0 10px 30px rgba(15,23,42,.08)}.empty-icon{width:58px;height:58px;margin:0 auto 13px;display:grid;place-items:center;border-radius:14px;background:#f1f5f9;color:#64748b;font-size:30px}.empty-title{font-size:18px;font-weight:900}.empty-desc{margin-top:8px;color:#64748b;font-size:13px;line-height:1.75}@media(max-width:980px){.overview-grid{grid-template-columns:1fr}.annotation-list{grid-template-columns:1fr}.section-content{margin-left:0}}@media print{body{background:#fff}.toolbar{display:none}.main{width:100%;margin:0}.hero,.overview,.section{box-shadow:none;break-inside:avoid}.overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`;

const annotationGraphicHtml = (annotations, uid) => {
  const items = normalizeGuideAnnotations(annotations);
  const svg = items.map((item) => {
    if (item.type === 'circle') return `<ellipse cx="${item.x + item.width/2}" cy="${item.y + item.height/2}" rx="${item.width/2}" ry="${item.height/2}" fill="none" stroke="${escapeHtml(item.color)}" stroke-width="1.35" vector-effect="non-scaling-stroke"/>`;
    if (item.type === 'box') return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="1" fill="none" stroke="${escapeHtml(item.color)}" stroke-width="1.35" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"/>`;
    if (item.type === 'arrow') return `<line x1="${item.x}" y1="${item.y}" x2="${item.x2}" y2="${item.y2}" stroke="${escapeHtml(item.color)}" stroke-width="2" vector-effect="non-scaling-stroke" marker-end="url(#arrow-${uid})"/>`;
    return '';
  }).join('');
  const badges = items.map((item) => {
    const x = item.type === 'number' ? item.x : item.type === 'arrow' ? item.x : Math.min(98,item.x+item.width);
    const y = item.type === 'number' ? item.y : item.type === 'arrow' ? item.y : Math.max(2,item.y);
    return `<span class="ann-badge" style="left:${x}%;top:${y}%;background:${escapeHtml(item.color)}">${escapeHtml(item.number)}</span>`;
  }).join('');
  return `<svg class="ann-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><marker id="arrow-${uid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="context-stroke"/></marker></defs>${svg}</svg>${badges}`;
};

const imageHtml = (section, uid, compact = false) => {
  const imageUrl = String(section?.imageUrl || '').trim();
  if (!imageUrl) return '<div style="padding:28px;color:#94a3b8;text-align:center;font-size:11px">화면 이미지 없음</div>';
  const caption = !compact && String(section?.imageCaption || '').trim();
  return `<div class="${compact?'overview-image':'guide-image-wrap'}"><div class="annotated-stage"><img class="guide-image" src="${escapeHtml(imageUrl)}" alt="가이드 화면"/>${annotationGraphicHtml(section?.annotations, uid)}</div>${caption?`<div class="image-caption">${textToHtml(caption)}</div>`:''}</div>`;
};

const explanationHtml = (annotations) => {
  const items = normalizeGuideAnnotations(annotations);
  if (!items.length) return '';
  return `<div class="annotation-list">${items.map((item) => `<div class="annotation-item"><div class="annotation-number" style="background:${escapeHtml(item.color)}">${escapeHtml(item.number)}</div><div><div class="annotation-title">${escapeHtml(item.title || `표시 ${item.number}`)}</div>${item.description?`<div class="annotation-desc">${escapeHtml(item.description)}</div>`:''}</div></div>`).join('')}</div>`;
};

const shell = ({ title, breadcrumb, body }) => `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>시스템 가이드 · ${escapeHtml(title)}</title><style>${style}</style></head><body><div class="app"><div class="toolbar"><div class="toolbar-title"><div class="toolbar-kicker">시스템 가이드</div><div class="toolbar-name">${escapeHtml(breadcrumb || title)}</div></div><button onclick="window.print()">인쇄</button><button onclick="window.close()">닫기</button></div>${body}</div></body></html>`;
const write = (popup, html) => { if(!popup || popup.closed) return false; popup.document.open(); popup.document.write(html); popup.document.close(); popup.focus(); return true; };

export const openSystemGuidePopup = ({ menuKey, label, breadcrumb }) => {
  const popup = openPopup(`systemGuide_${String(menuKey || 'unknown').replace(/[^a-z0-9_-]/gi,'_')}`);
  if (!popup) return null;
  write(popup, shell({ title:label||'가이드', breadcrumb:breadcrumb||label||'가이드', body:'<main class="main"><div class="empty"><div class="empty-card"><div class="empty-icon">?</div><div class="empty-title">가이드를 불러오는 중입니다.</div><div class="empty-desc">잠시만 기다려주세요.</div></div></div></main>' }));
  return popup;
};

export const renderSystemGuidePopup = (popup, { label='가이드', breadcrumb=label, title=label, summary='', sections=[], published=false, message='' }) => {
  const normalized = normalizeGuideSections(sections).map((section,index)=>({ ...section, imageUrl:String(sections?.[index]?.imageUrl || '') }));
  if (!published) return write(popup, shell({ title:label, breadcrumb, body:`<main class="main"><div class="empty"><div class="empty-card"><div class="empty-icon">?</div><div class="empty-title">가이드 준비중</div><div class="empty-desc">${textToHtml(message || '현재 메뉴의 가이드는 아직 공개되지 않았습니다.')}</div></div></div></main>` }));

  const withImages = normalized.filter((section)=>section.imageUrl);
  const overview = withImages.length ? `<section class="overview"><h2 class="overview-title">사용 순서 한눈에 보기</h2><div class="overview-sub">실제 화면의 번호와 표시를 따라 순서대로 확인하세요.</div><div class="overview-grid">${withImages.map((section,index)=>`<div class="overview-card">${imageHtml(section,`ov-${index}`,true)}<div class="overview-caption"><div class="overview-num">${index+1}</div><div><div class="overview-name">${escapeHtml(section.title || `화면 ${index+1}`)}</div>${section.content?`<div class="overview-desc">${textToHtml(section.content)}</div>`:''}</div></div></div>`).join('')}</div></section>` : '';

  const detail = normalized.map((section,index)=>{
    const anns = normalizeGuideAnnotations(section.annotations);
    return `<article class="section"><div class="section-head"><div class="section-index">${index+1}.</div><div class="section-title">${escapeHtml(section.title || `상세 이용가이드 ${index+1}`)}</div></div>${section.content?`<div class="section-content">${textToHtml(section.content)}</div>`:''}${imageHtml(section,`detail-${index}`,false)}${explanationHtml(anns)}${section.note?`<div class="note">${textToHtml(section.note)}</div>`:''}</article>`;
  }).join('');

  return write(popup, shell({ title, breadcrumb, body:`<main class="main"><section class="hero"><div class="breadcrumb">${escapeHtml(breadcrumb)}</div><h1>${escapeHtml(title)}</h1>${summary?`<div class="summary">${textToHtml(summary)}</div>`:''}<div class="status">공개 가이드</div></section>${overview}<section class="details"><h2 class="detail-title">상세 이용가이드</h2>${detail || '<article class="section">등록된 가이드 화면이 없습니다.</article>'}</section></main>` }));
};
