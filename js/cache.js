// Short-lived localStorage cache for loaded folders, shared by all sources.

const PREFIX = 'folder-cache:';
const TTL_MS = 60 * 1000;

export function getCached(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { savedAt, folder } = JSON.parse(raw);
    if (Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return folder;
  } catch {
    return null;
  }
}

export function setCached(key, folder) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ savedAt: Date.now(), folder }));
  } catch { /* storage unavailable or full */ }
}

// Returns the cached folder for key, or calls load() and caches its result.
export async function cached(key, load) {
  let folder = getCached(key);
  if (!folder) {
    folder = await load();
    setCached(key, folder);
  }
  return folder;
}

export function clearCache() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}
