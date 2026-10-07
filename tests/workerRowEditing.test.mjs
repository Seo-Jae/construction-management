import test from 'node:test';
import assert from 'node:assert/strict';
import { applyWorkerBulkEdit, duplicateWorkerRows } from '../src/utils/workerRowEditing.js';

const rows = [
  { id: 'a', sequence: 1, name: '김철수', job: '직영', process: '단열', location: '101동', workContent: '시공', day: 1, night: 0 },
  { id: 'b', sequence: 2, name: '이영수', job: '직영', process: '합지', location: '102동', workContent: '보수', day: 0.5, night: 1 },
];

test('row copies get new identities without retaining imported numbering or changing originals', () => {
  let nextId = 0;
  const copies = duplicateWorkerRows(rows, ['b', 'a'], () => `copy-${++nextId}`);
  assert.deepEqual(copies.map(row => row.name), ['김철수', '이영수']);
  assert.deepEqual(copies.map(row => row.id), ['copy-1', 'copy-2']);
  assert.ok(copies.every(row => row.sequence === null));
  assert.equal(copies[1].night, 1);
  copies[0].name = '변경';
  assert.equal(rows[0].name, '김철수');
  assert.deepEqual(duplicateWorkerRows(rows, []), []);
});

test('bulk editing changes only checked fields and selected rows, including intentional clearing', () => {
  const result = applyWorkerBulkEdit(rows, ['b'], { process: ' 새 공정 ', location: '', name: '변경 금지', day: 0 });
  assert.equal(result[0], rows[0]);
  assert.deepEqual(result[1], { ...rows[1], process: '새 공정', location: '' });
  assert.equal(rows[1].process, '합지');
  assert.deepEqual(applyWorkerBulkEdit(rows, [], { process: '무시' }), rows);
});
