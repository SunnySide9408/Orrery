import {
  edgeId,
  SCHEMA_VERSION,
  type AnalysisResult,
  type EdgeKind,
  type NodeKind,
} from '@orrery/contracts';
import { computeFindings, createGraphIndex } from '@orrery/graph-core';
import { describeOverview } from '../overview/overview';
import { shopSample } from '../testing/shop-sample';
import { findingTitle, readFinding } from './finding-text';

/** A one-region result from `[kind, source, target]` edges, with findings computed as the analyser does. */
function resultOf(
  edges: [EdgeKind, string, string][],
  kinds: Record<string, NodeKind> = {},
): AnalysisResult {
  const ids = [...new Set(edges.flatMap(([, source, target]) => [source, target]))];
  const graph = {
    regions: [{ id: 'folder:src', label: 'src', kind: 'folder' as const, rootPath: 'src' }],
    nodes: ids.map((id) => ({
      id,
      path: id,
      name: id.replace(/\.ts$/, ''),
      kind: kinds[id] ?? 'service',
      regionId: 'folder:src',
      metrics: { linesOfCode: 1 },
    })),
    edges: edges.map(([kind, sourceId, targetId]) => ({
      id: edgeId(kind, sourceId, targetId),
      kind,
      sourceId,
      targetId,
      evidence: [{ path: sourceId, line: 1 }],
    })),
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: 'test' },
    ref: null,
    analyzerVersion: 'test',
    createdAt: '2026-10-24T00:00:00.000Z',
    graph,
    findings: computeFindings(graph),
    unresolved: [],
  };
}

describe('readFinding', () => {
  it('names the loop of a cycle and points at the step that points the wrong way', () => {
    const result = resultOf([
      ['import', 'a.ts', 'b.ts'],
      ['import', 'b.ts', 'a.ts'],
    ]);
    const index = createGraphIndex(result.graph);
    const [cycle] = result.findings;
    expect(findingTitle(cycle!, index)).toBe('Dependency cycle: a and b');
    const reading = readFinding(cycle!, result, index);
    expect(reading.facts[0]).toBe('The loop: a → b → a.');
    expect(reading.nextStep).toContain('points the wrong way');
    expect(reading.mapNodeId).toBe('a.ts');
  });

  it('mentions the injection error only when every step of the loop is an injection', () => {
    const injected = resultOf([
      ['inject', 'a.ts', 'b.ts'],
      ['inject', 'b.ts', 'a.ts'],
    ]);
    const index = createGraphIndex(injected.graph);
    expect(readFinding(injected.findings[0]!, injected, index).nextStep).toContain('NG0200');

    const mixed = resultOf([
      ['inject', 'a.ts', 'b.ts'],
      ['import', 'b.ts', 'a.ts'],
    ]);
    const mixedIndex = createGraphIndex(mixed.graph);
    expect(readFinding(mixed.findings[0]!, mixed, mixedIndex).nextStep).not.toContain('NG0200');
  });

  it('says who uses a widely used file, by kind, by area and by injection', () => {
    const { result, index } = shopSample();
    const finding = result.findings.find((f) => f.category === 'high-fan-in')!;
    const reading = readFinding(finding, result, index);
    expect(reading.title).toBe('AuthService is used directly by 10 files');
    expect(reading.facts.join(' ')).toMatch(/including 3 lazy-loaded routes: /);
    expect(reading.facts.join(' ')).toMatch(/of them inject it/);
    expect(reading.whyItMatters).toContain('normal for a core service');
  });

  it('describes what a file with many dependencies uses', () => {
    const edges = Array.from({ length: 10 }, (_, i): [EdgeKind, string, string] => [
      'import',
      'page.ts',
      `dep${i}.ts`,
    ]);
    const result = resultOf(edges, { 'page.ts': 'component' });
    const index = createGraphIndex(result.graph);
    const reading = readFinding(result.findings[0]!, result, index);
    expect(reading.title).toBe('page depends directly on 10 files');
    expect(reading.facts).toEqual(['It uses 10 services.']);
    expect(reading.nextStep).toContain('child component');
  });
});

describe('describeOverview', () => {
  it('counts what the analysis found, with specs apart and findings titled', () => {
    const { result, index } = shopSample();
    const overview = describeOverview(result, index);
    const specs = result.graph.nodes.filter((node) => node.kind === 'spec').length;
    expect(overview.specs).toBe(specs);
    expect(overview.files).toBe(result.graph.nodes.length - specs);
    expect(overview.lazyRoutes).toEqual(['catalog', 'checkout', 'account']);
    expect(overview.mostUsed[0]).toMatchObject({ node: { name: 'AuthService' }, users: 10 });
    expect(overview.findings.map((f) => f.title)).toEqual([
      'AuthService is used directly by 10 files',
    ]);
    expect(overview.provided.some(({ scope }) => scope === 'root')).toBe(true);
  });
});
