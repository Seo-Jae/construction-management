const uniqueIds = (items) => Array.isArray(items)
  ? [...new Set(items.filter((item) => typeof item === 'string' && item.length > 0))] : [];

export function readMenuPreferences(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return { recent: uniqueIds(saved?.recent).slice(0, 5), favorites: uniqueIds(saved?.favorites) };
  } catch { return { recent: [], favorites: [] }; }
}

export function recordRecentMenu(preferences, view) {
  return { ...preferences, recent: [view, ...preferences.recent.filter((id) => id !== view)].slice(0, 5) };
}

export function toggleFavoriteMenu(preferences, view) {
  return { ...preferences, favorites: preferences.favorites.includes(view)
    ? preferences.favorites.filter((id) => id !== view) : [...preferences.favorites, view] };
}
