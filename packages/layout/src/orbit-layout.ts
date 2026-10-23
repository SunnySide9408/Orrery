import type {
  DependencyGraph,
  GraphNode,
  Layout,
  NodeKind,
  NodePosition,
  Region,
  RegionPosition,
} from '@orrery/contracts';

/** Bump when the algorithm changes, so cached positions are not mixed with new ones. */
export const ORBIT_LAYOUT_VERSION = 'orbit-2';

/** Distance between planet orbits inside a region. */
const ORBIT_GAP = 3;
/** Free space between neighbouring regions. */
const REGION_GAP = 6;
/** Distance from a planet to its moons. */
const MOON_DISTANCE = 1.1;

/** Inner orbits hold the kinds a reader looks for first. */
const KIND_ORDER: readonly NodeKind[] = [
  'route-config',
  'service',
  'component',
  'directive',
  'pipe',
  'guard',
  'resolver',
  'interceptor',
  'module',
  'other',
  'spec',
];

/**
 * Deterministic "solar system" layout.
 *
 * Root regions sit at the centre; child regions (lazy features, folders) are
 * spaced evenly on a ring around their parent. Inside a region, planets fill
 * concentric orbits in a fixed order (by kind, then ID), and moons (nodes with
 * an `ownerId`) sit next to the planet they belong to.
 *
 * Everything is derived from sorted IDs and counts, with no randomness, so the
 * same graph always gives the same positions.
 */
export function orbitLayout(graph: DependencyGraph): Layout {
  const nodesByRegion = groupBy(graph.nodes, (node) => node.regionId);
  const childrenOf = groupBy(graph.regions, (region) => region.parentId ?? '');
  const local = new Map<string, LocalSystem>(
    graph.regions.map((region) => [region.id, localSystem(nodesByRegion.get(region.id) ?? [])]),
  );

  const childrenByRegion = new Map(
    graph.regions.map((region) => [region.id, sortById(childrenOf.get(region.id) ?? [])]),
  );

  /**
   * How far a region and everything placed around it reach from its centre.
   * Rings are sized by this, not by the region's own radius, so a child that
   * has children of its own keeps its whole family clear of its neighbours.
   */
  const extents = new Map<string, { ring: number; extent: number }>();
  const measure = (region: Region): { ring: number; extent: number } => {
    const known = extents.get(region.id);
    if (known) return known;
    const own = local.get(region.id)!.radius;
    const childExtents = childrenByRegion.get(region.id)!.map((child) => measure(child).extent);
    const ring = ringRadius(own, childExtents);
    const result = {
      ring,
      extent: childExtents.length === 0 ? own : Math.max(own, ring + Math.max(...childExtents)),
    };
    extents.set(region.id, result);
    return result;
  };

  const regionPositions: RegionPosition[] = [];
  const nodePositions: NodePosition[] = [];

  const place = (region: Region, x: number, z: number): void => {
    const system = local.get(region.id)!;
    regionPositions.push({ regionId: region.id, x, y: 0, z, radius: system.radius });
    for (const position of system.nodes) {
      nodePositions.push({ ...position, x: position.x + x, z: position.z + z });
    }
    const children = childrenByRegion.get(region.id)!;
    const { ring } = measure(region);
    children.forEach((child, index) => {
      const angle = (index / children.length) * Math.PI * 2;
      place(child, x + Math.cos(angle) * ring, z + Math.sin(angle) * ring);
    });
  };

  const regionIds = new Set(graph.regions.map((region) => region.id));
  const roots = sortById(
    graph.regions.filter((region) => !region.parentId || !regionIds.has(region.parentId)),
  );
  const rootRing = ringRadius(
    0,
    roots.map((root) => measure(root).extent),
  );
  roots.forEach((root, index) => {
    const angle = (index / roots.length) * Math.PI * 2;
    const distance = roots.length === 1 ? 0 : rootRing;
    place(root, Math.cos(angle) * distance, Math.sin(angle) * distance);
  });

  return { layoutVersion: ORBIT_LAYOUT_VERSION, regions: regionPositions, nodes: nodePositions };
}

interface LocalSystem {
  radius: number;
  /** Positions relative to the region centre. */
  nodes: NodePosition[];
}

function localSystem(nodes: readonly GraphNode[]): LocalSystem {
  const planets = nodes
    .filter((node) => node.ownerId === undefined)
    .sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || compare(a.id, b.id));
  const moonsOf = groupBy(
    nodes.filter((node) => node.ownerId !== undefined),
    (node) => node.ownerId!,
  );

  const positions: NodePosition[] = [];
  const planetAt = new Map<string, NodePosition>();
  let orbit = 0;
  let index = 0;
  for (const planet of planets) {
    // Orbit k (from 1) holds 6k planets, so spacing along each orbit stays similar.
    const capacity = 6 * (orbit + 1);
    const angle = (index / capacity) * Math.PI * 2 + orbit * 0.5;
    const distance = ORBIT_GAP * (orbit + 1);
    const position = {
      nodeId: planet.id,
      regionId: planet.regionId,
      x: Math.cos(angle) * distance,
      y: ((index % 3) - 1) * 0.4,
      z: Math.sin(angle) * distance,
    };
    positions.push(position);
    planetAt.set(planet.id, position);
    index += 1;
    if (index === capacity) {
      orbit += 1;
      index = 0;
    }
  }

  for (const [ownerId, moons] of moonsOf) {
    const owner = planetAt.get(ownerId);
    sortById(moons).forEach((moon, moonIndex) => {
      const angle = (moonIndex / moons.length) * Math.PI * 2 + Math.PI / 4;
      positions.push({
        nodeId: moon.id,
        regionId: moon.regionId,
        // A moon whose owner lives in another region falls back to the region centre.
        x: (owner?.x ?? 0) + Math.cos(angle) * MOON_DISTANCE,
        y: (owner?.y ?? 0) + 0.3,
        z: (owner?.z ?? 0) + Math.sin(angle) * MOON_DISTANCE,
      });
    });
  }

  const usedOrbits = orbit + (index > 0 ? 1 : 0);
  return { radius: ORBIT_GAP * (usedOrbits + 1), nodes: positions };
}

/** Smallest ring around a centre of radius `inner` that fits `radii` side by side. */
function ringRadius(inner: number, radii: readonly number[]): number {
  if (radii.length === 0) return 0;
  const largest = Math.max(...radii);
  const clearCentre = inner + largest + REGION_GAP;
  if (radii.length === 1) return clearCentre;
  const clearNeighbours = (largest * 2 + REGION_GAP) / (2 * Math.sin(Math.PI / radii.length));
  return Math.max(clearCentre, clearNeighbours);
}

function kindRank(kind: NodeKind): number {
  return KIND_ORDER.indexOf(kind);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compare(a.id, b.id));
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) {
      group.push(item);
    } else {
      groups.set(key(item), [item]);
    }
  }
  return groups;
}
