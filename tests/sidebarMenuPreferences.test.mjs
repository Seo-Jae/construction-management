import test from 'node:test';
import assert from 'node:assert/strict';
import { readMenuPreferences, recordRecentMenu, toggleFavoriteMenu } from '../src/utils/sidebarMenuPreferences.js';

test('recent visits move to the front without duplicates and keep five menus', () => {
  const original = { recent: ['a', 'b', 'c', 'd', 'e'], favorites: ['b'] };
  const revisited = recordRecentMenu(original, 'c');
  assert.deepEqual(revisited.recent, ['c', 'a', 'b', 'd', 'e']);
  assert.deepEqual(recordRecentMenu(revisited, 'f').recent, ['f', 'c', 'a', 'b', 'd']);
  assert.deepEqual(original.recent, ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(revisited.favorites, ['b']);
});

test('favorites can be added and removed independently of recent visits', () => {
  const original = { recent: ['a'], favorites: ['b'] };
  const added = toggleFavoriteMenu(original, 'a');
  assert.deepEqual(added, { recent: ['a'], favorites: ['b', 'a'] });
  assert.deepEqual(toggleFavoriteMenu(added, 'b'), { recent: ['a'], favorites: ['a'] });
});

test('stored preferences are isolated by account and tolerate corrupt data', () => {
  const entries = new Map([
    ['user-a', JSON.stringify({ recent: ['daily', 'daily', null], favorites: ['main'] })],
    ['user-b', JSON.stringify({ recent: ['main'], favorites: [] })],
    ['broken', '{'],
  ]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key) => entries.get(key) ?? null } });
  try {
    assert.deepEqual(readMenuPreferences('user-a'), { recent: ['daily'], favorites: ['main'] });
    assert.deepEqual(readMenuPreferences('user-b'), { recent: ['main'], favorites: [] });
    assert.deepEqual(readMenuPreferences('broken'), { recent: [], favorites: [] });
    assert.deepEqual(readMenuPreferences('missing'), { recent: [], favorites: [] });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});
