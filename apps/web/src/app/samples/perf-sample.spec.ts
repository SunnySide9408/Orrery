import { parseAnalysisResult } from '@orrery/contracts';
import { describe, expect, it } from 'vitest';
import { prepareSample } from './loaded-sample';
import { createPerfSample, PERF_EDGES, PERF_NODES, PERF_SAMPLE_INFO } from './perf-sample';

describe('frame-rate test map', () => {
  it('is a valid analysis at the performance budget', () => {
    const result = parseAnalysisResult(createPerfSample());
    expect(result.graph.nodes).toHaveLength(PERF_NODES);
    expect(result.graph.edges).toHaveLength(PERF_EDGES);
    expect(new Set(result.graph.edges.map((edge) => edge.id)).size).toBe(PERF_EDGES);
    expect(result.graph.nodes.some((node) => node.ownerId !== undefined)).toBe(true);
  });

  it('is the same on every load, so measurements compare', () => {
    expect(createPerfSample()).toEqual(createPerfSample());
  });

  it('lays out every node', () => {
    const sample = prepareSample(PERF_SAMPLE_INFO, createPerfSample());
    expect(sample.layout.nodes).toHaveLength(PERF_NODES);
  });
});
