const normalizeName = (value) => String(value || '').trim().replace(/\s+/g, '').toLowerCase();
const completed = new Set(['manager_confirmed', 'excluded']);

// Callers supply only the selected project's current-month rows.
export function countMissingContracts(contracts = [], reports = []) {
  const registered = new Set(contracts.map((row) => normalizeName(row.normalized_name || row.name || row.worker_name)).filter(Boolean));
  const unregistered = new Set();
  for (const report of reports) {
    for (const worker of Array.isArray(report.workers) ? report.workers : []) {
      const name = normalizeName(worker?.name);
      if (name && !registered.has(name)) unregistered.add(name);
    }
  }
  return contracts.filter((row) => !completed.has(row.status)).length + unregistered.size;
}
