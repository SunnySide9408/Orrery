import { edgeId, type DependencyGraph, type EdgeKind } from '@orrery/contracts';
import { describe, expect, it } from 'vitest';
import { createGraphIndex } from './graph-index';

function graphOf(...edges: [EdgeKind, string, string][]): DependencyGraph {
  const ids = [...new Set(edges.flatMap(([, source, target]) => [source, target]))];
  return {
    regions: [{ id: 'folder:src', label: 'src', kind: 'folder', rootPath: 'src' }],
    nodes: ids.map((id) => ({
      id,
      path: id,
      name: id,
      kind: 'other',
      regionId: 'folder:src',
      metrics: { linesOfCode: 1 },
    })),
    edges: edges.map(([kind, sourceId, targetId]) => ({
      id: edgeId(kind, sourceId, targetId),
      kind,
      sourceId,
      targetId,
      evidence: [{ path: sourceId, line: 1 }],
    })),
  };
}

describe('createGraphIndex', () => {
  const index = createGraphIndex(
    graphOf(
      ['import', 'page.ts', 'auth.ts'],
      ['standalone-import', 'page.ts', 'auth.ts'],
      ['import', 'guard.ts', 'auth.ts'],
      ['import', 'auth.ts', 'api.ts'],
    ),
  );

  it('lists direct dependants as the sources of incoming edges', () => {
    expect(index.dependantsOf('auth.ts')).toEqual(['guard.ts', 'page.ts']);
  });

  it('lists direct dependencies as the targets of outgoing edges', () => {
    expect(index.dependenciesOf('auth.ts')).toEqual(['api.ts']);
  });

  it('counts a node once even when several edge kinds connect it', () => {
    expect(index.incoming('auth.ts')).toHaveLength(3);
    expect(index.dependantsOf('auth.ts')).toHaveLength(2);
  });

  it('returns empty lists for unknown or isolated nodes', () => {
    expect(index.dependantsOf('missing.ts')).toEqual([]);
    expect(index.outgoing('api.ts')).toEqual([]);
    expect(index.node('missing.ts')).toBeUndefined();
  });
});
