// Registry of folder sources.
//
// A source is an object with:
//   id:    string            short identifier, usable as ?source=<id>
//   name:  string            human-readable name
//   match(url): boolean      true when this source can handle the link
//   load(url): Promise<Folder>
//     Loads the shared folder itself. Its subfolders should be FolderRefs,
//     so only one request is needed; each one becomes a tab.
//   loadFolder(url, ref): Promise<Folder>
//     Loads one subfolder (a tab) with everything inside it.
//
// Folder    = { name, files: File[], folders: (Folder | FolderRef)[] }
// FolderRef = { name, ref }   not loaded yet; ref is opaque to the app
// File      = { name, url, downloadUrl?, size?, mimeType?, modified? }
//   downloadUrl is needed for the in-page viewer and the download link.
//
// To add a new source, create a module in this folder that exports such an
// object and add it to the `sources` array below.

import yandexDisk from './yandex-disk.js';

export const sources = [yandexDisk];

export function findSource(url, id) {
  if (id) return sources.find((s) => s.id === id);
  return sources.find((s) => s.match(url));
}
