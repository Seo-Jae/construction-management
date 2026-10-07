// Uploaded sheets carry their original NO. Unnumbered/manual entries retain
// their input order after the numbered roster; never mutate saved report data.
export function orderDailyReportWorkers(workers = []) {
  const sequence = worker => {
    const value = Number(worker?.sequence);
    return Number.isInteger(value) && value > 0 ? value : Infinity;
  };
  return [...workers].sort((a, b) => {
    const left = sequence(a);
    const right = sequence(b);
    return left === right ? 0 : left < right ? -1 : 1;
  });
}
