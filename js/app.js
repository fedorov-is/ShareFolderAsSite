import { sources, findSource } from './sources/index.js';
import { renderFolder } from './render.js';
import { cached, clearCache } from './cache.js';

const createEl = document.getElementById('create');
const form = document.getElementById('source-form');
const input = document.getElementById('source-url');
const copyBtn = document.getElementById('copy-link');
const titleEl = document.getElementById('title');
const statusEl = document.getElementById('status');
const tabsEl = document.getElementById('tabs');
const panelEl = document.getElementById('panel');
const topbarEl = document.getElementById('topbar');
const footerLinksEl = document.getElementById('footer-links');
const resetLink = document.getElementById('reset-link');
const themeToggle = document.getElementById('theme-toggle');
const clearCacheBtn = document.getElementById('clear-cache');

const COPY_LABEL = 'Скопировать ссылку';

document.getElementById('supported').textContent =
  `Поддерживается: ${sources.map((s) => s.name).join(', ')}`;
resetLink.href = location.pathname;

themeToggle.checked = document.documentElement.dataset.theme === 'dark';
themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch { /* storage unavailable */ }
});

function setStatus(text, isError = false) {
  statusEl.hidden = !text;
  statusEl.textContent = text || '';
  statusEl.classList.toggle('error', isError);
}

function updateQuery(params) {
  const query = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
    else query.delete(key);
  }
  history.replaceState(null, '', `${location.pathname}?${query}`);
}

function showCreate() {
  createEl.hidden = false;
  topbarEl.hidden = true;
  footerLinksEl.hidden = true;
  input.focus();
}

async function open(url, sourceId) {
  createEl.hidden = true;
  topbarEl.hidden = false;
  footerLinksEl.hidden = false;
  titleEl.hidden = true;
  copyBtn.hidden = true;
  tabsEl.replaceChildren();
  panelEl.replaceChildren();

  const source = findSource(url, sourceId);
  if (!source) {
    setStatus('Эта ссылка не поддерживается.', true);
    return;
  }

  setStatus(`Загрузка (${source.name})…`);
  try {
    const cacheKey = `${source.id}:${url}`;
    const folder = await cached(cacheKey, () => source.load(url));
    setStatus('');
    titleEl.textContent = folder.name;
    titleEl.hidden = false;
    document.title = folder.name;
    copyBtn.hidden = false;

    renderFolder(folder, {
      tabsEl,
      panelEl,
      initialTab: new URLSearchParams(location.search).get('tab'),
      loadTab: (ref) => cached(`${cacheKey}#${ref}`, () => source.loadFolder(url, ref)),
      onTabChange: (tab) => updateQuery({ tab }),
    });
  } catch (err) {
    setStatus(`Не удалось загрузить папку: ${err.message}`, true);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const url = input.value.trim();
  updateQuery({ url, tab: null, source: null });
  open(url);
});

copyBtn.addEventListener('click', async () => {
  const link = new URL(location.href);
  link.searchParams.delete('tab');
  try {
    await navigator.clipboard.writeText(link.href);
    copyBtn.textContent = 'Скопировано!';
  } catch {
    copyBtn.textContent = 'Не удалось скопировать';
  }
  setTimeout(() => { copyBtn.textContent = COPY_LABEL; }, 1500);
});

clearCacheBtn.addEventListener('click', () => {
  clearCache();
  const current = new URLSearchParams(location.search);
  if (current.get('url')) open(current.get('url'), current.get('source'));
});

const params = new URLSearchParams(location.search);
const initialUrl = params.get('url');
if (initialUrl) {
  open(initialUrl, params.get('source'));
} else {
  showCreate();
}
