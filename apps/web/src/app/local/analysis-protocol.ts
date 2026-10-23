import type { AnalysisResult } from '@orrery/contracts';

/**
 * Messages between the page and the analysis worker. Only types live here,
 * so importing this file never pulls the analyser into the app bundle.
 */

/** A file from `<input webkitdirectory>`, with its path inside the picked folder. */
export interface PickedFile {
  path: string;
  file: File;
}

export type FolderSource =
  /** File System Access API: the worker walks the folder and never opens ignored folders. */
  | { kind: 'handle'; name: string; handle: FileSystemDirectoryHandle }
  /** `<input webkitdirectory>` fallback: the browser has already listed every file. */
  | { kind: 'files'; name: string; files: PickedFile[] };

export interface StartAnalysis {
  type: 'start';
  source: FolderSource;
}

export type AnalysisStage = 'scanning' | 'reading' | 'parsing';

export interface AnalysisReport {
  folderName: string;
  sourceFiles: number;
  totalBytes: number;
  /** Folders left out unopened, such as `node_modules` and `.git`. */
  ignoredFolders: string[];
  /** Files over the per-file limit, listed by path. */
  tooLarge: { path: string; size: number }[];
  /** Files that are not TypeScript source, only counted. */
  otherFiles: number;
  /** No `tsconfig.json` at the root means path aliases cannot resolve. */
  hasRootTsconfig: boolean;
}

export type WorkerMessage =
  | { type: 'progress'; stage: AnalysisStage; done: number; total: number | null }
  | { type: 'done'; result: AnalysisResult; report: AnalysisReport }
  | {
      type: 'over-limit';
      limit: 'files' | 'total-size';
      actual: number;
      allowed: number;
      report: AnalysisReport;
    }
  | { type: 'failed'; message: string };
