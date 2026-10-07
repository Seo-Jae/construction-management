import test from 'node:test';
import assert from 'node:assert/strict';
import { orderDailyReportWorkers } from '../src/utils/dailyReportWorkerOrder.js';

test('interleaved uploaded blocks sort numerically without mutating saved workers', () => {
  const workers = [{ sequence: 1 }, { sequence: 31 }, { sequence: 2 }, { sequence: '32' }, { sequence: 10 }];
  assert.deepEqual(orderDailyReportWorkers(workers).map(worker => Number(worker.sequence)), [1, 2, 10, 31, 32]);
  assert.deepEqual(workers.map(worker => worker.sequence), [1, 31, 2, '32', 10]);
});

test('duplicate numbers and manual workers preserve relative input order', () => {
  const manual = [{ sequence: null }, {}, { sequence: '' }, { sequence: 0 }, { sequence: 'invalid' }];
  assert.deepEqual(orderDailyReportWorkers(manual), manual);
  const first = { sequence: 1, name: 'first' };
  const second = { sequence: 1, name: 'second' };
  assert.deepEqual(orderDailyReportWorkers([...manual, first, second]), [first, second, ...manual]);
});
