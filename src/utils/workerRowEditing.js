export function duplicateWorkerRows(rows, selectedIds, makeId = () => crypto.randomUUID()) {
  const selected = new Set(selectedIds);
  return rows.filter(row => selected.has(row.id)).map(row => ({
    ...row, id: makeId(), sequence: null,
  }));
}

export function applyWorkerBulkEdit(rows, selectedIds, values) {
  const selected = new Set(selectedIds);
  const patch = Object.fromEntries(['process', 'location', 'workContent']
    .filter(field => Object.hasOwn(values, field))
    .map(field => [field, String(values[field] ?? '').trim()]));
  return rows.map(row => selected.has(row.id) ? { ...row, ...patch } : row);
}
