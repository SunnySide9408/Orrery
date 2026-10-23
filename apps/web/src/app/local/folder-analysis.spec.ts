import { TestBed } from '@angular/core/testing';
import { shopFixture } from '@orrery/fixture-shop';
import type {
  AnalysisReport,
  FolderSource,
  StartAnalysis,
  WorkerMessage,
} from './analysis-protocol';
import { ANALYSIS_WORKER, FolderAnalysis } from './folder-analysis';

/** Stands in for the analysis worker: records what it is sent and replies on demand. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: StartAnalysis[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: StartAnalysis) {
    this.sent.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: WorkerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<WorkerMessage>);
  }
}

const report: AnalysisReport = {
  folderName: 'shop',
  sourceFiles: 40,
  totalBytes: 1000,
  ignoredFolders: ['node_modules'],
  tooLarge: [],
  otherFiles: 3,
  hasRootTsconfig: true,
};
const source: FolderSource = { kind: 'files', name: 'shop', files: [] };

describe('FolderAnalysis', () => {
  let analysis: FolderAnalysis;

  beforeEach(() => {
    FakeWorker.instances = [];
    TestBed.configureTestingModule({
      providers: [{ provide: ANALYSIS_WORKER, useValue: () => new FakeWorker() }],
    });
    analysis = TestBed.inject(FolderAnalysis);
  });

  it('starts a worker with the picked folder and reports progress', () => {
    analysis.start(source);
    const worker = FakeWorker.instances[0]!;
    expect(worker.sent).toEqual([{ type: 'start', source }]);
    worker.reply({ type: 'progress', stage: 'parsing', done: 3, total: 40 });
    expect(analysis.state()).toEqual({
      status: 'running',
      folderName: 'shop',
      stage: 'parsing',
      done: 3,
      total: 40,
    });
  });

  it('validates and lays out the result, then frees the worker', () => {
    analysis.start(source);
    const worker = FakeWorker.instances[0]!;
    worker.reply({ type: 'done', result: structuredClone(shopFixture), report });
    const state = analysis.state();
    expect(state.status).toBe('done');
    if (state.status !== 'done') return;
    expect(state.sample.info.id).toBe('local');
    expect(state.sample.layout.nodes).toHaveLength(shopFixture.graph.nodes.length);
    expect(state.sample.info.suggestedNode).toBe('AuthService');
    expect(worker.terminated).toBe(true);
  });

  it('cancel terminates the worker at once and ignores anything it still sends', () => {
    analysis.start(source);
    const worker = FakeWorker.instances[0]!;
    analysis.cancel();
    expect(worker.terminated).toBe(true);
    expect(analysis.state()).toEqual({ status: 'cancelled', folderName: 'shop' });
    worker.reply({ type: 'done', result: structuredClone(shopFixture), report });
    expect(analysis.state().status).toBe('cancelled');
  });

  it('a new pick replaces a running analysis', () => {
    analysis.start(source);
    analysis.start({ ...source, name: 'other' });
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
    FakeWorker.instances[0]!.reply({ type: 'failed', message: 'late' });
    expect(analysis.state()).toMatchObject({ status: 'running', folderName: 'other' });
  });

  it('passes on a limit the folder breaks', () => {
    analysis.start(source);
    FakeWorker.instances[0]!.reply({
      type: 'over-limit',
      limit: 'files',
      actual: 5001,
      allowed: 5000,
      report,
    });
    expect(analysis.state()).toEqual({
      status: 'over-limit',
      limit: 'files',
      actual: 5001,
      allowed: 5000,
      report,
    });
  });

  it('reports a folder the browser cannot pass to the worker', () => {
    FakeWorker.prototype.postMessage = function () {
      throw new DOMException('could not be cloned', 'DataCloneError');
    };
    try {
      analysis.start(source);
    } finally {
      FakeWorker.prototype.postMessage = function (this: FakeWorker, message: StartAnalysis) {
        this.sent.push(message);
      };
    }
    expect(analysis.state()).toEqual({
      status: 'failed',
      folderName: 'shop',
      message: 'DataCloneError: could not be cloned',
    });
    expect(FakeWorker.instances[0]!.terminated).toBe(true);
  });

  it('reports a result that fails validation instead of showing it', () => {
    analysis.start(source);
    FakeWorker.instances[0]!.reply({
      type: 'done',
      result: { ...structuredClone(shopFixture), schemaVersion: 999 } as never,
      report,
    });
    expect(analysis.state().status).toBe('failed');
  });
});
