import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetupConfig, newBuildingSetupDraft } from '../src/utils/buildingSetupDraft.js';
import { countUniqueUnits, getVisualCellType, getUnitType } from '../src/utils/buildingUnits.js';

test('one default line; independent heights, piloti floors and special types', () => {
  assert.equal(newBuildingSetupDraft().lines.length, 1);
  const config = buildSetupConfig({ lines: [
    { floors: '4', piloti: '1,2', type: '84A', specialFloors: [{ floor: '4', type: '101', excluded: false }] },
    { floors: '2', piloti: '', type: '59A', specialFloors: [{ floor: '2', type: '', excluded: true }] },
  ] });
  assert.equal(countUniqueUnits(config), 3);
  assert.equal(getVisualCellType(config, 2, 1), 'piloti');
  assert.equal(getVisualCellType(config, 1, 2), 'valid');
  assert.equal(getVisualCellType(config, 3, 2), 'empty');
  assert.equal(getVisualCellType(config, 2, 2), 'empty');
  assert.equal(getUnitType(config, 4, 1), '101');
  assert.equal(getUnitType(config, 3, 1), '84A');
});
test('invalid or overlapping special floors cannot be applied', () => {
  const line = { floors: '3', piloti: '1', type: '84', specialFloors: [] };
  for (const specialFloors of [
    [{ floor: '1', type: '59', excluded: false }],
    [{ floor: '4', type: '59', excluded: false }],
    [{ floor: '2', type: '', excluded: false }],
    [{ floor: '2', excluded: true }, { floor: '2', excluded: true }],
  ]) assert.throws(() => buildSetupConfig({ lines: [{ ...line, specialFloors }] }));
  assert.throws(() => buildSetupConfig({ lines: [{ ...line, floors: '999999' }] }));
});
test('existing shared-floor piloti and first-floor exclusions remain unchanged', () => {
  const config = { floors: 3, unitsPerFloor: 2, pilotiFloors: [2], exceptions: { 1: { units: [1] }, 2: { units: [2] } } };
  assert.equal(getVisualCellType(config, 1, 2), 'piloti');
  assert.equal(getVisualCellType(config, 2, 1), 'piloti');
  assert.equal(getVisualCellType(config, 2, 2), 'valid');
  assert.equal(countUniqueUnits(config), 4);
});
