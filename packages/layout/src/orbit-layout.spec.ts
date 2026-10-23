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
});
