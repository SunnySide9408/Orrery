import type { AnalysisResult, GraphEdge, GraphNode, NodeKind, Region } from '@orrery/contracts';
import { SCHEMA_VERSION } from '@orrery/contracts';
import { hashString, seededRandom } from '../renderer/planet-look';
import type { SampleInfo } from './sample-catalog';

/**
 * The frame-rate test map at `/perf`: a made-up project the size of the
 * Phase 4 performance budget (500 files, 2,000 edges), generated in the
 * browser so nothing extra ships in the samples folder. It is not in the
 * sample catalog, so the app never links to it. The 3D view draws all its
 * edges at once, as the worst case.
 */
export const PERF_SAMPLE_INFO: SampleInfo = {
  id: 'perf',
  name: 'Frame-rate test (500 files, 2,000 edges)',
  description: 'A generated map at the performance budget, for measuring frame rate.',
  suggestedNode: 'CoreStoreService',
};

export const PERF_NODES = 500;
export const PERF_EDGES = 2000;
const REGIONS = 12;
/** One file in six is a spec, drawn as a moon of the file it tests. */
const SPEC_SHARE = 6;

const KINDS: readonly { kind: NodeKind; suffix: string; weight: number }[] = [
  { kind: 'component', suffix: 'Component', weight: 10 },
  { kind: 'service', suffix: 'Service', weight: 5 },
  { kind: 'directive', suffix: 'Directive', weight: 2 },
  { kind: 'pipe', suffix: 'Pipe', weight: 2 },
  { kind: 'guard', suffix: 'Guard', weight: 1 },
  { kind: 'interceptor', suffix: 'Interceptor', weight: 1 },
  { kind: 'resolver', suffix: 'Resolver', weight: 1 },
  { kind: 'other', suffix: 'Util', weight: 2 },
];
const WORDS = [
  'Order',
  'Cart',
  'Invoice',
  'Profile',
  'Search',
  'Report',
  'Billing',
  'Catalog',
  'Review',
  'Shipping',
  'Account',
  'Audit',
  'Chart',
  'Inbox',
  'Payment',
  'Settings',
];

/** Same output every time: the layout and the measured frame rate stay comparable. */
export function createPerfSample(): AnalysisResult {
  const random = seededRandom(hashString('orrery-perf'));
  const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)]!;
  const totalWeight = KINDS.reduce((sum, kind) => sum + kind.weight, 0);
  const pickKind = () => {
    let roll = random() * totalWeight;
    for (const kind of KINDS) if ((roll -= kind.weight) < 0) return kind;
    return KINDS[0]!;
  };

  const regions: Region[] = [
    { id: 'folder:src/app', label: 'app', kind: 'folder', rootPath: 'src/app' },
  ];
  for (let i = 1; i < REGIONS; i++) {
    const name = `${WORDS[i % WORDS.length]!.toLowerCase()}-${i}`;
    regions.push({
      id: `lazy-route:src/app/${name}`,
      label: name,
      kind: 'lazy-route',
      rootPath: `src/app/${name}`,
      parentId: 'folder:src/app',
    });
  }

  const nodes: GraphNode[] = [];
  const planets: GraphNode[] = [];
  // The hub every region leans on, so `/perf` has an obvious node to click.
  const hub: GraphNode = {
    id: 'src/app/core/core-store.service.ts',
    path: 'src/app/core/core-store.service.ts',
    name: 'CoreStoreService',
    kind: 'service',
    regionId: regions[0]!.id,
    metrics: { linesOfCode: 240 },
  };
  nodes.push(hub);
  planets.push(hub);
  while (nodes.length < PERF_NODES) {
    const n = nodes.length;
    const region = regions[n % REGIONS]!;
    if (n % SPEC_SHARE === 0 && planets.length > 1) {
      const owner = planets[planets.length - 1]!;
      const path = owner.path.replace(/\.ts$/, '.spec.ts');
      nodes.push({
        id: path,
        path,
        name: `${owner.name} spec`,
        kind: 'spec',
        regionId: owner.regionId,
        ownerId: owner.id,
        metrics: { linesOfCode: 20 + Math.floor(random() * 120) },
      });
      continue;
    }
    const kind = pickKind();
    const name = `${pick(WORDS)}${pick(WORDS)}${n}${kind.suffix}`;
    const path = `${region.rootPath}/${name.toLowerCase()}.ts`;
    const node: GraphNode = {
      id: path,
      path,
      name,
      kind: kind.kind,
      regionId: region.id,
      // Skewed sizes, like a real project: many small files, a few big ones.
      metrics: { linesOfCode: Math.floor(10 + 400 * random() ** 3) },
    };
    nodes.push(node);
    planets.push(node);
  }

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const addEdge = (source: GraphNode, target: GraphNode, kind: GraphEdge['kind']) => {
    const id = `${kind}:${source.id}->${target.id}`;
    if (source.id === target.id || seen.has(id)) return;
    seen.add(id);
    edges.push({
      id,
      sourceId: source.id,
      targetId: target.id,
      kind,
      evidence: [{ path: source.path, line: 1 + Math.floor(random() * 40) }],
    });
  };
  for (const node of nodes)
    if (node.ownerId)
      addEdge(
        node,
        nodes.find((o) => o.id === node.ownerId)!,
        'import',
      );
  while (edges.length < PERF_EDGES) {
    const source = pick(planets);
    // Most imports stay in the region; one in four crosses to another, a few hit the hub.
    const roll = random();
    const target =
      roll < 0.05
        ? hub
        : roll < 0.3
          ? pick(planets)
          : pick(planets.filter((p) => p.regionId === source.regionId));
    addEdge(source, target, target.kind === 'service' && random() < 0.5 ? 'inject' : 'import');
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: PERF_SAMPLE_INFO.name },
    ref: null,
    analyzerVersion: 'perf-sample',
    createdAt: '2026-10-23T00:00:00.000Z',
    graph: { nodes, edges, regions },
    findings: [],
    unresolved: [],
  };
}
