function printOptions(settings, printers, pageCount, landscape) {
  if (!settings || !printers.some(printer => printer.name === settings.deviceName)) throw new Error('프린터를 선택해주세요.');
  const copies = Number(settings.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > 999) throw new Error('인쇄 매수는 1~999 사이로 입력해주세요.');
  if (!['simplex', 'longEdge', 'shortEdge'].includes(settings.duplexMode)) throw new Error('양면 인쇄 설정을 확인해주세요.');
  const ranges = [];
  const pages = String(settings.pages || '').trim();
  if (pages.length > 500) throw new Error('페이지 범위가 너무 깁니다.');
  if (pages) for (const part of pages.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    const from = Number(match?.[1]), to = Number(match?.[2] || match?.[1]);
    if (!match || from < 1 || to < from || to > pageCount) throw new Error(`페이지는 1~${pageCount} 사이로 입력해주세요. (예: 1-3, 5)`);
    ranges.push({ from: from - 1, to: to - 1 });
  }
  ranges.sort((a, b) => a.from - b.from);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return { silent: true, deviceName: settings.deviceName, copies, duplexMode: settings.duplexMode,
    color: settings.color !== false, printBackground: true, landscape, collate: true,
    ...(merged.length ? { pageRanges: merged } : {}) };
}
module.exports = { printOptions };
