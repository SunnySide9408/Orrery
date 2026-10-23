import type { GraphIndex } from './graph-index';

/** Distinct direct neighbours of a node, counting only included nodes. */
export interface Degree {
  /** Files that depend on it directly. */
  fanIn: number;
  /** Files it depends on directly. */
  fanOut: number;
}

export function degrees(
  index: GraphIndex,
  include: (nodeId: string) => boolean = () => true,
): Map<string, Degree> {
  const result = new Map<string, Degree>();
  for (const node of index.graph.nodes) {
    if (!include(node.id)) continue;
    result.set(node.id, {
      fanIn: index.dependantsOf(node.id).filter(include).length,
      fanOut: index.dependenciesOf(node.id).filter(include).length,
    });
  }
  return result;
}

/**
 * When a count is high enough to flag: at or above the given percentile of
 * the project's own counts, and never below a fixed minimum. The percentile lets
 * the rule scale with the project; the minimum keeps small projects, where
 * the 95th percentile may be 3, free of noise.
 */
export interface ThresholdRule {
  /** 0–100. */
  percentile: number;
  /** The smallest count that can ever be flagged. */
  minimum: number;
}

/** Nearest-rank percentile: the smallest value with at least `p`% of values at or below it. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1]!;
}

/**
 * The smallest count that the rule flags for these values. "At or above"
 * rather than "above": in a project of fewer than 20 files the 95th
 * percentile is the largest count, and "above" could then never flag anything.
 */
export function flagThreshold(values: readonly number[], rule: ThresholdRule): number {
  return Math.max(percentile(values, rule.percentile), rule.minimum);
}
