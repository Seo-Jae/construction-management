// A separate print sheet prevents dashboard height/zoom and hidden siblings
// from creating extra pages. Measure the full diagram, not its scroll viewport.
export const MULTI_PROGRESS_PRINT_CSS = `
  .multi-progress-print-only { display: none; }
  #multi-progress-print-sheet {
    position: fixed; left: -100000px; top: 0;
    width: 281mm; height: 193mm; padding: 0; margin: 0;
    overflow: hidden; background: white; box-sizing: border-box;
    pointer-events: none;
  }
  #multi-progress-print-sheet .multi-progress-print-content {
    position: absolute !important; left: 0; top: 0;
    display: flex !important; flex-direction: column; gap: 12px;
    height: auto !important; min-height: 0 !important;
    padding: 0 !important; margin: 0 !important;
    overflow: visible !important; transform-origin: top left;
  }
  #multi-progress-print-sheet .multi-progress-print-only { display: flex !important; }
  #multi-progress-print-sheet .multi-progress-stats {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  }
  #multi-progress-print-sheet .multi-progress-scroll {
    flex: none !important; height: auto !important; min-height: 0 !important;
    overflow: visible !important; padding: 4px !important;
    background: white !important; border: none !important;
  }
  #multi-progress-print-sheet .multi-progress-buildings {
    width: max-content !important; min-width: 0 !important; min-height: 0 !important;
    display: flex !important; flex-wrap: nowrap !important;
    align-items: flex-end !important; gap: 20px !important; padding: 0 !important;
  }
  #multi-progress-print-sheet .MuiPaper-root { box-shadow: none !important; }
  @media print {
    @page { size: A4 landscape; margin: 8mm; }
    html:has(body.multi-progress-printing), body.multi-progress-printing {
      width: 281mm !important; height: auto !important;
      min-width: 0 !important; min-height: 0 !important;
      margin: 0 !important; padding: 0 !important;
      overflow: visible !important; zoom: 1 !important; background: white !important;
    }
    body.multi-progress-printing > :not(#multi-progress-print-sheet) { display: none !important; }
    body.multi-progress-printing > #multi-progress-print-sheet {
      position: relative !important; left: 0 !important; top: 0 !important;
      break-inside: avoid; page-break-inside: avoid;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    }
  }
`;

export function clearMultiProgressPrint() {
  document.getElementById('multi-progress-print-sheet')?.remove();
  document.body.classList.remove('multi-progress-printing');
}

export function prepareMultiProgressPrint(area) {
  clearMultiProgressPrint();
  if (!area) return;
  const sheet = document.createElement('div');
  sheet.id = 'multi-progress-print-sheet';
  sheet.setAttribute('aria-hidden', 'true');
  const content = area.cloneNode(true);
  content.removeAttribute('id');
  content.classList.add('multi-progress-print-content');
  content.querySelectorAll('.multi-progress-no-print').forEach((node) => node.remove());
  sheet.append(content);
  document.body.append(sheet);

  // offset/scroll dimensions are CSS pixels and do not depend on dashboard zoom.
  const diagram = content.querySelector('.multi-progress-buildings');
  content.style.width = `${Math.max(sheet.clientWidth, (diagram?.scrollWidth || 0) + 8)}px`;
  const width = Math.max(content.scrollWidth, content.offsetWidth);
  const height = Math.max(content.scrollHeight, content.offsetHeight);
  const scale = Math.min(1, (sheet.clientWidth - 2) / Math.max(1, width), (sheet.clientHeight - 2) / Math.max(1, height));
  content.style.transform = `scale(${scale})`;
  document.body.classList.add('multi-progress-printing');
}
