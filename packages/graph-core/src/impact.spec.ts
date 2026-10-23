import { describe, expect, it } from 'vitest';
import { createGraphIndex } from './graph-index';
import { traceImpact } from './impact';
import { graphOf } from './testing';

describe('traceImpact', () => {
  // login and header use auth; app uses header and login; main uses app.
  const index = createGraphIndex(
    graphOf([
      ['import', 'login.ts', 'auth.ts'],
      ['inject', 'header.ts', 'auth.ts'],
      ['import', 'header.ts', 'auth.ts'],
      ['import', 'app.ts', 'header.ts'],
      ['import', 'app.ts', 'login.ts'],
      ['import', 'main.ts', 'app.ts'],
      ['import', 'auth.ts', 'http.ts'],
    ]),
  );

  it('groups transitive dependants in waves by graph distance', () => {
    const impact = traceImpact(index, 'auth.ts');
    expect(impact.waves).toEqual([['header.ts', 'login.ts'], ['app.ts'], ['main.ts']]);
    expect(impact.distance.get('main.ts')).toBe(3);
    expect(impact.distance.has('http.ts')).toBe(false);
  });

  it('gives a shortest path from each dependant, the same on every run', () => {
    const impact = traceImpact(index, 'auth.ts');
    // app reaches auth through header and through login; header comes first by ID.
    expect(impact.pathFrom('main.ts')).toEqual(['main.ts', 'app.ts', 'header.ts', 'auth.ts']);
    expect(impact.pathFrom('login.ts')).toEqual(['login.ts', 'auth.ts']);
    expect(impact.pathFrom('http.ts')).toEqual([]);
  });

  it('keeps one edge per dependant, forming a tree', () => {
    const impact = traceImpact(index, 'auth.ts');
    expect([...impact.edgeIds].sort()).toEqual([
      'import:app.ts->header.ts',
      'import:header.ts->auth.ts',
      'import:login.ts->auth.ts',
      'import:main.ts->app.ts',
    ]);
  });

  it('terminates on cycles and never lists the node itself', () => {
    const cyclic = createGraphIndex(
      graphOf([
        ['import', 'a.ts', 'b.ts'],
        ['import', 'b.ts', 'a.ts'],
      ]),
    );
    expect(traceImpact(cyclic, 'a.ts').waves).toEqual([['b.ts']]);
  });

  it('has no waves for a node nothing depends on', () => {
    expect(traceImpact(index, 'main.ts').waves).toEqual([]);
  });
});
