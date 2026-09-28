export const targetSelectionKey = scope => `progress-target-selection:${scope}`;
export function readTargetSelection(storage, scope) {
  try { return storage?.getItem(targetSelectionKey(scope)) || ''; } catch { return ''; }
}
export function writeTargetSelection(storage, scope, value) {
  try { storage?.setItem(targetSelectionKey(scope), value); } catch { /* Optional browser persistence. */ }
}
export function reconcileTargetSelection(previous, targets) {
  return targets.some(target => target.id === previous) ? previous : targets[0]?.id || '';
}
