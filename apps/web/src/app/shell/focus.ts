import type { AnalysisResult, GraphNode, Region } from '@orrery/contracts';
import type { GraphIndex } from '@orrery/graph-core';

/** Everything the inspector and the scene need to show one selected node. */
export interface Focus {
  node: GraphNode;
  region: Region | undefined;
  dependants: readonly GraphNode[];
  dependencies: readonly GraphNode[];
  /** Lazy-route regions that contain at least one direct dependant. */
  dependantLazyRoutes: readonly Region[];
  /** Nodes to brighten: the node, its direct neighbours and its moons. */
  litNodeIds: ReadonlySet<string>;
  /** Edges to draw: every edge into or out of the node. */
  edgeIds: ReadonlySet<string>;
}

export function describeFocus(
  result: AnalysisResult,
  index: GraphIndex,
  nodeId: string,
): Focus | null {
  const node = index.node(nodeId);
  if (!node) return null;

  const regions = new Map(result.graph.regions.map((region) => [region.id, region]));
  const nodesOf = (ids: readonly string[]) =>
    ids
      .map((id) => index.node(id))
      .filter((n): n is GraphNode => n !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  const dependants = nodesOf(index.dependantsOf(nodeId));
  const dependencies = nodesOf(index.dependenciesOf(nodeId));
  const moons = result.graph.nodes.filter((n) => n.ownerId === nodeId);

  const lazyRouteIds = new Set(
    dependants
      .map((dependant) => regions.get(dependant.regionId))
      .filter((region) => region?.kind === 'lazy-route')
      .map((region) => region!.id),
  );

  return {
    node,
    region: regions.get(node.regionId),
    dependants,
    dependencies,
    dependantLazyRoutes: [...lazyRouteIds].sort().map((id) => regions.get(id)!),
    litNodeIds: new Set([nodeId, ...[...dependants, ...dependencies, ...moons].map((n) => n.id)]),
    edgeIds: new Set([...index.incoming(nodeId), ...index.outgoing(nodeId)].map((e) => e.id)),
  };
}
