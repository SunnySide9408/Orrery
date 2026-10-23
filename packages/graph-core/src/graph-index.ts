import type { DependencyGraph, GraphEdge, GraphNode } from '@orrery/contracts';

/**
 * Adjacency lookups over a dependency graph, built once per graph.
 *
 * Direction follows the contract: an edge's source depends on its target.
 * So a node's dependencies are the targets of its outgoing edges, and its
 * dependants are the sources of its incoming edges.
 */
export interface GraphIndex {
  readonly graph: DependencyGraph;
  node(id: string): GraphNode | undefined;
  /** Edges where `id` is the source: what it depends on. */
  outgoing(id: string): readonly GraphEdge[];
  /** Edges where `id` is the target: what depends on it. */
  incoming(id: string): readonly GraphEdge[];
  /** Distinct nodes `id` depends on directly, sorted by ID. */
  dependenciesOf(id: string): readonly string[];
  /** Distinct nodes that depend on `id` directly, sorted by ID. */
  dependantsOf(id: string): readonly string[];
}

export function createGraphIndex(graph: DependencyGraph): GraphIndex {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();

  for (const edge of graph.edges) {
    push(outgoing, edge.sourceId, edge);
    push(incoming, edge.targetId, edge);
  }

  const distinct = (edges: readonly GraphEdge[], end: 'sourceId' | 'targetId') =>
    [...new Set(edges.map((edge) => edge[end]))].sort();

  return {
    graph,
    node: (id) => nodes.get(id),
    outgoing: (id) => outgoing.get(id) ?? [],
    incoming: (id) => incoming.get(id) ?? [],
    dependenciesOf: (id) => distinct(outgoing.get(id) ?? [], 'targetId'),
    dependantsOf: (id) => distinct(incoming.get(id) ?? [], 'sourceId'),
  };
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) {
    list.push(value);
  } else {
    map.set(key, [value]);
  }
}
