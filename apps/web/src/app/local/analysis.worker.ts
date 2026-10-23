/// <reference lib="webworker" />
import { analyzeAngularProject, selectFiles, type ProjectFile } from '@orrery/analyzer-angular';
import type {
  AnalysisReport,
  AnalysisStage,
  StartAnalysis,
  WorkerMessage,
} from './analysis-protocol';
import { walkFolder } from './folder-walk';

/**
 * Analyses a picked folder off the main thread. The TypeScript compiler is
 * loaded only here, and only once someone picks a folder. Files are read as
 * text and parsed; nothing is executed, installed or sent anywhere.
 * Cancelling terminates the worker.
 */

const post = (message: WorkerMessage) => postMessage(message);

/** At most one progress message per 100 ms, plus the last one of each stage. */
let lastProgress = 0;
const progress = (stage: AnalysisStage, done: number, total: number | null) => {
  const now = performance.now();
  if (now - lastProgress < 100 && done !== total) return;
  lastProgress = now;
  post({ type: 'progress', stage, done, total });
};

addEventListener('message', ({ data }: MessageEvent<StartAnalysis>) => {
  run(data).catch((error: unknown) =>
    post({ type: 'failed', message: error instanceof Error ? error.message : String(error) }),
  );
});

async function run({ source }: StartAnalysis): Promise<void> {
  progress('scanning', 0, null);
  const listing = await walkFolder(source, (count) => progress('scanning', count, null));
  const selection = selectFiles(listing.files);
  const report: AnalysisReport = {
    folderName: source.name,
    sourceFiles: selection.sourceCount,
    totalBytes: selection.totalBytes,
    ignoredFolders: listing.ignoredFolders,
    tooLarge: selection.skipped.map(({ path, size }) => ({ path, size })),
    otherFiles: selection.otherFiles,
    hasRootTsconfig: selection.read.some((entry) => entry.path === 'tsconfig.json'),
  };
  if (selection.overLimit) {
    post({ type: 'over-limit', ...selection.overLimit, report });
    return;
  }

  const byPath = new Map(listing.files.map((file) => [file.path, file]));
  const files: ProjectFile[] = [];
  for (const entry of selection.read) {
    files.push({ path: entry.path, text: await byPath.get(entry.path)!.read() });
    progress('reading', files.length, selection.read.length);
  }

  const result = analyzeAngularProject(
    {
      projectName: source.name,
      ref: null,
      createdAt: new Date().toISOString(),
      files,
    },
    { onFileParsed: (parsed, total) => progress('parsing', parsed, total) },
  );
  post({ type: 'done', result, report });
}
