import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { RedirectCommand, Router, type ResolveFn } from '@angular/router';
import type { AnalysisResult } from '@orrery/contracts';
import { prepareSample, type LoadedSample } from '../samples/loaded-sample';
import type {
  AnalysisReport,
  AnalysisStage,
  FolderSource,
  StartAnalysis,
  WorkerMessage,
} from './analysis-protocol';

/** Creates the analysis worker. A token, so tests can swap in a fake. */
export const ANALYSIS_WORKER = new InjectionToken<() => Worker>('ANALYSIS_WORKER', {
  providedIn: 'root',
  // The literal `new Worker(new URL(...))` is what tells the builder to bundle the worker apart.
  factory: () => () =>
    new Worker(new URL('./analysis.worker', import.meta.url), { type: 'module' }),
});

/** The URL segment of an analysed folder: `/local`, `/local/list`. */
export const LOCAL_SAMPLE_ID = 'local';

export type AnalysisState =
  | { status: 'idle' }
  | {
      status: 'running';
      folderName: string;
      stage: AnalysisStage;
      done: number;
      total: number | null;
    }
  | { status: 'done'; sample: LoadedSample; report: AnalysisReport }
  | {
      status: 'over-limit';
      limit: 'files' | 'total-size';
      actual: number;
      allowed: number;
      report: AnalysisReport;
    }
  | { status: 'failed'; folderName: string; message: string }
  | { status: 'cancelled'; folderName: string };

/**
 * Runs one folder analysis at a time in a Web Worker and keeps the last
 * result for the `/local` views. Lives as long as the tab; nothing is stored,
 * so a reload starts from the folder picker again.
 */
@Injectable({ providedIn: 'root' })
export class FolderAnalysis {
  private readonly createWorker = inject(ANALYSIS_WORKER);
  private worker: Worker | null = null;

  private readonly current = signal<AnalysisState>({ status: 'idle' });
  readonly state = this.current.asReadonly();

  start(source: FolderSource): void {
    this.stop();
    this.current.set({
      status: 'running',
      folderName: source.name,
      stage: 'scanning',
      done: 0,
      total: null,
    });
    const worker = this.createWorker();
    this.worker = worker;
    worker.onmessage = ({ data }: MessageEvent<WorkerMessage>) => {
      if (this.worker === worker) this.receive(source.name, data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      if (this.worker === worker) this.fail(source.name, event.message || 'The worker stopped.');
    };
    try {
      worker.postMessage({ type: 'start', source } satisfies StartAnalysis);
    } catch (error) {
      // A browser that cannot pass a directory handle to a worker throws DataCloneError here.
      this.fail(
        source.name,
        error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      );
    }
  }

  /** Stops the running analysis at once: the worker is terminated, not asked to stop. */
  cancel(): void {
    const state = this.current();
    if (state.status !== 'running') return;
    this.stop();
    this.current.set({ status: 'cancelled', folderName: state.folderName });
  }

  private receive(folderName: string, message: WorkerMessage): void {
    switch (message.type) {
      case 'progress':
        this.current.set({
          status: 'running',
          folderName,
          stage: message.stage,
          done: message.done,
          total: message.total,
        });
        return;
      case 'done':
        this.stop();
        try {
          this.current.set({
            status: 'done',
            sample: prepareLocal(message.result),
            report: message.report,
          });
        } catch (error) {
          this.fail(folderName, error instanceof Error ? error.message : String(error));
        }
        return;
      case 'over-limit':
        this.stop();
        this.current.set({
          status: 'over-limit',
          limit: message.limit,
          actual: message.actual,
          allowed: message.allowed,
          report: message.report,
        });
        return;
      case 'failed':
        this.fail(folderName, message.message);
        return;
    }
  }

  private fail(folderName: string, message: string): void {
    this.stop();
    this.current.set({ status: 'failed', folderName, message });
  }

  private stop(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

/** Validates and lays out a worker's result, as for a bundled sample. */
export function prepareLocal(result: AnalysisResult): LoadedSample {
  return prepareSample(
    {
      id: LOCAL_SAMPLE_ID,
      name: result.project.name,
      description: 'A folder from this computer, analysed in the browser.',
      suggestedNode: mostUsedNode(result),
    },
    result,
  );
}

/** The service with the most direct dependants, else the most used file: a good first click. */
function mostUsedNode(result: AnalysisResult): string {
  const usedBy = new Map<string, Set<string>>();
  for (const edge of result.graph.edges) {
    const users = usedBy.get(edge.targetId) ?? new Set<string>();
    users.add(edge.sourceId);
    usedBy.set(edge.targetId, users);
  }
  const ranked = [...result.graph.nodes].sort(
    (a, b) =>
      Number(b.kind === 'service') - Number(a.kind === 'service') ||
      (usedBy.get(b.id)?.size ?? 0) - (usedBy.get(a.id)?.size ?? 0) ||
      (a.id < b.id ? -1 : 1),
  );
  return ranked[0]?.name ?? '';
}

/** `/local` shows the last analysed folder; with none (say, after a reload) it goes to the picker. */
export const localResolver: ResolveFn<LoadedSample> = () => {
  const state = inject(FolderAnalysis).state();
  if (state.status === 'done') return state.sample;
  return new RedirectCommand(inject(Router).parseUrl('/open'));
};
