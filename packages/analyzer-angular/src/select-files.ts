/**
 * Decides which files of a picked folder the analyser reads, before any file
 * is opened. Shared by the CLI and the browser's folder analysis, so both skip
 * the same things.
 */

/** Folders that never hold the app's own source. Hidden folders (`.git`, `.angular`) are skipped too. */
const IGNORED_FOLDERS = new Set(['node_modules', 'dist', 'coverage', 'out-tsc', 'tmp']);

export function isIgnoredFolder(name: string): boolean {
  return name.startsWith('.') || IGNORED_FOLDERS.has(name);
}

/** What a picked folder may hold before analysis stops or skips files. */
export interface FolderLimits {
  /** Source files (`.ts`, not `.d.ts`) after filtering. */
  maxFiles: number;
  /** Bytes of every file that would be read. */
  maxTotalBytes: number;
  /** A larger file is skipped and listed, not read. */
  maxFileBytes: number;
}

/** Confirmed for Phase 2 (2026-10-23). See docs/decisions/0007. */
export const FOLDER_LIMITS: FolderLimits = {
  maxFiles: 5_000,
  maxTotalBytes: 50 * 1024 * 1024,
  maxFileBytes: 1024 * 1024,
};

/** A file found in the folder, known by path and size only. */
export interface FolderEntry {
  /** Relative to the picked folder, with `/` separators. */
  path: string;
  size: number;
}

export interface SkippedFile {
  path: string;
  size: number;
  reason: 'too-large';
}

export interface OverLimit {
  limit: 'files' | 'total-size';
  /** How many files, or how many bytes, the folder has. */
  actual: number;
  allowed: number;
}

export interface FileSelection {
  /** Files to read, sorted by path: sources plus every `tsconfig*.json`. */
  read: FolderEntry[];
  sourceCount: number;
  totalBytes: number;
  /** Files that would have been read but break the per-file limit. */
  skipped: SkippedFile[];
  /** Files that are not TypeScript source (templates, styles, assets, `.d.ts`). */
  otherFiles: number;
  /** Set when the folder breaks a limit; nothing should be read then. */
  overLimit: OverLimit | null;
}

export function isSourcePath(path: string): boolean {
  return path.endsWith('.ts') && !path.endsWith('.d.ts');
}

export function isTsconfigPath(path: string): boolean {
  return /(^|\/)tsconfig[^/]*\.json$/.test(path);
}

/**
 * Picks the files to read from a folder listing (ignored folders already left
 * out by the walker) and checks the limits. Pure, so it is unit-tested apart
 * from any file system.
 */
export function selectFiles(
  entries: readonly FolderEntry[],
  limits: FolderLimits = FOLDER_LIMITS,
): FileSelection {
  const read: FolderEntry[] = [];
  const skipped: SkippedFile[] = [];
  let otherFiles = 0;
  let sourceCount = 0;
  let totalBytes = 0;

  for (const entry of [...entries].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const source = isSourcePath(entry.path);
    if (!source && !isTsconfigPath(entry.path)) {
      otherFiles++;
    } else if (entry.size > limits.maxFileBytes) {
      skipped.push({ path: entry.path, size: entry.size, reason: 'too-large' });
    } else {
      read.push(entry);
      totalBytes += entry.size;
      if (source) sourceCount++;
    }
  }

  let overLimit: OverLimit | null = null;
  if (sourceCount > limits.maxFiles) {
    overLimit = { limit: 'files', actual: sourceCount, allowed: limits.maxFiles };
  } else if (totalBytes > limits.maxTotalBytes) {
    overLimit = { limit: 'total-size', actual: totalBytes, allowed: limits.maxTotalBytes };
  }
  return { read, sourceCount, totalBytes, skipped, otherFiles, overLimit };
}
