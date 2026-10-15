// Renders a normalized Folder (see sources/index.js) as tabs.
// Each top-level subfolder becomes a tab; files in the root go to a first tab.
// A subfolder tab is loaded via loadTab only when it is selected.
// Nested subfolders are shown as groups inside their tab.

import { openViewer, previewKind } from './viewer.js';

const ROOT_TAB = 'Файлы';

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function message(text, isError = false) {
  return el('p', { className: isError ? 'status error' : 'empty', textContent: text });
}

function renderFileList(files) {
  return el('ul', { className: 'files' }, files.map((file) => {
    const parts = [
      el('a', { className: 'name', href: file.url, target: '_blank', rel: 'noopener', textContent: file.name }),
    ];
    if (previewKind(file)) {
      parts.push(el('button', {
        type: 'button',
        className: 'secondary',
        textContent: 'Просмотр',
        onclick: () => openViewer(file),
      }));
    }
    if (file.downloadUrl) {
      parts.push(el('a', { className: 'download', href: file.downloadUrl, rel: 'noopener', textContent: 'Скачать' }));
    }
    return el('li', {}, parts);
  }));
}

function renderGroup(folder, path) {
  const nodes = [];
  const files = folder.files ?? [];
  if (files.length) {
    nodes.push(el('div', { className: 'group' }, [
      ...(path ? [el('h3', { textContent: path })] : []),
      renderFileList(files),
    ]));
  }
  for (const sub of folder.folders ?? []) {
    nodes.push(...renderGroup(sub, path ? `${path} / ${sub.name}` : sub.name));
  }
  return nodes;
}

function buildTabs(root) {
  const tabs = [];
  if (root.files.length) {
    tabs.push({ name: ROOT_TAB, folder: { ...root, folders: [] } });
  }
  for (const folder of root.folders) {
    tabs.push(folder.ref == null ? { name: folder.name, folder } : { name: folder.name, ref: folder.ref });
  }
  return tabs;
}

export function renderFolder(root, { tabsEl, panelEl, initialTab, loadTab, onTabChange }) {
  const tabs = buildTabs(root);
  tabsEl.replaceChildren();
  panelEl.replaceChildren();

  if (!tabs.length) {
    panelEl.append(message('Папка пуста.'));
    return;
  }

  const buttons = tabs.map((tab, index) => el('button', {
    className: 'tab',
    type: 'button',
    textContent: tab.name,
    onclick: () => select(index),
  }));
  buttons.forEach((b) => b.setAttribute('role', 'tab'));
  tabsEl.append(...buttons);

  let selected = -1;

  async function select(index) {
    selected = index;
    buttons.forEach((b, i) => b.setAttribute('aria-selected', String(i === index)));
    onTabChange?.(tabs[index].name);

    let folder = tabs[index].folder;
    if (!folder) {
      panelEl.replaceChildren(message('Загрузка…'));
      try {
        folder = await loadTab(tabs[index].ref);
      } catch (err) {
        if (selected === index) panelEl.replaceChildren(message(`Не удалось загрузить: ${err.message}`, true));
        return;
      }
      // Another tab was selected while this one was loading.
      if (selected !== index) return;
    }

    const nodes = renderGroup(folder, '');
    panelEl.replaceChildren(...(nodes.length ? nodes : [message('Нет файлов.')]));
  }

  const start = Math.max(0, tabs.findIndex((t) => t.name === initialTab));
  select(start);
}
