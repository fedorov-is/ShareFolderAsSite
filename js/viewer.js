// In-page file viewer shown in a modal dialog.
// Works with any source: it only needs File.downloadUrl and, optionally,
// File.mimeType and File.size (see sources/index.js).

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 50 * 1024 * 1024;
const MAX_OFFICE_BYTES = 20 * 1024 * 1024;

// Office parsers, loaded only when such a file is opened.
const LIBRARIES = {
  mammoth: {
    src: 'https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',
    integrity: 'sha384-/cXAMbzovUIKbBERjPmR3SnPTh8siWr5lsvFYj1Uq4XP0yaJUZJmsh0YXyGv5P0y',
  },
  XLSX: {
    src: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
    integrity: 'sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT',
  },
};

const MIME_KINDS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
  'application/vnd.ms-excel': 'sheet',
  'application/vnd.ms-excel.sheet.macroenabled.12': 'sheet',
  'application/vnd.oasis.opendocument.spreadsheet': 'sheet',
};

const EXTENSIONS = {
  docx: ['docx'],
  sheet: ['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'],
  video: ['mp4', 'webm', 'ogv', 'mov', 'm4v'],
  audio: ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus'],
  pdf: ['pdf'],
  text: ['txt', 'md', 'csv', 'tsv', 'log', 'json', 'xml', 'yml', 'yaml', 'ini', 'cfg', 'conf',
    'html', 'htm', 'css', 'js', 'mjs', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'h', 'cpp', 'hpp',
    'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bat', 'ps1', 'sql', 'kt', 'swift', 'lua', 'toml'],
};

export function previewKind(file) {
  if (!file.downloadUrl) return null;
  const mime = file.mimeType ?? '';
  if (MIME_KINDS[mime.toLowerCase()]) return MIME_KINDS[mime.toLowerCase()];
  for (const kind of ['image', 'video', 'audio', 'text']) {
    if (mime.startsWith(`${kind}/`)) return kind;
  }
  if (/^application\/(json|xml|javascript)/.test(mime)) return 'text';

  const ext = file.name.split('.').pop().toLowerCase();
  return Object.keys(EXTENSIONS).find((kind) => EXTENSIONS[kind].includes(ext)) ?? null;
}

const loadedLibraries = {};

function loadLibrary(name) {
  loadedLibraries[name] ??= new Promise((resolve, reject) => {
    const { src, integrity } = LIBRARIES[name];
    const script = Object.assign(document.createElement('script'), {
      src, integrity, crossOrigin: 'anonymous',
    });
    script.onload = () => resolve(window[name]);
    script.onerror = () => {
      delete loadedLibraries[name];
      script.remove();
      reject(new Error('Не удалось загрузить модуль просмотра.'));
    };
    document.head.append(script);
  });
  return loadedLibraries[name];
}

