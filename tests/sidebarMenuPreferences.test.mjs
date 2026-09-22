import test from 'node:test';
import assert from 'node:assert/strict';
import { readMenuPreferences, toggleFavoriteMenu, readFolderState, writeFolderState, saveFavoriteToggle, MENU_PREFERENCES_CHANGED } from '../src/utils/sidebarMenuPreferences.js';

function withStorage(run) {
  const entries = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  } });
  try { run(entries); } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
}

test('existing favorites survive removal of recent menus and remain account-specific', () => withStorage(entries => {
  entries.set('user-a', JSON.stringify({ recent: ['daily'], favorites: ['main', 'main', null] }));
  entries.set('user-b', JSON.stringify({ favorites: ['daily'] }));
  assert.deepEqual(readMenuPreferences('user-a'), { favorites: ['main'] });
  assert.deepEqual(readMenuPreferences('user-b'), { favorites: ['daily'] });
  const added = toggleFavoriteMenu(readMenuPreferences('user-a'), 'daily');
  assert.deepEqual(added, { favorites: ['main', 'daily'] });
  assert.deepEqual(toggleFavoriteMenu(added, 'main'), { favorites: ['daily'] });
}));

test('closed folders stay closed on the next login without changing other accounts or folders', () => withStorage(() => {
  assert.equal(readFolderState('a', 'construction'), false);
  writeFolderState('a', 'construction', true);
  writeFolderState('a', 'favorites', true);
  writeFolderState('b', 'construction', true);
  writeFolderState('a', 'construction', false);
  assert.equal(readFolderState('a', 'construction'), false);
  assert.equal(readFolderState('a', 'favorites'), true);
  assert.equal(readFolderState('b', 'construction'), true);
}));

test('invalid or unavailable browser storage does not prevent navigation', () => withStorage(entries => {
  entries.set('broken', '{');
  entries.set('sidebar-folders:a', '{');
  assert.deepEqual(readMenuPreferences('broken'), { favorites: [] });
  assert.equal(readFolderState('a', 'favorites'), false);
  writeFolderState('a', 'favorites', true);
  assert.equal(readFolderState('a', 'favorites'), true);
  globalThis.localStorage.setItem = () => { throw Error('Storage disabled'); };
  assert.doesNotThrow(() => writeFolderState('a', 'favorites', false));
}));

test('header and sidebar toggles share fresh storage and notify only after successful saves', () => withStorage(entries => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const events = [];
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { dispatchEvent: event => events.push(event) } });
  try {
    saveFavoriteToggle('user-a', 'daily');
    entries.set('user-a', JSON.stringify({ favorites: ['daily', 'main'] }));
    saveFavoriteToggle('user-a', 'daily');
    assert.deepEqual(readMenuPreferences('user-a'), { favorites: ['main'] });
    assert.equal(events.length, 2);
    assert.equal(events[0].type, MENU_PREFERENCES_CHANGED);
    assert.equal(events[0].detail, 'user-a');
    globalThis.localStorage.setItem = () => { throw Error('Storage disabled'); };
    assert.throws(() => saveFavoriteToggle('user-a', 'main'));
    assert.equal(events.length, 2);
    assert.deepEqual(readMenuPreferences('user-a'), { favorites: ['main'] });
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else delete globalThis.window;
  }
}));
