import { parseAnalysisResult } from '@orrery/contracts';
import { describe, expect, it } from 'vitest';
import { shopFixture } from './shop.fixture';

const { graph } = shopFixture;
const regionOf = new Map(graph.nodes.map((node) => [node.id, node.regionId]));

describe('shop fixture', () => {
  it('follows the analysis-result contract', () => {
    expect(() => parseAnalysisResult(JSON.parse(JSON.stringify(shopFixture)))).not.toThrow();
  });

  it('is about 40 nodes with three lazy features', () => {
    expect(graph.nodes).toHaveLength(40);
    expect(graph.regions.filter((region) => region.kind === 'lazy-route')).toHaveLength(3);
  });

  it('gives every lazy feature a route config reached by a lazy-route edge', () => {
    const lazyTargets = graph.edges
      .filter((edge) => edge.kind === 'lazy-route')
      .map((edge) => regionOf.get(edge.targetId));
    const lazyRegions = graph.regions
      .filter((region) => region.kind === 'lazy-route')
      .map((region) => region.id);
    expect(lazyTargets.sort()).toEqual(lazyRegions.sort());
  });

  it('has AuthService used directly from all three lazy features', () => {
    const auth = graph.nodes.find((node) => node.name === 'AuthService');
    const dependantRegions = new Set(
      graph.edges
        .filter((edge) => edge.targetId === auth?.id)
        .map((edge) => regionOf.get(edge.sourceId)),
    );
    for (const region of graph.regions.filter((r) => r.kind === 'lazy-route')) {
      expect(dependantRegions).toContain(region.id);
    }
  });

  it('attaches every spec to the node it tests', () => {
    for (const spec of graph.nodes.filter((node) => node.kind === 'spec')) {
      expect(spec.ownerId, spec.id).toBeDefined();
    }
  });
});
