import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyReportSuggestions, workerAutocompleteCommitValue } from '../src/utils/dailyReportSuggestions.js';

test('historical and uploaded process names are suggested before defaults without duplicates', () => {
  const reports = {
    '26.10.02': { workers: [{ job: '직영', process: ' 경량벽체 ' }, { process: '단열' }] },
    '26.09.01': { workers: [{ job: '경량', process: '경량벽체' }, { process: '추가 공정' }] },
  };
  assert.deepEqual(dailyReportSuggestions(reports, 'process', ['단열', '합지']), ['경량벽체', '추가 공정', '단열', '합지']);
  assert.deepEqual(dailyReportSuggestions(reports, 'job', ['직영'], value => value === '경량' ? '경량벽체' : value), ['경량벽체', '직영']);
  assert.deepEqual(dailyReportSuggestions({}, 'process', ['단열']), ['단열']);
});

test('Tab accepts new Korean text or the explicitly highlighted suggestion', () => {
  const input = { value: ' 신규 공정 ', getAttribute: () => null };
  assert.equal(workerAutocompleteCommitValue(input), '신규 공정');
  const highlighted = { getAttribute: () => 'option', textContent: '경량벽체' };
  const activeInput = { value: '경량', getAttribute: () => 'option-1', ownerDocument: { getElementById: () => highlighted } };
  assert.equal(workerAutocompleteCommitValue(activeInput), '경량벽체');
  assert.equal(workerAutocompleteCommitValue({ ...input, value: '' }), '');
});
