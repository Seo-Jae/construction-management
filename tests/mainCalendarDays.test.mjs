import test from 'node:test';
import assert from 'node:assert/strict';
import { getMainCalendarDays } from '../src/utils/mainCalendarDays.js';

test('7월은 이전 달 29·30일과 다음 달 1·2일로 빈칸을 채운다', () => {
  const days = getMainCalendarDays(2025, 6);
  assert.deepEqual(days.slice(0, 2).map((d) => d.day), [29, 30]);
  assert.deepEqual(days.slice(-2).map((d) => d.day), [1, 2]);
  assert.equal(days.filter((d) => d.inMonth).length, 31);
});

test('연도 경계와 윤년 및 6주 달을 올바르게 계산한다', () => {
  assert.equal(getMainCalendarDays(2026, 0)[0].year, 2025);
  assert.equal(getMainCalendarDays(2026, 11).at(-1).year, 2027);
  assert.equal(getMainCalendarDays(2024, 1).filter((d) => d.inMonth).length, 29);
  assert.equal(getMainCalendarDays(2026, 7).length, 42);
});
