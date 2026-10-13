import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetupConfig, newBuildingSetupDraft } from '../src/utils/buildingSetupDraft.js';
import { createSetupSaveChanges, restoreSetupBuilding, stageSetupBuilding } from '../src/utils/buildingSetupPersistence.js';
import { countUniqueUnits } from '../src/utils/buildingUnits.js';

const draft = () => ({ name: '101동', lines: [
  { floors: '20', piloti: '1,2,3', type: '84A', specialFloors: [{ floor: '20', type: '101T', excluded: false, mergeLines: '2' }] },
  { floors: '20', piloti: '1,2,3', type: '84A', specialFloors: [] },
  { floors: '22', piloti: '1', type: '84B', specialFloors: [] },
  { floors: '22', piloti: '1', type: '84C', specialFloors: [] },
] });

test('new geometry survives saving and reopening including merged special floors', () => {
  const staged = stageSetupBuilding([], draft(), null);
  const [change] = createSetupSaveChanges(staged);
  assert.equal(change.expected_config, null);
  const loaded = restoreSetupBuilding(change);
  assert.deepEqual(loaded.lines, draft().lines);
  assert.equal(countUniqueUnits(loaded.config), 75);
  assert.deepEqual(createSetupSaveChanges([loaded]), []);
});

test('editing retains dates and unrelated config while sending original for conflict checks', () => {
  const config = { ...buildSetupConfig(draft()), projectStartDate: '2026-01-01', customProperty: 'preserved' };
  const loaded = restoreSetupBuilding({ building_name: '101동', config_json: config });
  assert.equal(loaded.unsupported, undefined);
  const modified = structuredClone(loaded);
  modified.lines[2].type = '84D';
  const [change] = createSetupSaveChanges(stageSetupBuilding([loaded], modified, loaded.id));
  assert.deepEqual(change.expected_config, config);
  assert.equal(change.config_json.projectStartDate, '2026-01-01');
  assert.equal(change.config_json.customProperty, 'preserved');
  assert.equal(change.config_json.unitTypes[3], '84D');
  assert.equal(countUniqueUnits(config), 75);
});

test('stale saved form never overrides subsequently changed geometry', () => {
  const [saved] = createSetupSaveChanges(stageSetupBuilding([], draft(), null));
  saved.config_json.unitTypes[3] = '99A';
  const loaded = restoreSetupBuilding(saved);
  assert.equal(loaded.lines[2].type, '99A');
  assert.equal(loaded.unsupported, undefined);
  assert.deepEqual(createSetupSaveChanges([loaded]), []);
});

test('closing an untouched blank form is a no-op; invalid input and duplicate names are rejected', () => {
  assert.deepEqual(stageSetupBuilding([], newBuildingSetupDraft(), null), []);
  assert.throws(() => stageSetupBuilding([], { ...draft(), name: '' }, null), /동명/);
  const staged = stageSetupBuilding([], draft(), null);
  assert.throws(() => stageSetupBuilding(staged, { ...draft(), name: '101' }, null), /같은 동명/);
  const loaded = restoreSetupBuilding(createSetupSaveChanges(staged)[0]);
  assert.throws(() => stageSetupBuilding([loaded], { ...loaded, name: '102동' }, loaded.id), /동명은 변경/);
});

test('saving one building retains siblings and only submits changed buildings', () => {
  const first = restoreSetupBuilding(createSetupSaveChanges(stageSetupBuilding([], draft(), null))[0]);
  const second = { ...draft(), name: '102동' };
  const buildings = stageSetupBuilding([first], second, null);
  const changes = createSetupSaveChanges(buildings);
  assert.equal(buildings.length, 2);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].building_name, '102동');
});