// Converted documents go into a sandboxed iframe: no scripts run,
// links open in a new tab.
function documentFrame(html, title) {
  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const srcdoc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<base target="_blank">
<style>
  body { margin: 0; padding: 16px 24px; font: 15px/1.5 system-ui, sans-serif;
         background: ${color('--card')}; color: ${color('--fg')}; }
  a { color: ${color('--accent')}; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
  td, th { border: 1px solid ${color('--border')}; padding: 4px 8px; vertical-align: top; }
  .sheet td { white-space: nowrap; }
</style></head><body>${html}</body></html>`;

  const frame = el('iframe', { title, srcdoc });
  frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
  return frame;
}

async function renderDocx(file) {
  const [mammoth, res] = await Promise.all([loadLibrary('mammoth'), fetchContent(file, MAX_OFFICE_BYTES)]);
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await res.arrayBuffer() });
  bodyEl.replaceChildren(documentFrame(value, file.name));
}

async function renderSheet(file) {
  const [XLSX, res] = await Promise.all([loadLibrary('XLSX'), fetchContent(file, MAX_OFFICE_BYTES)]);
  const workbook = XLSX.read(await res.arrayBuffer(), { type: 'array' });
  const names = workbook.SheetNames;
  const stack = el('div', { className: 'viewer-stack' });
  let frame = el('iframe');
  stack.append(frame);

  const show = (index) => {
    const table = XLSX.utils.sheet_to_html(workbook.Sheets[names[index]], { header: '', footer: '' });
    const next = documentFrame(`<div class="sheet">${table}</div>`, `${file.name}: ${names[index]}`);
    frame.replaceWith(next);
    frame = next;
    buttons.forEach((b, i) => b.setAttribute('aria-selected', String(i === index)));
  };

  const buttons = names.map((name, index) => {
    const button = el('button', { type: 'button', className: 'tab', textContent: name, onclick: () => show(index) });
    button.setAttribute('role', 'tab');
    return button;
  });
  if (names.length > 1) stack.prepend(el('nav', { className: 'tabs', role: 'tablist' }, buttons));

  bodyEl.replaceChildren(stack);
  show(0);
}

let dialog;
let titleEl;
let downloadEl;
let bodyEl;
let controller;
let objectUrl;

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function ensureDialog() {
  if (dialog) return;
  titleEl = el('span', { className: 'viewer-title' });
  downloadEl = el('a', { className: 'download', rel: 'noopener', textContent: 'Скачать' });
  const closeBtn = el('button', { type: 'button', className: 'secondary', textContent: 'Закрыть' });
  bodyEl = el('div', { className: 'viewer-body' });

  dialog = el('dialog', { className: 'viewer' }, [
    el('div', { className: 'viewer-head' }, [titleEl, downloadEl, closeBtn]),
    bodyEl,
  ]);
  closeBtn.addEventListener('click', () => dialog.close());
  // Close on a click on the backdrop.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', cleanup);
  document.body.append(dialog);
}

function cleanup() {
  controller?.abort();
  controller = null;
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
  bodyEl.replaceChildren();
}

function showFallback(file, text) {
  bodyEl.replaceChildren(el('p', { className: 'empty' }, [
    `${text} `,
    el('a', { href: file.url, target: '_blank', rel: 'noopener', textContent: 'Открыть в источнике' }),
  ]));
}

async function fetchContent(file, maxBytes) {
  if (file.size > maxBytes) throw new Error('Файл слишком большой для просмотра.');
  controller = new AbortController();
  const res = await fetch(file.downloadUrl, { signal: controller.signal });
  if (!res.ok) throw new Error(`Ошибка ${res.status}`);
  return res;
}

// Keeps the loading message until the media element can show something.
function showWhenReady(node, readyEvent) {
  node.hidden = true;
  bodyEl.append(node);
  return new Promise((resolve, reject) => {
    node.addEventListener(readyEvent, () => {
      // The viewer was closed or switched to another file meanwhile.
      if (node.isConnected) bodyEl.replaceChildren(node);
      node.hidden = false;
      resolve();
    }, { once: true });
    node.addEventListener('error', () => {
      if (node.isConnected) reject(new Error('Не удалось загрузить содержимое.'));
      else resolve();
    }, { once: true });
  });
}

async function renderContent(file, kind) {
  switch (kind) {
    case 'image':
      await showWhenReady(el('img', { src: file.downloadUrl, alt: file.name }), 'load');
      break;
    case 'video':
      await showWhenReady(el('video', { src: file.downloadUrl, controls: true, autoplay: true }), 'loadeddata');
      break;
    case 'audio':
      bodyEl.replaceChildren(el('audio', { src: file.downloadUrl, controls: true, autoplay: true }));
      break;
    case 'text': {
      const res = await fetchContent(file, MAX_TEXT_BYTES);
      bodyEl.replaceChildren(el('pre', { textContent: await res.text() }));
      break;
    }
    case 'pdf': {
      // Download links force a file download, so show the PDF from a local blob.
      const res = await fetchContent(file, MAX_PDF_BYTES);
      const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
      objectUrl = URL.createObjectURL(blob);
      bodyEl.replaceChildren(el('iframe', { src: objectUrl, title: file.name }));
      break;
    }
    case 'docx':
      await renderDocx(file);
      break;
    case 'sheet':
      await renderSheet(file);
      break;
  }
}

export async function openViewer(file) {
  ensureDialog();
  cleanup();
  titleEl.textContent = file.name;
  downloadEl.href = file.downloadUrl;
  bodyEl.replaceChildren(el('p', { className: 'empty', textContent: 'Загрузка…' }));

  const kind = previewKind(file);
  dialog.classList.toggle('viewer--fit', ['image', 'video', 'audio'].includes(kind));
  dialog.showModal();

  try {
    await renderContent(file, kind);
  } catch (err) {
    if (err.name === 'AbortError') return;
    const reason = err instanceof TypeError ? 'Не удалось загрузить содержимое.' : err.message;
    showFallback(file, reason);
  }
}
