import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { isIgnoredFolder, isSourcePath, type ProjectFile } from '@orrery/analyzer-angular';

/**
 * Reads the files the analyser needs: `.ts` sources under `include`, plus the
 * `tsconfig*.json` files at the project root for path aliases. Nothing is
 * installed or executed; files are only read as text.
 */
export async function readProject(
  root: string,
  include: readonly string[],
): Promise<ProjectFile[]> {
  const files: ProjectFile[] = [];
  const add = async (absolute: string) => {
    files.push({
      path: relative(root, absolute).split(sep).join('/'),
      text: await readFile(absolute, 'utf8'),
    });
  };

  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isFile() && /^tsconfig.*\.json$/.test(entry.name)) await add(join(root, entry.name));
  }

  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : 1));
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && !isIgnoredFolder(entry.name)) await walk(path);
      else if (entry.isFile() && isSourcePath(entry.name)) await add(path);
    }
  };
  for (const folder of include) await walk(join(root, folder));

  return files;
}
