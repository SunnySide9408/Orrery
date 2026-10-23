// Fails the build if the shipped app contains the TypeScript compiler or the
// analyser. The sample path only reads pre-analysed JSON; the compiler is
// meant to load in a Web Worker, and only for folder analysis (Phase 2).
// Reads the esbuild metafile written by `ng build --stats-json`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const statsPath = join(import.meta.dirname, '..', 'dist', 'web', 'browser-stats.json');
const stats = JSON.parse(readFileSync(statsPath, 'utf8'));

const forbidden = [/node_modules\/typescript\//, /packages\/analyzer-angular\//];
const problems = [];
for (const [output, { inputs }] of Object.entries(stats.outputs)) {
  for (const input of Object.keys(inputs ?? {})) {
    if (forbidden.some((pattern) => pattern.test(input)))
      problems.push(`${output} contains ${input}`);
  }
}

if (problems.length > 0) {
  console.error(
    `The app bundle must not contain the TypeScript compiler or the analyser:\n- ${problems.join('\n- ')}`,
  );
  process.exit(1);
}
const files = Object.keys(stats.outputs).filter((name) => name.endsWith('.js')).length;
console.log(`Bundle check passed: ${files} JavaScript files, no TypeScript compiler, no analyser.`);
