const uniqueIds = (items) => Array.isArray(items)
  ? [...new Set(items.filter((item) => typeof item === 'string' && item.length > 0))] : [];

export const MENU_PREFERENCES_CHANGED = 'sidebar-favorites-changed';
export const SIDEBAR_MEMORY_TIMEOUT_MS = 5 * 60 * 60 * 1000;

export function touchSidebarSession(userId, now = Date.now()) {
  if (!userId) return;
  try {
    localStorage.setItem(`sidebar-last-seen:${userId}`, String(now));
  } catch { /* Storage restrictions must not interrupt login or navigation. */ }
}

// Run before rendering the sidebar on login/session restoration, not on token refresh.
export function beginSidebarSession(userId, now = Date.now()) {
  if (!userId) return;
  try {
    const lastSeen = Number(localStorage.getItem(`sidebar-last-seen:${userId}`));
    if (!Number.isFinite(lastSeen) || lastSeen <= 0 || now < lastSeen || now - lastSeen >= SIDEBAR_MEMORY_TIMEOUT_MS) {
      localStorage.removeItem(`sidebar-folders:${userId}`);
    }
    touchSidebarSession(userId, now);
  } catch { /* Storage restrictions must not interrupt login or navigation. */ }
}

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
