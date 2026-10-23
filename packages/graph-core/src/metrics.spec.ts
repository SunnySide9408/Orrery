import { describe, expect, it } from 'vitest';
import { createGraphIndex } from './graph-index';
import { degrees, flagThreshold, percentile } from './metrics';
import { graphOf } from './testing';

describe('degrees', () => {
  it('counts distinct direct neighbours, once per node whatever the edge kinds', () => {
    const index = createGraphIndex(
      graphOf([
        ['import', 'header.ts', 'auth.ts'],
        ['inject', 'header.ts', 'auth.ts'],
        ['import', 'login.ts', 'auth.ts'],
        ['import', 'auth.spec.ts', 'auth.ts'],
      ]),
    );
    const all = degrees(index);
    expect(all.get('auth.ts')).toEqual({ fanIn: 3, fanOut: 0 });
    expect(all.get('header.ts')).toEqual({ fanIn: 0, fanOut: 1 });

    const noSpecs = degrees(index, (id) => !id.endsWith('.spec.ts'));
    expect(noSpecs.get('auth.ts')).toEqual({ fanIn: 2, fanOut: 0 });
    expect(noSpecs.has('auth.spec.ts')).toBe(false);
  });
});

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const values = Array.from({ length: 20 }, (_, i) => i + 1); // 1..20
    expect(percentile(values, 95)).toBe(19);
    expect(percentile(values, 50)).toBe(10);
    expect(percentile(values, 100)).toBe(20);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile([], 95)).toBe(0);
  });
});

describe('flagThreshold', () => {
  it('flags counts at or above the percentile', () => {
    const values = Array.from({ length: 100 }, (_, i) => i); // 0..99
    expect(flagThreshold(values, { percentile: 95, minimum: 10 })).toBe(94);
  });

  it('never goes below the minimum, so small projects stay quiet', () => {
    expect(flagThreshold([0, 1, 1, 2, 3], { percentile: 95, minimum: 10 })).toBe(10);
  });
});
