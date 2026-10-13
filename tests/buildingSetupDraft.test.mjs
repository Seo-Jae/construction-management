import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetupConfig, newBuildingSetupDraft } from '../src/utils/buildingSetupDraft.js';
import { buildFloorVisualCells, getFloorCellKeys, countUniqueUnits, getVisualCellType, getUnitType } from '../src/utils/buildingUnits.js';

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

test('merging lines 1 and 2 on floor 20 produces one wide household and reduces 76 to 75', () => {
  const lines = [
    { floors: '20', piloti: '1,2,3', type: '84A', specialFloors: [{ floor: '20', type: '101T', excluded: false }] },
    { floors: '20', piloti: '1,2,3', type: '84A', specialFloors: [{ floor: '20', type: '101T', excluded: false }] },
    { floors: '22', piloti: '1', type: '84B', specialFloors: [] },
    { floors: '22', piloti: '1', type: '84C', specialFloors: [] },
  ];
  assert.equal(countUniqueUnits(buildSetupConfig({ lines })), 76);
  lines[0].specialFloors[0].mergeLines = '2';
  const config = buildSetupConfig({ lines });
  assert.equal(countUniqueUnits(config), 75);
  assert.deepEqual(getFloorCellKeys('101동', config, 20), ['101동-2001', '101동-2003', '101동-2004']);
  assert.equal(buildFloorVisualCells(config, 20)[0].span, 2);
  assert.equal(getUnitType(config, 20, 2), '101T');
  assert.equal(getFloorCellKeys('101동', config, 19).length, 4);
  lines[1].specialFloors[0].mergeLines = '1';
  assert.equal(countUniqueUnits(buildSetupConfig({ lines })), 75);
});

test('merge requires valid adjacent households and rejects conflicting types or overlapping groups', () => {
  const draft = () => ({ lines: Array.from({ length: 3 }, () => ({ floors: '3', piloti: '1', type: '84A', specialFloors: [] })) });
  for (const target of ['3', '4', '0', '2,', 'abc']) {
    const value = draft();
    value.lines[0].specialFloors = [{ floor: '3', type: '101T', mergeLines: target }];
    assert.throws(() => buildSetupConfig(value));
  }
  for (const changed of [{ floors: '2' }, { piloti: '1,3' }, { specialFloors: [{ floor: '3', excluded: true }] }, { specialFloors: [{ floor: '3', type: '99T' }] }]) {
    const value = draft();
    value.lines[0].specialFloors = [{ floor: '3', type: '101T', mergeLines: '2' }];
    Object.assign(value.lines[1], changed);
    assert.throws(() => buildSetupConfig(value));
  }
  const overlap = draft();
  overlap.lines[0].specialFloors = [{ floor: '3', type: '101T', mergeLines: '2' }];
  overlap.lines[1].specialFloors = [{ floor: '3', type: '101T', mergeLines: '3' }];
  assert.throws(() => buildSetupConfig(overlap), /겹칩니다/);
  overlap.lines[1].specialFloors = [];
  const oneSided = buildSetupConfig(overlap);
  assert.equal(getUnitType(oneSided, 3, 2), '101T');
  assert.equal(countUniqueUnits(oneSided), 5);
});
