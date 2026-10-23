import { describe, expect, it } from 'vitest';
import { edgeId, regionId } from './ids';
import type { AnalysisResult } from './schema';
import { AnalysisResultError, findGraphIntegrityIssues, parseAnalysisResult } from './validate';

const appRegion = regionId('folder', 'src/app');

function validResult(): AnalysisResult {
  return {
    schemaVersion: 1,
    project: { name: 'demo' },
    ref: null,
    analyzerVersion: '0.0.0',
    createdAt: '2026-10-23T12:00:00Z',
    graph: {
      regions: [{ id: appRegion, label: 'app', kind: 'folder', rootPath: 'src/app' }],
      nodes: [
        {
          id: 'src/app/app.ts',
          path: 'src/app/app.ts',
          name: 'App',
          kind: 'component',
          regionId: appRegion,
          metrics: { linesOfCode: 12 },
        },
        {
          id: 'src/app/auth.service.ts',
          path: 'src/app/auth.service.ts',
          name: 'AuthService',
          kind: 'service',
          regionId: appRegion,
          metrics: { linesOfCode: 30 },
        },
      ],
      edges: [
        {
          id: edgeId('import', 'src/app/app.ts', 'src/app/auth.service.ts'),
          sourceId: 'src/app/app.ts',
          targetId: 'src/app/auth.service.ts',
          kind: 'import',
          evidence: [{ path: 'src/app/app.ts', line: 2 }],
        },
      ],
    },
    findings: [],
    unresolved: [],
  };
}

describe('parseAnalysisResult', () => {
  it('accepts a consistent result', () => {
    expect(parseAnalysisResult(validResult()).project.name).toBe('demo');
  });

  it('reports schema problems with their location', () => {
    const input = { ...validResult(), schemaVersion: 2 };
    expect(() => parseAnalysisResult(input)).toThrow(/schemaVersion/);
  });

  it('rejects unknown node kinds', () => {
    const input = validResult();
    (input.graph.nodes[0] as { kind: string }).kind = 'widget';
    expect(() => parseAnalysisResult(input)).toThrow(AnalysisResultError);
  });

  it('rejects findings that refer to unknown nodes', () => {
    const input = validResult();
    input.findings.push({
      id: 'high-fan-in:missing.ts',
      category: 'high-fan-in',
      severity: 'info',
      nodeIds: ['missing.ts'],
      explanation: 'x',
      rule: 'fan-in above threshold',
      threshold: 10,
      evidencePaths: [],
    });
    expect(() => parseAnalysisResult(input)).toThrow(/unknown node "missing.ts"/);
  });
});

describe('findGraphIntegrityIssues', () => {
  it('finds nothing wrong in a consistent graph', () => {
    expect(findGraphIntegrityIssues(validResult().graph)).toEqual([]);
  });

  it('flags duplicate IDs, dangling references and IDs that break the rules', () => {
    const { graph } = validResult();
    graph.nodes.push({ ...graph.nodes[0], regionId: 'folder:nowhere' });
    graph.edges.push({ ...graph.edges[0], id: 'wrong', targetId: 'ghost.ts' });

    expect(findGraphIntegrityIssues(graph)).toEqual([
      'Duplicate node ID "src/app/app.ts"',
      'Node "src/app/app.ts" is in unknown region "folder:nowhere"',
      'Edge "wrong" should have ID "import:src/app/app.ts->ghost.ts"',
      'Edge "wrong" points at unknown node "ghost.ts"',
    ]);
  });
});
