import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProgressTargetScopes } from '../src/utils/progressTargetScope.js';

test('stage two excludes stage one and respects different target floors per building', () => {
  const configs = {
    A: { floors: 4, unitsPerFloor: 2, pilotiFloors: [1] },
    B: { floors: 3, unitsPerFloor: 1 },
  };
  const scopes = buildProgressTargetScopes([
    { sequence: 2, building_floor_targets: { A: 4, B: 3 } },
    { sequence: 1, building_floor_targets: { A: 2, B: 2 } },
  ], configs);
  assert.deepEqual([...scopes[0].cellKeys], ['A-201', 'A-202', 'B-101', 'B-201']);
  assert.deepEqual([...scopes[1].cellKeys], ['A-301', 'A-302', 'A-401', 'A-402', 'B-301']);
});

test('merged units count once and absent units, buildings and invalid floors do not count', () => {
  const scopes = buildProgressTargetScopes([
    { sequence: 1, building_floor_targets: { A: 100, missing: 5, B: -1 } },
  ], {
    A: { floors: 2, unitsPerFloor: 3, pilotiFloors: [1],
      exceptions: { 2: { units: [1, 2] } }, aliasUnits: { 2: { 2: 1 } } },
    B: { floors: 2, unitsPerFloor: 1 },
  });
  assert.deepEqual([...scopes[0].cellKeys], ['A-201']);
});

test('later stages exclude every earlier stage even when an intermediate stage omits a building', () => {
  const scopes = buildProgressTargetScopes([
    { sequence: 1, building_floor_targets: { A: 2 } },
    { sequence: 2, building_floor_targets: {} },
    { sequence: 3, building_floor_targets: { A: 3 } },
  ], { A: { floors: 3, unitsPerFloor: 1 } });
  assert.equal(scopes[1].cellKeys.size, 0);
  assert.deepEqual([...scopes[2].cellKeys], ['A-301']);
  assert.deepEqual(buildProgressTargetScopes([], {}), []);
});
