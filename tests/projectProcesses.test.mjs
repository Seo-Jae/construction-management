import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { getProjectProcessOptions, mergeProjectProcesses, getWeeklyProcesses, writeWeeklyProcessStats, buildProcessCatalog, changeProcessCatalog } from '../src/utils/projectProcesses.js';

test('renamed display labels survive ordering and reload without changing historical keys', () => {
  const defaults = ['단열', '합지'];
  const catalog = buildProcessCatalog(defaults, [{ process_type: '합지', display_name: '합지석고', sort_order: 0 }]);
  const moved = changeProcessCatalog(catalog, { type: 'move', name: '합지', direction: 1 });
  const disabled = changeProcessCatalog(moved, { type: 'toggle', name: '합지', enabled: false });
  const restored = buildProcessCatalog(defaults, disabled);
  assert.deepEqual(restored.map(row => row.process_type), defaults);
  assert.equal(restored[1].display_name, '합지석고');
  assert.equal(restored[1].is_enabled, false);
  assert.equal(restored[0].display_name, '단열');
});

test('existing site defaults and Mark Valley ordering survive catalog additions', () => {
  const original = getProjectProcessOptions('현대건설 용인마크밸리');
  assert.deepEqual(original.slice(0, 5), ['바닥먹', '허리먹', '단열', '조적단열', '합지']);
  const merged = mergeProjectProcesses(original, [{ process_type: '합지' }, { process_type: '새 공종' }, { process_type: ' 새 공종 ' }]);
  assert.deepEqual(merged.slice(0, original.length), original);
  assert.equal(merged.at(-1), '새 공종');
  assert.equal(merged.length, original.length + 1);
  assert.ok(!getProjectProcessOptions('다른현장').includes('새 공종'));
});

test('weekly report honors configured order and excludes unchecked template processes', () => {
  const template = [{ label: '바닥먹매김', processType: '바닥먹' }, { label: '합지', processType: '합지' }];
  const result = getWeeklyProcesses(template, ['추가 공종', '합지석고', '추가 공종']);
  assert.deepEqual(result, [{ label: '추가 공종', processType: '추가 공종' }, template[1]]);
  assert.deepEqual(getWeeklyProcesses(template, []), []);
});

test('weekly Excel honors configured order, keeps body cells intact and exports overflow in order', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('주간 업무 보고');
  sheet.getCell('C19').value = '보존할 본문';
  const template = Array.from({ length: 10 }, (_, i) => ({ processType: `기존${i}`, label: `기존${i}` }));
  const stats = [...template].reverse().map((item) => ({ ...item, progressText: `${item.label}:3/9`, weeklyAmount: 3 }));
  stats.unshift({ processType: '추가1', label: '추가1', progressText: '7/9', weeklyAmount: 7 });
  stats.push({ processType: '추가2', label: '추가2', progressText: '2/9', weeklyAmount: 2 });
  writeWeeklyProcessStats(workbook, sheet, stats, template);
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(await workbook.xlsx.writeBuffer());
  assert.equal(restored.worksheets[0].getCell('B8').value, '추가1');
  assert.equal(restored.worksheets[0].getCell('C8').value, '7/9');
  assert.equal(restored.worksheets[0].getCell('C17').value, '기존1:3/9');
  assert.equal(restored.worksheets[0].getCell('C19').value, '보존할 본문');
  assert.equal(restored.worksheets[1].getCell('A2').value, '기존0');
  assert.equal(restored.worksheets[1].getCell('A3').value, '추가2');
});

test('legacy hapji alias stays in its original Excel row without an extra sheet', () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('보고');
  writeWeeklyProcessStats(workbook, sheet, [{ processType: '합지석고', progressText: '1/9' }], [{ processType: '합지' }]);
  assert.equal(workbook.worksheets.length, 1);
  assert.equal(sheet.getCell('C8').value, '1/9');
});

test('catalog persists order, checkbox state and archived defaults without reviving them', () => {
  let catalog = buildProcessCatalog(['A', 'B', 'C'], []);
  catalog = changeProcessCatalog(catalog, { type: 'toggle', name: 'B', enabled: false });
  catalog = changeProcessCatalog(catalog, { type: 'move', name: 'C', direction: -1 });
  assert.deepEqual(catalog.filter(row => row.is_enabled).map(row => row.process_type), ['A', 'C']);
  catalog = changeProcessCatalog(catalog, { type: 'archive', name: 'A' });
  const reloaded = buildProcessCatalog(['A', 'B', 'C'], catalog);
  assert.deepEqual(reloaded, catalog);
  assert.deepEqual(reloaded.filter(row => !row.is_archived).map(row => row.process_type), ['C', 'B']);
  const restored = changeProcessCatalog(reloaded, { type: 'add', name: 'A' });
  assert.equal(restored.length, 3);
  assert.ok(restored.find(row => row.process_type === 'A').is_enabled);
  assert.ok(!restored.find(row => row.process_type === 'A').is_archived);
});

test('empty selection clears template labels rather than bringing disabled processes back', () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('보고');
  sheet.getCell('B8').value = '기존 공종';
  sheet.getCell('C8').value = '1/9';
  writeWeeklyProcessStats(workbook, sheet, []);
  assert.equal(sheet.getCell('B8').value, '');
  assert.equal(sheet.getCell('C8').value, '');
});
