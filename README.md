# Shared Folder Viewer

Static site that renders a shared cloud folder as tabs with links to its files.
Each top-level subfolder becomes a tab; files in the root folder go to a "Files" tab.
Deeper subfolders are shown as groups inside their tab.

## Usage

Serve the folder with any static server (ES modules do not load from `file://`):

```sh
npx serve .
# or
python -m http.server
```

Paste a public folder link, for example `https://disk.yandex.ru/d/abc123`, and press **Open**.

Share a folder directly with a query link:

```
https://your-site/?url=https%3A%2F%2Fdisk.yandex.ru%2Fd%2Fabc123
```

Optional query parameters:

- `tab` – name of the tab to open first.
- `source` – force a source by id (e.g. `yandex`) instead of detecting it from the link.

## Adding a source

1. Create `js/sources/<name>.js` that exports a default object:

   ```js
   export default {
     id: 'mysource',
     name: 'My Source',
     match(url) { /* return true if this source handles the link */ },
     // The shared folder itself; subfolders as unloaded refs { name, ref }.
     async load(url) {
       // return { name, files: [{ name, url, downloadUrl?, size?, modified? }], folders: [{ name, ref }] }
     },
     // One subfolder (a tab) with all its content, loaded when the tab is opened.
     async loadFolder(url, ref) {
       // return { name, files: [...], folders: [/* nested folders, same shape */] }
     },
   };
   ```

2. Add it to the `sources` array in [js/sources/index.js](js/sources/index.js).

Rendering only uses the normalized folder shape, so no other changes are needed.
