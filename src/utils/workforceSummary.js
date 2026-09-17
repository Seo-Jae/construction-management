export function workforceMonths(endMonth, count = 6) {
  const [year, month] = endMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - count + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

export function normalizeWorkforceDate(value) {
  const match = String(value || '').trim().match(/^(\d{2}|\d{4})[-.](\d{2})[-.](\d{2})$/);
  if (!match) return null;
  const year = match[1].length === 2 ? `20${match[1]}` : match[1];
  const normalized = `${year}-${match[2]}-${match[3]}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === normalized ? normalized : null;
}

export function summarizeWorkforce(rows, projectName, months, today) {
  const people = new Map();
  const firstMonths = new Map();
  const dailyPeople = new Map();
  for (const row of rows) {
    const date = normalizeWorkforceDate(row.date);
    if (row.project_name !== projectName || !date || date > today) continue;
    const month = date.slice(0, 7);
    if (!people.has(month)) people.set(month, new Set());
    if (!dailyPeople.has(date)) dailyPeople.set(date, new Set());
    for (const worker of Array.isArray(row.workers) ? row.workers : []) {
      const name = String(worker?.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (!name) continue;
      // Match the existing monthly worker screen's identity rule.
      const id = `${String(worker.job || '').trim()}::${name}`;
      people.get(month).add(id);
      dailyPeople.get(date).add(id);
      if (!firstMonths.has(id) || month < firstMonths.get(id)) firstMonths.set(id, month);
    }
  }
  return months.map((month) => {
    const current = people.get(month) || new Set();
    const days = [...dailyPeople.entries()].filter(([date]) => date.startsWith(month));
    const dailyTotal = days.reduce((sum, [, workers]) => sum + workers.size, 0);
    return {
      month, total: current.size,
      cumulative: dailyTotal,
      average: days.length ? dailyTotal / days.length : 0,
      added: [...current].filter((id) => firstMonths.get(id) === month).length,
    };
  });
}
