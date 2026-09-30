export const DAILY_COMPLETION_PRINT_CSS = `
  #daily-completion-print-sheet { position:fixed; left:-100000px; top:0; width:281mm; height:193mm; background:white; overflow:hidden; pointer-events:none; }
  #daily-completion-print-content { transform-origin:top left; padding:0; margin:0; }
  #daily-completion-print-sheet h1 { font:700 22px sans-serif; margin:0 0 10px; }
  #daily-completion-print-sheet p { font:14px sans-serif; margin:0 0 16px; }
  #daily-completion-print-sheet table { border-collapse:collapse; table-layout:fixed; }
  #daily-completion-print-sheet th, #daily-completion-print-sheet td { position:static !important; left:auto !important; top:auto !important; box-shadow:none !important; }
  @media print {
    @page { size:A4 landscape; margin:8mm; }
    html:has(body.daily-completion-printing), body.daily-completion-printing { width:281mm !important; height:auto !important; min-width:0 !important; min-height:0 !important; margin:0 !important; padding:0 !important; zoom:1 !important; overflow:visible !important; }
    body.daily-completion-printing > :not(#daily-completion-print-sheet) { display:none !important; }
    body.daily-completion-printing > #daily-completion-print-sheet { position:relative !important; left:0 !important; top:0 !important; break-inside:avoid; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  }
`;

export function clearDailyCompletionPrint() {
  document.getElementById('daily-completion-print-sheet')?.remove();
  document.body.classList.remove('daily-completion-printing');
}

export function prepareDailyCompletionPrint(table, description) {
  clearDailyCompletionPrint();
  if (!table) return;
  const sheet = document.createElement('div');
  sheet.id = 'daily-completion-print-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  content.id = 'daily-completion-print-content';
  const title = document.createElement('h1');
  title.textContent = '일별 완료 집계';
  const subtitle = document.createElement('p');
  subtitle.textContent = description;
  const copy = table.cloneNode(true);
  copy.removeAttribute('id');
  const width = Math.max(table.scrollWidth, table.offsetWidth);
  copy.style.width = `${width}px`;
  content.style.width = `${width}px`;
  content.append(title, subtitle, copy);
  sheet.append(content);
  document.body.append(sheet);
  const scale = Math.min(1, (sheet.clientWidth - 2) / Math.max(content.scrollWidth, 1),
    (sheet.clientHeight - 2) / Math.max(content.scrollHeight, 1));
  content.style.transform = `scale(${scale})`;
  document.body.classList.add('daily-completion-printing');
}
