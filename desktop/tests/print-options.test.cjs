const { test } = require('node:test');
const assert = require('node:assert/strict');
const { printOptions } = require('../print-options.cjs');
const printers = [{ name: 'test-device' }];
const settings = { deviceName: 'test-device', copies: 2, pages: '4-5, 1-3, 3', color: false, duplexMode: 'longEdge' };
test('print request uses the chosen device without the unsupported system preview', () => {
  const value = printOptions(settings, printers, 5, true);
  assert.equal(value.silent, true);
  assert.equal(value.deviceName, 'test-device');
  assert.equal(value.copies, 2);
  assert.equal(value.landscape, true);
  assert.equal(value.color, false);
  assert.deepEqual(value.pageRanges, [{ from: 0, to: 4 }]);
});
test('all pages omit a page filter and disjoint ranges retain their boundaries', () => {
  assert.equal(printOptions({ ...settings, pages: '' }, printers, 5, false).pageRanges, undefined);
  assert.deepEqual(printOptions({ ...settings, pages: '1, 3-4' }, printers, 5, false).pageRanges, [{ from: 0, to: 0 }, { from: 2, to: 3 }]);
});
test('invalid printer, copy counts and page ranges never reach the spooler', () => {
  for (const pages of ['0', '6', '3-1', '1,', 'NaN', '1.2']) assert.throws(() => printOptions({ ...settings, pages }, printers, 5, false));
  for (const copies of [0, -1, 1.5, 1000, NaN]) assert.throws(() => printOptions({ ...settings, copies }, printers, 5, false));
  assert.throws(() => printOptions({ ...settings, deviceName: 'unknown' }, printers, 5, false));
  assert.throws(() => printOptions(settings, [], 5, false));
});
