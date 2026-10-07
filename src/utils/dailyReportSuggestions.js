// Previously used names come first; keep job categories separate from process names.
export function dailyReportSuggestions(reports, field, defaults, normalize = value => String(value || '').trim()) {
  const names = Object.keys(reports).sort().flatMap(date =>
    (reports[date]?.workers || []).map(worker => normalize(worker?.[field])));
  return [...new Set([...names, ...defaults.map(normalize)].filter(Boolean))];
}

export function workerAutocompleteCommitValue(input) {
  const activeId = input?.getAttribute('aria-activedescendant');
  const option = activeId ? input.ownerDocument.getElementById(activeId) : null;
  return String(option?.getAttribute('role') === 'option' ? option.textContent : input?.value || '').trim();
}
