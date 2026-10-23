import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { analyzeAngularProject } from '@orrery/analyzer-angular';
import { parseAnalysisResult, type AnalysisResult } from '@orrery/contracts';
import { readProject } from './read-project';
import { SAMPLES, type SampleSource } from './samples';

const USAGE = `Usage:
  orrery analyze <project-dir> [--include src] [--name <name>] [--ref <ref>] [--out <file>]
  orrery sample <id|all> [--out-dir apps/web/public/samples]

Samples: ${SAMPLES.map((sample) => sample.id).join(', ')}`;

async function main(argv: readonly string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      include: { type: 'string', multiple: true },
      name: { type: 'string' },
      ref: { type: 'string' },
      out: { type: 'string' },
      'out-dir': { type: 'string', default: 'apps/web/public/samples' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const [command, target] = positionals;

  if (values.help || !command || !target) {
    console.log(USAGE);
    process.exitCode = values.help ? 0 : 1;
    return;
  }

  if (command === 'analyze') {
    const root = resolve(target);
    const result = await analyze(root, {
      include: values.include ?? ['src'],
      name: values.name ?? basename(root),
      ref: values.ref ?? null,
      createdAt: new Date().toISOString(),
    });
    await output(result, values.out ?? null);
  } else if (command === 'sample') {
    const samples = target === 'all' ? SAMPLES : SAMPLES.filter((sample) => sample.id === target);
    if (samples.length === 0) throw new Error(`Unknown sample "${target}".\n\n${USAGE}`);
    for (const sample of samples) {
      const result = await analyzeSample(sample);
      await output(result, join(values['out-dir'], `${sample.id}.json`));
    }
  } else {
    throw new Error(`Unknown command "${command}".\n\n${USAGE}`);
  }
}

interface AnalyzeOptions {
  include: readonly string[];
  name: string;
  ref: string | null;
  createdAt: string;
}

async function analyze(root: string, options: AnalyzeOptions): Promise<AnalysisResult> {
  const files = await readProject(root, options.include);
  const result = analyzeAngularProject({
    projectName: options.name,
    ref: options.ref,
    createdAt: options.createdAt,
    files,
  });
  // Same check the app runs when it loads the JSON, so a bad result fails here first.
  return parseAnalysisResult(result);
}

/**
 * Clones the sample at its pinned commit into a temporary folder and analyses
 * it. `git clone` only downloads files: no install, no build, no hooks from
 * the sample run. The commit date is used as `createdAt`, so the output only
 * changes when the commit or the analyser changes.
 */
async function analyzeSample(sample: SampleSource): Promise<AnalysisResult> {
  const dir = await mkdtemp(join(tmpdir(), `orrery-${sample.id}-`));
  try {
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      }).trim();
    git('init', '--quiet');
    git('remote', 'add', 'origin', sample.repository);
    git('fetch', '--quiet', '--depth', '1', 'origin', sample.commit);
    git('-c', 'advice.detachedHead=false', 'checkout', '--quiet', 'FETCH_HEAD');
    const createdAt = new Date(git('log', '-1', '--format=%cI')).toISOString();
    console.error(`Analysing ${sample.name} at ${sample.commit.slice(0, 7)}`);
    return await analyze(dir, {
      include: sample.include,
      name: sample.name,
      ref: sample.commit,
      createdAt,
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function output(result: AnalysisResult, file: string | null): Promise<void> {
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (file === null) {
    process.stdout.write(json);
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, json);
  const { nodes, edges, regions } = result.graph;
  console.error(
    `Wrote ${file}: ${nodes.length} nodes, ${edges.length} edges, ${regions.length} regions, ${result.unresolved.length} unresolved`,
  );
}

main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
