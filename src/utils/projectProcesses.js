export const DEFAULT_PROJECT_PROCESSES = ['바닥먹', '허리먹', '단열', '합지', '경량골조', '경량석고', '세대천정', '1차몰딩', '2차몰딩', '1차 걸레받이', '2차 걸레받이'];

export function getProjectProcessOptions(projectName) {
  const defaults = [...DEFAULT_PROJECT_PROCESSES];
  if (String(projectName || '').replace(/\s+/g, '').includes('마크밸리')) defaults.splice(3, 0, '조적단열');
  return defaults;
}

export function mergeProjectProcesses(defaults, rows) {
  return [...new Set([...defaults, ...rows.map((row) => row.process_type)].map((name) => String(name || '').trim()).filter(Boolean))];
}

export function buildProcessCatalog(defaults, rows) {
  const byName = new Map(rows.map(row => [row.process_type, row]));
  return mergeProjectProcesses(defaults, rows).map((name, index) => ({
    process_type: name, is_enabled: byName.get(name)?.is_enabled !== false,
    display_name: byName.get(name)?.display_name || name,
    is_archived: byName.get(name)?.is_archived === true,
    sort_order: byName.get(name)?.sort_order ?? (100000 + index),
  })).sort((a, b) => a.sort_order - b.sort_order);
}

export function changeProcessCatalog(catalog, action) {
  let next = catalog.map(row => ({ ...row }));
  const index = next.findIndex(row => row.process_type === action.name);
  if (action.type === 'add') {
    if (index >= 0 && !next[index].is_archived) throw new Error('ALREADY_EXISTS');
    if (index >= 0) next[index] = { ...next[index], is_archived: false, is_enabled: true };
    else next.push({ process_type: action.name, is_archived: false, is_enabled: true });
  } else if (index >= 0) {
    if (action.type === 'toggle') next[index].is_enabled = action.enabled;
    if (action.type === 'archive') next[index] = { ...next[index], is_archived: true, is_enabled: false };
    if (action.type === 'move') {
      const step = action.direction < 0 ? -1 : 1;
      let target = index + step;
      while (target >= 0 && target < next.length && next[target].is_archived) target += step;
      if (target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
    }
  }
  return next.map((row, index) => ({ ...row, sort_order: index }));
}

export function getWeeklyProcesses(template, names) {
  if (!Array.isArray(names)) return template.map(row => ({ ...row }));
  const labels = new Map(template.map(row => [row.processType, row.label]));
  const unique = [...new Set(names.map(name => name === '합지석고' ? '합지' : name).filter(Boolean))];
  return unique.map(processType => ({ processType, label: labels.get(processType) || processType }));
}

// Keep the ten-row document body intact, while honoring selected process order.
export function writeWeeklyProcessStats(workbook, worksheet, stats) {
  for (let index = 0; index < 10; index += 1) {
    const row = stats[index];
    worksheet.getCell(`B${8 + index}`).value = row?.label || row?.processType || '';
    worksheet.getCell(`C${8 + index}`).value = row?.progressText || '';
    worksheet.getCell(`D${8 + index}`).value = Number(row?.weeklyAmount) || '';
  }
  const extra = stats.slice(10);
  if (!extra.length) return;
  const sheet = workbook.addWorksheet('추가 공종 현황');
  sheet.columns = [
    { header: '공종', key: 'label', width: 25 },
    { header: '누계 진척', key: 'progressText', width: 24 },
    { header: '금주 완료', key: 'weeklyAmount', width: 16 },
  ];
  extra.forEach(row => sheet.addRow({ label: row.label || row.processType, progressText: row.progressText, weeklyAmount: row.weeklyAmount || 0 }));
  sheet.getRow(1).font = { bold: true };
  sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}
