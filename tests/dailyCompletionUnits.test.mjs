import test from 'node:test';
import assert from 'node:assert/strict';
import { getProjectCellKeys, getTargetCellKeys } from '../src/utils/buildingUnits.js';

test('666 visual cells with six merged pairs count as 660 actual households', () => {
  const configs = {
    A: { floors: 111, unitsPerFloor: 6,
      aliasUnits: Object.fromEntries([106, 107, 108, 109, 110, 111].map(floor => [floor, { 6: 5 }])) },
  };
  const keys = getProjectCellKeys(configs);
  assert.equal(keys.size, 660);
  assert.equal(keys.has('A-11105'), true);
  assert.equal(keys.has('A-11106'), false);
  assert.equal(getTargetCellKeys(configs, { A: 111 }).size, 660);
});

test('cumulative target quantities deduplicate merged units without excluding earlier stages', () => {
  const configs = { A: { floors: 4, unitsPerFloor: 2, pilotiFloors: [1], aliasUnits: { 3: { 2: 1 } } } };
  const keys = getTargetCellKeys(configs, { A: 3 });
  assert.deepEqual([...keys], ['A-201', 'A-202', 'A-301']);
  const completed = new Set(['A-201', 'A-301', 'A-302', 'A-401']);
  const count = [...keys].filter(key => completed.has(key)).length;
  assert.equal(count, 2);
  assert.equal(keys.size - count, 1);
});

test('target and project quantities both honor line piloti and floor exceptions', () => {
  const configs = { A: { floors: 3, unitsPerFloor: 2,
    linePilotiFloors: { 1: [1, 2], 2: [1] }, exceptions: { 3: { units: [1] } } } };
  assert.deepEqual([...getProjectCellKeys(configs)], ['A-202', 'A-301']);
  assert.deepEqual([...getTargetCellKeys(configs, { A: 100, missing: 3 })], ['A-202', 'A-301']);
});
