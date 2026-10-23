import { edgeId, type DependencyGraph, type EdgeKind, type NodeKind } from '@orrery/contracts';

/** A small graph from edges written as `[kind, source, target]`; every node is in one region. */
export function graphOf(
  edges: readonly [EdgeKind, string, string][],
  kinds: Readonly<Record<string, NodeKind>> = {},
): DependencyGraph {
  const ids = [...new Set(edges.flatMap(([, source, target]) => [source, target]))];
  return {
    regions: [{ id: 'folder:src', label: 'src', kind: 'folder', rootPath: 'src' }],
    nodes: ids.map((id) => ({
      id,
      path: id,
      name: id.replace(/\.ts$/, ''),
      kind: kinds[id] ?? 'other',
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
