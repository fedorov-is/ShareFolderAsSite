// Yandex Disk public folders via the public REST API (CORS-enabled, no auth).
// Docs: https://yandex.ru/dev/disk-api/doc/en/reference/public

const API = 'https://cloud-api.yandex.net/v1/disk/public/resources';
const PAGE_SIZE = 1000;
const MAX_DEPTH = 5;

const HOSTS = /^(disk\.yandex\.[a-z.]+|yadi\.sk|disk\.360\.yandex\.[a-z.]+)$/i;

async function fetchPage(publicKey, path, offset) {
  const params = new URLSearchParams({
    public_key: publicKey,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (path) params.set('path', path);

  const res = await fetch(`${API}?${params}`);
  if (!res.ok) {
    let message = `Ошибка API Яндекс Диска: ${res.status}`;
    try {
      const body = await res.json();
      if (body.description) message = body.description;
    } catch { /* keep default message */ }
    throw new Error(message);
  }
  return res.json();
}

async function fetchResource(publicKey, path) {
  const first = await fetchPage(publicKey, path, 0);
  const embedded = first._embedded;
  if (!embedded) return { ...first, items: [] };

  const items = [...embedded.items];
  while (items.length < embedded.total) {
    const next = await fetchPage(publicKey, path, items.length);
    if (!next._embedded?.items.length) break;
    items.push(...next._embedded.items);
  }
  return { ...first, items };
}

function fileViewUrl(publicKey, path) {
  // Shared files inside a folder open at <folder link>/<path inside folder>.
  const base = publicKey.replace(/\/+$/, '');
  return base + path.split('/').map(encodeURIComponent).join('/');
}

// Loads a folder and its subfolders down to maxDepth levels.
// Subfolders below that level are returned as unloaded refs ({ name, ref }).
async function loadTree(publicKey, path, name, depth, maxDepth) {
  const resource = await fetchResource(publicKey, path);
  const folder = { name: name ?? resource.name, files: [], folders: [] };

  for (const item of resource.items) {
    if (item.type === 'dir') {
      folder.folders.push(depth < maxDepth
        ? loadTree(publicKey, item.path, item.name, depth + 1, maxDepth)
        : { name: item.name, ref: item.path });
    } else {
      folder.files.push({
        name: item.name,
        url: fileViewUrl(publicKey, item.path),
        downloadUrl: item.file,
        size: item.size,
        mimeType: item.mime_type,
        modified: item.modified,
      });
    }
  }

  folder.folders = await Promise.all(folder.folders);
  return folder;
}

export default {
  id: 'yandex',
  name: 'Яндекс Диск',

  match(url) {
    try {
      return HOSTS.test(new URL(url).hostname);
    } catch {
      return false;
    }
  },

  load(url) {
    return loadTree(url, '', null, 0, 0);
  },

  loadFolder(url, ref) {
    return loadTree(url, ref, null, 0, MAX_DEPTH);
  },
};
