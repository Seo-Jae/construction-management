import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardReportTasks, getDashboardReportPeriod, hasMeaningfulDailyReport } from '../src/utils/dashboardReportTasks.js';

const period = getDashboardReportPeriod(new Date('2026-09-17T00:00:00Z'));
const base = { projectName: 'A', period, canDaily: true, canWeekly: true, canContract: true };

test('Korea midnight and Sunday week boundary determine Thursday through Saturday reminders', () => {
  assert.equal(getDashboardReportPeriod(new Date('2026-09-16T14:59:59Z')).weeklyDue, false);
  assert.equal(getDashboardReportPeriod(new Date('2026-09-16T15:00:00Z')).weeklyDue, true);
  assert.equal(period.weekStart, '2026-09-13');
  assert.equal(getDashboardReportPeriod(new Date('2026-09-19T14:59:59Z')).weeklyDue, true);
  const sunday = getDashboardReportPeriod(new Date('2026-09-19T15:00:00Z'));
  assert.equal(sunday.weeklyDue, false);
  assert.equal(sunday.weekStart, '2026-09-20');
  assert.equal(getDashboardReportPeriod(new Date('2026-09-30T15:00:00Z')).month, '2026-10');
});

test('empty deadline rows are missing; actual daily content, including no-work notes, counts', () => {
  assert.equal(hasMeaningfulDailyReport({ workers: [{}], tasks: [{}], status: 'closed' }), false);
  assert.equal(hasMeaningfulDailyReport({ today_task: '작업없음' }), true);
  assert.equal(hasMeaningfulDailyReport({ workers: [{ day: 1 }] }), true);
  const tasks = buildDashboardReportTasks({ ...base, dailyReports: [
    { project_name: 'B', date: period.today, today_task: 'done' },
    { project_name: 'A', date: '2026-09-16', today_task: 'done' },
    { project_name: 'A', date: period.today, status: 'closed' },
  ] });
  assert.equal(tasks[0].view, 'daily');
});

test('only completed reports in the current project/week satisfy the weekly task', () => {
  const weeklyReports = [
    { project_name: 'A', week_start: period.weekStart, status: 'draft' },
    { project_name: 'B', week_start: period.weekStart, status: 'completed' },
    { project_name: 'A', week_start: '2026-09-06', status: 'completed' },
  ];
  assert.ok(buildDashboardReportTasks({ ...base, weeklyReports }).some((row) => row.view === 'report-weekly'));
  weeklyReports.push({ project_name: 'A', week_start: period.weekStart, status: 'completed' });
  assert.equal(buildDashboardReportTasks({ ...base, weeklyReports }).some((row) => row.view === 'report-weekly'), false);
});

test('contracts count once per task type until final confirmation', () => {
  const tasks = buildDashboardReportTasks({ ...base, contracts: [
    { status: 'required' }, { status: 'required' }, { status: 'form_ready' },
    { status: 'manager_confirmed' }, { status: 'excluded' }, { status: 'rejected' },
  ] });
  assert.equal(tasks.length, 3);
  assert.equal(tasks[2].detail, '9월 미작성 대상 4명');
});

test('completed work and inaccessible menus do not contribute to the count', () => {
  assert.equal(buildDashboardReportTasks({ ...base, canDaily: false, canWeekly: false, canContract: false,
    contracts: [{ status: 'required' }] }).length, 0);
  assert.equal(buildDashboardReportTasks({ ...base,
    dailyReports: [{ project_name: 'A', date: period.today, today_task: 'done' }],
    weeklyReports: [{ project_name: 'A', week_start: period.weekStart, status: 'completed' }],
    contracts: [{ status: 'manager_confirmed' }],
  }).length, 0);
});

test('monthly daily report workers without registered contract targets count once by normalized name', () => {
  const tasks = buildDashboardReportTasks({ ...base, contracts: [
    { name: '완료자', status: 'form_ready' }, { name: '제외자', status: 'excluded' },
    { name: '미입력', status: 'required' },
  ], contractDailyReports: [
    { project_name: 'A', date: '26.09.17', workers: [{ name: '신 규' }, { name: '완료자' }, { name: '제외자' }, { name: '미입력' }] },
    { project_name: 'A', date: '2026-09-18', workers: [{ name: '신규', job: '다른 직종' }, { name: '' }] },
    { project_name: 'B', date: '2026-09-17', workers: [{ name: '다른 현장' }] },
    { project_name: 'A', date: '2026-08-17', workers: [{ name: '이전 월' }] },
  ] });
  const contracts = tasks.filter((row) => row.view === 'labor-contract');
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].detail, '9월 미작성 대상 3명');
});

test('seven unfinished contracts stay visible without granting contract-menu access', () => {
  const tasks = buildDashboardReportTasks({ ...base, canContract: false,
    contracts: Array.from({ length: 7 }, (_, index) => ({ name: `worker${index}`, status: 'form_ready' })),
    dailyReports: [{ project_name: 'A', date: '26.09.17', workers: [{ name: 'worker0' }] }],
  });
  assert.equal(tasks.some((row) => row.view === 'daily'), false);
  const task = tasks.find((row) => row.view === 'labor-contract');
  assert.equal(task.detail, '9월 미작성 대상 7명');
  assert.equal(task.canNavigate, false);
});
