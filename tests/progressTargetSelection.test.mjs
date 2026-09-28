import test from 'node:test';
import assert from 'node:assert/strict';
import { readTargetSelection, writeTargetSelection, reconcileTargetSelection } from '../src/utils/progressTargetSelection.js';

test('second phase survives reload/remount after a progress save; site and trial scopes stay separate', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key), setItem: (key, value) => map.set(key, value) };
  const targets = [{ id: 'sequence:1' }, { id: 'sequence:2' }];
  writeTargetSelection(storage, 'progress_targets:site-A', 'sequence:2');
  const remounted = readTargetSelection(storage, 'progress_targets:site-A');
  assert.equal(reconcileTargetSelection(remounted, targets), 'sequence:2');
  assert.equal(readTargetSelection(storage, 'progress_targets:site-B'), '');
  assert.equal(readTargetSelection(storage, 'progress_targets_trial:site-A'), '');
  assert.equal(reconcileTargetSelection('sequence:2', [{ id: 'sequence:1' }]), 'sequence:1');
});

test('unavailable storage cannot prevent input; empty target list has no active phase', () => {
  const blocked = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); } };
  assert.equal(readTargetSelection(blocked, 'scope'), '');
  assert.doesNotThrow(() => writeTargetSelection(blocked, 'scope', 'sequence:2'));
  assert.equal(reconcileTargetSelection('sequence:2', []), '');
});
