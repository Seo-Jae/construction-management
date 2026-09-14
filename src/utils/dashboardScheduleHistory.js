export const scheduleHistoryFields = ['constructionCompany', 'siteName', 'trade', 'briefingAt', 'bidAt', 'attendees', 'note'];

export const scheduleHistoryYears = (rows) => [...new Set(rows.flatMap(({ snapshot }) =>
  [snapshot?.briefingAt, snapshot?.bidAt].map((value) => String(value || '').slice(0, 4))
    .filter((value) => /^\d{4}$/.test(value))))].sort().reverse();

export const filterScheduleHistory = (rows, search, year) => {
  const terms = String(search || '').trim().toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
  return rows.filter(({ snapshot = {} }) => {
    const text = [...scheduleHistoryFields.map((field) => snapshot[field]), snapshot.projectName]
      .filter(Boolean).join(' ').toLocaleLowerCase('ko-KR');
    return terms.every((term) => text.includes(term)) && (!year ||
      [snapshot.briefingAt, snapshot.bidAt].some((value) => String(value || '').slice(0, 4) === year));
  });
};

export const canArchiveSavedSchedule = (schedule, savedRows) => {
  const saved = savedRows.find((row) => row.id === schedule?.id);
  return Boolean(saved) && scheduleHistoryFields.every((field) =>
    String(schedule?.[field] || '') === String(saved[field] || ''));
};
