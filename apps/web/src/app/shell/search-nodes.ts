import type { GraphNode, Region } from '@orrery/contracts';
import { KIND_STYLES } from '../renderer/kind-style';

export interface SearchHit {
  node: GraphNode;
  /** Region label, shown next to the name so two nodes with one name can be told apart. */
  regionLabel: string;
}

/**
 * Finds files, components, services and routes by name, path, kind or region.
 * Every word of the query must match somewhere; hits whose name starts with
 * the query come first, then name matches, then the rest, each by name.
 * Specs are left out: they are reached through the file they test.
 */
export function searchNodes(
  nodes: readonly GraphNode[],
  regions: readonly Region[],
  query: string,
  limit = 8,
): SearchHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const regionLabels = new Map(regions.map((region) => [region.id, region.label]));
  const first = words[0]!;

  return nodes
    .filter((node) => node.kind !== 'spec')
    .map((node) => {
      const regionLabel = regionLabels.get(node.regionId) ?? '';
      const name = node.name.toLowerCase();
      const haystack = `${name} ${node.path.toLowerCase()} ${KIND_STYLES[node.kind].label.toLowerCase()} ${regionLabel.toLowerCase()}`;
      if (!words.every((word) => haystack.includes(word))) return null;
      const rank = name.startsWith(first) ? 0 : name.includes(first) ? 1 : 2;
      return { hit: { node, regionLabel }, rank };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => a.rank - b.rank || a.hit.node.name.localeCompare(b.hit.node.name))
    .slice(0, limit)
    .map((entry) => entry.hit);
}
