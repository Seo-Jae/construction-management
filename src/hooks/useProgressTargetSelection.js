import { useCallback, useEffect, useState } from 'react';
import { readTargetSelection, writeTargetSelection } from '../utils/progressTargetSelection.js';

function storage() { try { return window.sessionStorage; } catch { return undefined; } }
export default function useProgressTargetSelection(scope) {
  const [selection, setSelection] = useState(() => ({ scope, id: readTargetSelection(storage(), scope) }));
  const id = selection.scope === scope ? selection.id : readTargetSelection(storage(), scope);
  const update = useCallback(value => {
    setSelection(previous => {
      const current = previous.scope === scope ? previous.id : readTargetSelection(storage(), scope);
      return { scope, id: typeof value === 'function' ? value(current) : value };
    });
  }, [scope]);
  useEffect(() => {
    if (selection.scope === scope) writeTargetSelection(storage(), scope, selection.id);
  }, [selection, scope]);
  return [id, update];
}
