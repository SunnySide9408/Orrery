import { isIgnoredFolder, type FolderEntry } from '@orrery/analyzer-angular';
import type { FolderSource } from './analysis-protocol';

/** A file found in the picked folder, opened only if the selection keeps it. */
export interface FoundFile extends FolderEntry {
  read(): Promise<string>;
}

export interface FolderListing {
  files: FoundFile[];
  ignoredFolders: string[];
}

/**
 * Lists the picked folder without reading any file. With a directory handle,
 * ignored folders are never opened, so `node_modules` costs nothing. Runs in
 * the worker.
 */
export async function walkFolder(
  source: FolderSource,
  onFound: (count: number) => void,
): Promise<FolderListing> {
  const files: FoundFile[] = [];
  const ignored = new Set<string>();

  if (source.kind === 'files') {
    for (const { path, file } of source.files) {
      const parts = path.split('/');
      const skipAt = parts.slice(0, -1).findIndex(isIgnoredFolder);
      if (skipAt !== -1) {
        ignored.add(parts.slice(0, skipAt + 1).join('/'));
        continue;
      }
      files.push({ path, size: file.size, read: () => file.text() });
      if (files.length % 200 === 0) onFound(files.length);
    }
  } else {
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const entry of dir.values()) {
        const path = prefix + entry.name;
        if (entry.kind === 'directory') {
          if (isIgnoredFolder(entry.name)) ignored.add(path);
          else await walk(entry as FileSystemDirectoryHandle, `${path}/`);
        } else {
          const file = await (entry as FileSystemFileHandle).getFile();
          files.push({ path, size: file.size, read: () => file.text() });
          if (files.length % 200 === 0) onFound(files.length);
        }
      }
    };
    await walk(source.handle, '');
  }

  onFound(files.length);
  return { files, ignoredFolders: [...ignored].sort() };
}
