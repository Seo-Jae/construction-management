import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWorkforce, workforceMonths, workforceWeek, summarizeWeeklyWorkforce } from '../src/utils/workforceSummary.js';

test('workforce week starts Monday and crosses month and year boundaries', () => {
  assert.deepEqual(workforceWeek('2026-10-01'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(workforceWeek('2026-10-04')[0], '2026-09-28');
  assert.equal(workforceWeek('2026-10-01', -1)[0], '2026-09-21');
  assert.equal(workforceWeek('2027-01-01')[0], '2026-12-28');
});

test('weekly chart deduplicates daily workers and counts only their first ever date as new', () => {
  const worker = name => ({ name, job: 'a' });
  const rows = [
    { project_name: 'A', date: '26.09.29', workers: [worker('Kim'), worker('New')] },
    { project_name: 'A', date: '2026-09-28', workers: [worker('Kim'), worker('New'), worker(' New ')] },
    { project_name: 'A', date: '2026-09-28', workers: [worker('New')] },
    { project_name: 'A', date: '2025-01-01', workers: [worker('Kim')] },
    { project_name: 'B', date: '2025-01-01', workers: [worker('New')] },
    { project_name: 'A', date: '2026-10-02', workers: [worker('Future')] },
  ];
  const values = summarizeWeeklyWorkforce(rows, 'A', workforceWeek('2026-10-01'), '2026-10-01');
  assert.deepEqual(values.map(row => row.total), [2, 2, 0, 0, null, null, null]);
  assert.deepEqual(values.map(row => row.added), [1, 0, 0, 0, null, null, null]);
  assert.deepEqual(values.map(row => row.cumulative), [2, 4, 4, 4, null, null, null]);
});

test('month range spans year boundaries', () => {
  assert.deepEqual(workforceMonths('2026-02', 3), ['2025-12', '2026-01', '2026-02']);
});
test('actual daily report date formats are counted and future or invalid dates are excluded', () => {
  const rows = ['26.09.17', '2026-09-16', '2026.09.15', '26.09.18', '26.02.31'].map((date, index) => ({
    project_name: 'A', date, workers: [{ name: `worker${index}`, job: 'a' }],
  }));
  assert.deepEqual(summarizeWorkforce(rows, 'A', ['2026-09'], '2026-09-17'), [{ month: '2026-09', total: 3, cumulative: 3, average: 1, added: 3 }]);
});
test('returning workers are not new even when their earlier visit is outside the chart range', () => {
  const rows = [
    { project_name: 'A', date: '2026-09-01', workers: [{ name: 'Kim', job: 'a' }, { name: 'New', job: 'a' }] },
    { project_name: 'A', date: '2024-01-01', workers: [{ name: 'Kim', job: 'a' }] },
    { project_name: 'B', date: '2023-01-01', workers: [{ name: 'New', job: 'a' }] },
  ];
  assert.deepEqual(summarizeWorkforce(rows, 'A', ['2026-09'], '2026-09-17'), [{ month: '2026-09', total: 2, cumulative: 2, average: 2, added: 1 }]);
});
test('counts unique name/job pairs only in selected site through today', () => {
  const rows = [
    { project_name: 'A', date: '2026-01-10', workers: [{ name: 'Kim', job: 'a' }, { name: 'Lee', job: 'b' }] },
    { project_name: 'A', date: '2026-02-10', workers: [{ name: ' Kim ', job: 'a' }, { name: 'Park', job: 'b' }, { name: '' }] },
    { project_name: 'A', date: '2026-02-11', workers: [{ name: 'Kim', job: 'a' }] },
    { project_name: 'B', date: '2026-02-10', workers: [{ name: 'Other' }] },
    { project_name: 'A', date: '2026-02-25', workers: [{ name: 'Future' }] },
  ];
  assert.deepEqual(summarizeWorkforce(rows, 'A', ['2026-02'], '2026-02-15'), [{ month: '2026-02', total: 2, cumulative: 3, average: 1.5, added: 1 }]);
});
