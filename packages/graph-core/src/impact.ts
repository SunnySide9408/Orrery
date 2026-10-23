import type { GraphIndex } from './graph-index';

/** What a change to one node can reach through the files that depend on it. */
export interface Impact {
  nodeId: string;
  /**
   * Transitive dependants by graph distance: `waves[0]` depend on the node
   * directly, `waves[1]` depend on those, and so on. Each wave is sorted by ID.
   */
  waves: readonly (readonly string[])[];
  /** Distance from the node per dependant; 1 means direct. */
  distance: ReadonlyMap<string, number>;
  /** One edge per dependant: the edge on its shortest path. Together they form a tree. */
  edgeIds: ReadonlySet<string>;
  /**
   * A shortest path from a dependant to the node, dependant first, so each
   * step reads "depends on". Empty for nodes that are not dependants.
   */
  pathFrom(id: string): readonly string[];
}

/**
 * Breadth-first search over incoming edges. Breadth-first gives the shortest
 * path to every dependant, and the graph-distance waves for free; visiting
 * each wave in ID order makes the chosen paths the same on every run.
 */
export function traceImpact(index: GraphIndex, nodeId: string): Impact {
  /** For each dependant, the next node on its way to `nodeId`. */
  const next = new Map<string, string>();
  const distance = new Map<string, number>();
  const edgeIds = new Set<string>();
  const waves: string[][] = [];
  const seen = new Set([nodeId]);

  for (let frontier = [nodeId]; frontier.length > 0;) {
    const wave: string[] = [];
    for (const target of frontier) {
      const incoming = [...index.incoming(target)].sort((a, b) => compare(a.id, b.id));
      for (const edge of incoming) {
        if (seen.has(edge.sourceId)) continue;
        seen.add(edge.sourceId);
        next.set(edge.sourceId, target);
        distance.set(edge.sourceId, waves.length + 1);
        edgeIds.add(edge.id);
        wave.push(edge.sourceId);
      }
    }
    if (wave.length === 0) break;
    wave.sort(compare);
    waves.push(wave);
    frontier = wave;
  }

  return {
    nodeId,
    waves,
    distance,
    edgeIds,
    pathFrom(id) {
      if (!next.has(id)) return [];
      const path = [id];
      for (let step = next.get(id); step !== undefined; step = next.get(step)) path.push(step);
      return path;
    },
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
