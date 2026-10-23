// Fails the build if the TypeScript compiler or the analyser reaches any part
// of the app other than the folder-analysis worker. The sample path only reads
// pre-analysed JSON; the compiler loads in the worker, and only when someone
// analyses a folder. The worker must exist and must hold the analyser.
// Reads the esbuild metafile written by `ng build --stats-json`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const statsPath = join(import.meta.dirname, '..', 'dist', 'web', 'browser-stats.json');
const stats = JSON.parse(readFileSync(statsPath, 'utf8'));

// `select-files.ts` holds only the folder limits and filters, shown on the picker page.
const forbidden = [
  /node_modules\/typescript\//,
  /packages\/analyzer-angular\/(?!src\/select-files\.ts$)/,
];
const problems = [];
const workers = [];
for (const [output, { inputs, entryPoint }] of Object.entries(stats.outputs)) {
  const names = Object.keys(inputs ?? {});
  if (entryPoint?.endsWith('analysis.worker.ts')) {
    workers.push(output);
    if (!names.some((input) => /node_modules\/typescript\//.test(input)))
      problems.push(`${output} is the analysis worker but has no TypeScript compiler`);
    continue;
  }
  for (const input of names) {
    if (forbidden.some((pattern) => pattern.test(input)))
      problems.push(`${output} contains ${input}`);
  }
}
if (workers.length !== 1) problems.push(`expected one analysis worker, found ${workers.length}`);

if (problems.length > 0) {
  console.error(
    `Only the analysis worker may contain the TypeScript compiler or the analyser:\n- ${problems.join('\n- ')}`,
  );
  process.exit(1);
}
const files = Object.keys(stats.outputs).filter((name) => name.endsWith('.js')).length;
console.log(
  `Bundle check passed: ${files} JavaScript files; the TypeScript compiler is only in ${workers[0]}.`,
);
