const uniqueIds = (items) => Array.isArray(items)
  ? [...new Set(items.filter((item) => typeof item === 'string' && item.length > 0))] : [];

export const MENU_PREFERENCES_CHANGED = 'sidebar-favorites-changed';

export function saveFavoriteToggle(storageKey, view) {
  const next = toggleFavoriteMenu(readMenuPreferences(storageKey), view);
  localStorage.setItem(storageKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(MENU_PREFERENCES_CHANGED, { detail: storageKey }));
  return next;
}

export function readMenuPreferences(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return { favorites: uniqueIds(saved?.favorites) };
  } catch { return { favorites: [] }; }
}

export function readFolderState(userId, folder) {
  try { return JSON.parse(localStorage.getItem(`sidebar-folders:${userId}`))?.[folder] === true; }
  catch { return false; }
}

export function writeFolderState(userId, folder, open) {
  if (!userId) return;
  try {
    const key = `sidebar-folders:${userId}`;
    let saved;
    try { saved = JSON.parse(localStorage.getItem(key)); } catch { saved = {}; }
    localStorage.setItem(key, JSON.stringify({ ...saved, [folder]: Boolean(open) }));
  } catch { /* Keep the current session usable when browser storage is unavailable. */ }
}

export function toggleFavoriteMenu(preferences, view) {
  return { ...preferences, favorites: preferences.favorites.includes(view)
    ? preferences.favorites.filter((id) => id !== view) : [...preferences.favorites, view] };
}
