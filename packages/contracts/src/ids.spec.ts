import { describe, expect, it } from 'vitest';
import { edgeId, findingId, nodeId, normalizePath, regionId } from './ids';

describe('normalizePath', () => {
  it('uses forward slashes and drops leading and repeated separators', () => {
    expect(normalizePath('.\\src\\app//core/./auth.service.ts')).toBe(
      'src/app/core/auth.service.ts',
    );
    expect(normalizePath('/src/main.ts')).toBe('src/main.ts');
  });

  it('rejects paths that leave the project root', () => {
    expect(() => normalizePath('../outside.ts')).toThrow(/inside the project root/);
  });

  it('rejects empty paths', () => {
    expect(() => normalizePath('./')).toThrow(/empty/);
  });
});

describe('ID rules', () => {
  it('derives node IDs from the normalised path', () => {
    expect(nodeId('./src/app/app.ts')).toBe('src/app/app.ts');
  });

  it('prefixes region IDs with their kind', () => {
    expect(regionId('lazy-route', 'src/app/features/checkout/')).toBe(
      'lazy-route:src/app/features/checkout',
    );
  });

  it('encodes edge direction from source to target', () => {
    expect(edgeId('import', 'a.ts', 'b.ts')).toBe('import:a.ts->b.ts');
  });

  it('gives the same finding ID regardless of node order', () => {
    expect(findingId('cycle', ['b.ts', 'a.ts'])).toBe(findingId('cycle', ['a.ts', 'b.ts']));
  });
});
