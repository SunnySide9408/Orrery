import type { AnalysisResult, Finding, GraphNode, Region } from '@orrery/contracts';
import { traceImpact, type GraphIndex, type Impact } from '@orrery/graph-core';

/** One transitive dependant, with the chain of files that links it to the selection. */
export interface ImpactEntry {
  node: GraphNode;
  /** The dependant first, the selected node last; each step reads "depends on". */
  path: readonly GraphNode[];
}

/** Everything the inspector and the scene need to show one selected node. */
export interface Focus {
  node: GraphNode;
  region: Region | undefined;
  dependants: readonly GraphNode[];
  dependencies: readonly GraphNode[];
  /** Direct dependencies and dependants linked by an `inject` edge, by ID. */
  injected: ReadonlySet<string>;
  /** Lazy-route regions that contain at least one direct dependant. */
  dependantLazyRoutes: readonly Region[];
  /** Transitive dependants by graph distance: `impactWaves[0]` are the direct ones. */
  impactWaves: readonly (readonly ImpactEntry[])[];
  impactCount: number;
  /** Findings that name this node. */
  findings: readonly Finding[];
  /** Whether the scene shows the full impact (`true`) or direct neighbours only. */
  showImpact: boolean;
  /** Nodes to brighten: direct neighbours and moons, or the whole impact. */
  litNodeIds: ReadonlySet<string>;
  /** Edges to draw: every edge into or out of the node, or the impact tree. */
  edgeIds: ReadonlySet<string>;
  /** In impact mode, the graph distance of each lit node, so the scene can reveal them in waves. */
  waves: ReadonlyMap<string, number> | null;
}

export function describeFocus(
  result: AnalysisResult,
  index: GraphIndex,
  nodeId: string,
  showImpact = false,
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
  const injected = new Set(
    [
      ...index.incoming(nodeId).map((e) => (e.kind === 'inject' ? e.sourceId : null)),
      ...index.outgoing(nodeId).map((e) => (e.kind === 'inject' ? e.targetId : null)),
    ].filter((id): id is string => id !== null),
  );

  const lazyRouteIds = new Set(
    dependants
      .map((dependant) => regions.get(dependant.regionId))
      .filter((region) => region?.kind === 'lazy-route')
      .map((region) => region!.id),
  );

  const impact = traceImpact(index, nodeId);
  const direct = {
    lit: new Set([nodeId, ...[...dependants, ...dependencies, ...moons].map((n) => n.id)]),
    edges: new Set([...index.incoming(nodeId), ...index.outgoing(nodeId)].map((e) => e.id)),
  };

  return {
    node,
    region: regions.get(node.regionId),
    dependants,
    dependencies,
    injected,
    dependantLazyRoutes: [...lazyRouteIds].sort().map((id) => regions.get(id)!),
    impactWaves: impactWaves(index, impact),
    impactCount: impact.distance.size,
    findings: result.findings.filter((finding) => finding.nodeIds.includes(nodeId)),
    showImpact,
    litNodeIds: showImpact
      ? new Set([nodeId, ...moons.map((n) => n.id), ...impact.distance.keys()])
      : direct.lit,
    edgeIds: showImpact ? impact.edgeIds : direct.edges,
    waves: showImpact ? new Map([[nodeId, 0], ...impact.distance]) : null,
  };
}

function impactWaves(index: GraphIndex, impact: Impact): ImpactEntry[][] {
  return impact.waves.map((wave) =>
    wave
      .map((id) => ({
        node: index.node(id)!,
        path: impact.pathFrom(id).map((step) => index.node(step)!),
      }))
      .sort((a, b) => a.node.name.localeCompare(b.node.name)),
  );
}
