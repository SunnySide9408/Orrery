import type { EdgeKind } from '@orrery/contracts';
import { describe, expect, it } from 'vitest';
import { computeFindings } from './findings';
import { graphOf } from './testing';

const usedBy = (target: string, count: number, kind: EdgeKind = 'import') =>
  Array.from({ length: count }, (_, i): [EdgeKind, string, string] => [kind, `u${i}.ts`, target]);

describe('computeFindings', () => {
  it('reports a cycle with its rule, limits and a loop as evidence', () => {
    const [cycle] = computeFindings(
      graphOf([
        ['import', 'a.ts', 'b.ts'],
        ['import', 'b.ts', 'a.ts'],
      ]),
    );
    expect(cycle).toMatchObject({
      id: 'cycle:a.ts|b.ts',
      category: 'cycle',
      severity: 'warning',
      nodeIds: ['a.ts', 'b.ts'],
      threshold: null,
      evidencePaths: [['a.ts', 'b.ts', 'a.ts']],
    });
    expect(cycle!.explanation).toContain('a → b → a');
    expect(cycle!.explanation).toContain('potentially affects');
    expect(cycle!.limits).toContain('Type-only imports');
  });

  it('flags high fan-in at the minimum, with each dependant as evidence', () => {
    const findings = computeFindings(graphOf(usedBy('auth.ts', 10)));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      category: 'high-fan-in',
      nodeIds: ['auth.ts'],
      threshold: 10,
    });
    expect(findings[0]!.evidencePaths).toHaveLength(10);
    expect(findings[0]!.evidencePaths[0]).toEqual(['u0.ts', 'auth.ts']);
    expect(findings[0]!.explanation).toBe(
      'auth is used directly by 10 files. A change here potentially affects all of them, according to static relationships.',
    );
    expect(findings[0]!.rule).toContain('95th percentile');
  });

  it('stays quiet below the minimum', () => {
    expect(computeFindings(graphOf(usedBy('auth.ts', 9)))).toEqual([]);
  });

  it('flags high fan-out', () => {
    const edges = Array.from({ length: 12 }, (_, i): [EdgeKind, string, string] => [
      'import',
      'app.ts',
      `d${i}.ts`,
    ]);
    const [finding] = computeFindings(graphOf(edges));
    // In a project this small the 95th percentile is the largest count itself.
    expect(finding).toMatchObject({ category: 'high-fan-out', nodeIds: ['app.ts'], threshold: 12 });
    expect(finding!.evidencePaths).toHaveLength(12);
  });

  it('leaves specs out of counts and cycles', () => {
    const specs = Array.from({ length: 10 }, (_, i): [EdgeKind, string, string] => [
      'import',
      `s${i}.spec.ts`,
      'auth.ts',
    ]);
    const kinds = Object.fromEntries(specs.map(([, source]) => [source, 'spec' as const]));
    const graph = graphOf(
      [...specs, ['import', 'auth.ts', 's0.spec.ts'], ...usedBy('auth.ts', 3)],
      kinds,
    );
    expect(computeFindings(graph)).toEqual([]);
  });

  it('honours custom rules and sorts cycles first, then the highest counts', () => {
    const graph = graphOf([
      ...usedBy('big.ts', 6),
      ['import', 'u0.ts', 'small.ts'],
      ['import', 'u1.ts', 'small.ts'],
      ['import', 'u2.ts', 'small.ts'],
      ['import', 'x.ts', 'y.ts'],
      ['import', 'y.ts', 'x.ts'],
    ]);
    const rules = {
      fanIn: { percentile: 50, minimum: 2 },
      fanOut: { percentile: 95, minimum: 10 },
    };
    const ids = computeFindings(graph, rules).map((f) => f.id);
    expect(ids).toEqual(['cycle:x.ts|y.ts', 'high-fan-in:big.ts', 'high-fan-in:small.ts']);
  });
});
