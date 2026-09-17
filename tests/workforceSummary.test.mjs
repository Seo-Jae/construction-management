import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeWorkforce, workforceMonths } from '../src/utils/workforceSummary.js';

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
