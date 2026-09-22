import { useCallback, useSyncExternalStore } from 'react';
import { MENU_PREFERENCES_CHANGED, readMenuPreferences } from '../utils/sidebarMenuPreferences.js';

export default function useMenuPreferences(storageKey) {
  const subscribe = useCallback((notify) => {
    const sync = event => {
      if (event.type === 'storage' ? event.key === storageKey || event.key === null : event.detail === storageKey) notify();
    };
    window.addEventListener('storage', sync);
    window.addEventListener(MENU_PREFERENCES_CHANGED, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(MENU_PREFERENCES_CHANGED, sync);
    };
  }, [storageKey]);
  const snapshot = useCallback(() => JSON.stringify(readMenuPreferences(storageKey)), [storageKey]);
  return JSON.parse(useSyncExternalStore(subscribe, snapshot));
}
