import { describe, expect, it } from 'vitest';
import { isIgnoredFolder, selectFiles, type FolderLimits } from './select-files';

const limits: FolderLimits = { maxFiles: 3, maxTotalBytes: 1000, maxFileBytes: 400 };

describe('isIgnoredFolder', () => {
  it('skips dependencies, build output and hidden folders', () => {
    for (const name of ['node_modules', 'dist', '.git', '.angular', 'coverage', 'out-tsc']) {
      expect(isIgnoredFolder(name)).toBe(true);
    }
    expect(isIgnoredFolder('src')).toBe(false);
    expect(isIgnoredFolder('distance')).toBe(false);
  });
});

describe('selectFiles', () => {
  it('reads sources and tsconfig files, sorted, and counts the rest', () => {
    const selection = selectFiles(
      [
        { path: 'src/app/b.ts', size: 10 },
        { path: 'src/app/a.component.html', size: 10 },
        { path: 'src/app/a.ts', size: 10 },
        { path: 'src/typings.d.ts', size: 10 },
        { path: 'tsconfig.json', size: 10 },
        { path: 'projects/lib/tsconfig.lib.json', size: 10 },
        { path: 'package.json', size: 10 },
      ],
      limits,
    );
    expect(selection.read.map((entry) => entry.path)).toEqual([
      'projects/lib/tsconfig.lib.json',
      'src/app/a.ts',
      'src/app/b.ts',
      'tsconfig.json',
    ]);
    expect(selection.sourceCount).toBe(2);
    expect(selection.totalBytes).toBe(40);
    expect(selection.otherFiles).toBe(3);
    expect(selection.overLimit).toBeNull();
  });

  it('skips and lists a file over the per-file limit', () => {
    const selection = selectFiles(
      [
        { path: 'src/huge.ts', size: 401 },
        { path: 'src/ok.ts', size: 400 },
      ],
      limits,
    );
    expect(selection.skipped).toEqual([{ path: 'src/huge.ts', size: 401, reason: 'too-large' }]);
    expect(selection.read.map((entry) => entry.path)).toEqual(['src/ok.ts']);
  });

  it('stops when there are more source files than allowed', () => {
    const entries = ['a', 'b', 'c', 'd'].map((name) => ({ path: `src/${name}.ts`, size: 1 }));
    expect(selectFiles(entries, limits).overLimit).toEqual({
      limit: 'files',
      actual: 4,
      allowed: 3,
    });
  });

  it('stops when the files to read are larger than allowed in total', () => {
    const entries = ['a', 'b', 'c'].map((name) => ({ path: `src/${name}.ts`, size: 350 }));
    expect(selectFiles(entries, limits).overLimit).toEqual({
      limit: 'total-size',
      actual: 1050,
      allowed: 1000,
    });
  });
});
