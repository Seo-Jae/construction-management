import { normalizeWorkforceDate } from './workforceSummary.js';
import { countMissingContracts } from './contractWorkSummary.js';

export const getDashboardReportPeriod = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const today = `${values.year}-${values.month}-${values.day}`;
  const date = new Date(`${today}T00:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - weekday);
  return { today, month: today.slice(0, 7), weekStart: date.toISOString().slice(0, 10), weeklyDue: weekday >= 4 };
};

export const hasMeaningfulDailyReport = (report) => {
  const workers = Array.isArray(report?.workers) ? report.workers : [];
  const tasks = Array.isArray(report?.tasks) ? report.tasks : [];
  return workers.some((worker) =>
    ['name', 'job', 'process', 'location'].some((key) => String(worker?.[key] || '').trim())
    || String(worker?.workContent || worker?.work_content || '').trim()
    || Number(worker?.day) > 0 || Number(worker?.night) > 0)
    || tasks.some((task) => Object.values(task || {}).some((value) => String(value ?? '').trim()))
    || Boolean(String(report?.today_task || '').trim() || String(report?.tomorrow_task || '').trim());
};

export const buildDashboardReportTasks = ({ projectName, period, canDaily, canWeekly, canContract,
  dailyReports = [], weeklyReports = [], contracts = [], contractDailyReports = [] }) => {
  const tasks = [];
  if (canDaily && !dailyReports.some((row) => row.project_name === projectName
    && normalizeWorkforceDate(row.date) === period.today && hasMeaningfulDailyReport(row))) {
    tasks.push({ id: `daily:${period.today}`, title: '금일 공사일보', status: '미작성', view: 'daily' });
  }
  if (canWeekly && period.weeklyDue && !weeklyReports.some((row) => row.project_name === projectName
    && row.week_start === period.weekStart && row.status === 'completed')) {
    tasks.push({ id: `weekly:${period.weekStart}`, title: '주간업무보고', status: '미작성', view: 'report-weekly' });
  }
  // Contract rows come from the project/month-scoped RPC.
  const missingContracts = countMissingContracts(contracts, contractDailyReports.filter((report) =>
    report.project_name === projectName && normalizeWorkforceDate(report.date)?.slice(0, 7) === period.month));
  if ((canContract || canDaily) && missingContracts > 0) {
    tasks.push({ id: `contract:${period.month}`, title: '근로계약서', status: '미작성', canNavigate: canContract,
      detail: `${Number(period.month.slice(5))}월 미작성 대상 ${missingContracts.toLocaleString()}명`, view: 'labor-contract' });
  }
  return tasks;
};
