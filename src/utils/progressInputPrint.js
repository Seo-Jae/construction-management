import { prepareMultiProgressPrint, clearMultiProgressPrint } from './multiProgressPrint.js';

export function prepareProgressInputPrint(grid, description) {
  if (!grid) {
    clearMultiProgressPrint();
    return;
  }
  const area = document.createElement('div');
  const header = document.createElement('div');
  header.className = 'multi-progress-print-only';
  header.style.cssText = 'flex-direction:column;gap:8px;padding:0 0 12px;border-bottom:2px solid #334155';
  const title = document.createElement('strong');
  title.style.fontSize = '22px';
  title.textContent = '공종별 현황 입력';
  const subtitle = document.createElement('div');
  subtitle.style.fontSize = '14px';
  subtitle.textContent = description;
  header.append(title, subtitle);
  const diagram = grid.cloneNode(true);
  diagram.removeAttribute('id');
  diagram.classList.add('multi-progress-buildings');
  area.append(header, diagram);
  prepareMultiProgressPrint(area);
}
