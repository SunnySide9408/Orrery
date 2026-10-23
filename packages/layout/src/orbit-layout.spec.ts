import type { DependencyGraph } from '@orrery/contracts';
import { shopFixture } from '@orrery/fixture-shop';
import { describe, expect, it } from 'vitest';
import { orbitLayout } from './orbit-layout';

const graph = shopFixture.graph;

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('orbitLayout', () => {
  const layout = orbitLayout(graph);
  const regionAt = new Map(layout.regions.map((region) => [region.regionId, region]));

  it('positions every node and every region exactly once', () => {
    expect(layout.nodes.map((n) => n.nodeId).sort()).toEqual(graph.nodes.map((n) => n.id).sort());
    expect(layout.regions).toHaveLength(graph.regions.length);
  });

  it('is deterministic, whatever the input order', () => {
    const shuffled: DependencyGraph = {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      regions: [...graph.regions].reverse(),
    };
    const sortByNode = (l: typeof layout) =>
      [...l.nodes].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
    expect(sortByNode(orbitLayout(shuffled))).toEqual(sortByNode(layout));
  });

  it('keeps each node inside its region', () => {
    for (const node of layout.nodes) {
      const region = regionAt.get(node.regionId)!;
      expect(distance(node, region)).toBeLessThan(region.radius);
    }
  });

  it('keeps child regions from overlapping each other or their parent', () => {
    const regions = layout.regions;
    for (let i = 0; i < regions.length; i++) {
      for (let j = i + 1; j < regions.length; j++) {
        const [a, b] = [regions[i], regions[j]];
        expect(distance(a, b), `${a.regionId} / ${b.regionId}`).toBeGreaterThan(
          a.radius + b.radius,
        );
      }
    }
  });

  it("keeps nested regions clear of their parent's other children", () => {
    // app → core, features, shared; features → settings (lazy).
    // A big lazy child of `features` used to land on top of `core`.
    const regions = [
      { id: 'folder:src/app', label: 'app', kind: 'folder' as const, rootPath: 'src/app' },
      ...['core', 'features', 'shared'].map((name) => ({
        id: `folder:src/app/${name}`,
        label: name,
        kind: 'folder' as const,
        rootPath: `src/app/${name}`,
        parentId: 'folder:src/app',
      })),
      ...['settings'].map((name) => ({
        id: `lazy-route:src/app/features/${name}`,
        label: name,
        kind: 'lazy-route' as const,
        rootPath: `src/app/features/${name}`,
        parentId: 'folder:src/app/features',
      })),
    ];
    const sizes: Record<string, number> = { settings: 60, core: 40 };
    const nodes = regions.flatMap((region) =>
      Array.from({ length: sizes[region.label] ?? 10 }, (_, i) => ({
        id: `${region.rootPath}/f${i}.ts`,
        path: `${region.rootPath}/f${i}.ts`,
        name: `f${i}`,
        kind: 'other' as const,
        regionId: region.id,
        metrics: { linesOfCode: 1 },
      })),
    );
    const nested = orbitLayout({ nodes, edges: [], regions });
    const all = nested.regions;
    const parentOf = new Map(regions.map((r) => [r.id, 'parentId' in r ? r.parentId : undefined]));
    const isAncestor = (a: string, b: string) => {
      for (let p = parentOf.get(b); p; p = parentOf.get(p)) if (p === a) return true;
      return false;
    };
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const [a, b] = [all[i]!, all[j]!];
        if (isAncestor(a.regionId, b.regionId) || isAncestor(b.regionId, a.regionId)) continue;
        expect(distance(a, b), `${a.regionId} / ${b.regionId}`).toBeGreaterThan(
          a.radius + b.radius,
        );
      }
    }
  });
});
