export function workforceMonths(endMonth, count = 6) {
  const [year, month] = endMonth.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - count + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

export function workforceWeek(dateKey, offset = 0) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function summarizeWeeklyWorkforce(rows, projectName, dates, today) {
  const dailyPeople = new Map();
  const firstDates = new Map();
  for (const row of rows) {
    const date = normalizeWorkforceDate(row.date);
    if (row.project_name !== projectName || !date || date > today) continue;
    if (!dailyPeople.has(date)) dailyPeople.set(date, new Set());
    for (const worker of Array.isArray(row.workers) ? row.workers : []) {
      const name = String(worker?.name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      if (!name) continue;
      const id = `${String(worker.job || '').trim()}::${name}`;
      dailyPeople.get(date).add(id);
      if (!firstDates.has(id) || date < firstDates.get(id)) firstDates.set(id, date);
    }
  }
  let cumulative = 0;
  return dates.map(date => {
    const current = dailyPeople.get(date) || new Set();
    const future = date > today;
    cumulative += current.size;
    return { date, future, total: future ? null : current.size,
      cumulative: future ? null : cumulative,
      added: future ? null : [...current].filter(id => firstDates.get(id) === date).length };
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
