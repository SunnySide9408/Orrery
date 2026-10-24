import {
  NODE_KINDS,
  type AnalysisResult,
  type Finding,
  type GraphNode,
  type ProviderScope,
} from '@orrery/contracts';
import { degrees, type GraphIndex } from '@orrery/graph-core';
import { kindCount } from '../shell/counts';
import { findingTitle } from '../findings/finding-text';

/**
 * The facts the overview shows, all read from the analysis result: nothing
 * here is estimated or scored. Specs are counted apart, as findings do.
 */
export interface Overview {
  /** Source files that are not specs. */
  files: number;
  specs: number;
  /** "18 components", most frequent kind first, specs left out. */
  kinds: string[];
  regions: number;
  lazyRoutes: string[];
  /** Relationships where one file asks dependency injection for another. */
  injections: number;
  /** Injectables with a known provider, by the scope of their first provider. */
  provided: { scope: ProviderScope; count: number }[];
  /** The files with the most direct users, most used first. */
  mostUsed: { node: GraphNode; users: number }[];
  findings: { finding: Finding; title: string }[];
  unresolved: number;
}

const MOST_USED = 3;

export function describeOverview(result: AnalysisResult, index: GraphIndex): Overview {
  const { nodes, edges, regions } = result.graph;
  const code = nodes.filter((node) => node.kind !== 'spec');
  const isCode = (id: string) => {
    const kind = index.node(id)?.kind;
    return kind !== undefined && kind !== 'spec';
  };

  const scopes = new Map<ProviderScope, number>();
  for (const node of nodes) {
    const scope = node.providers?.[0]?.scope;
    if (scope) scopes.set(scope, (scopes.get(scope) ?? 0) + 1);
  }

  const mostUsed = [...degrees(index, isCode)]
    .filter(([, degree]) => degree.fanIn > 0)
    .sort(([a, x], [b, y]) => y.fanIn - x.fanIn || a.localeCompare(b))
    .slice(0, MOST_USED)
    .map(([id, degree]) => ({ node: index.node(id)!, users: degree.fanIn }));

  return {
    files: code.length,
    specs: nodes.length - code.length,
    kinds: NODE_KINDS.filter((kind) => kind !== 'spec')
      .map((kind) => ({ kind, n: code.filter((node) => node.kind === kind).length }))
      .filter(({ n }) => n > 0)
      .sort((a, b) => b.n - a.n)
      .map(({ kind, n }) => kindCount(kind, n)),
    regions: regions.length,
    lazyRoutes: regions.filter((region) => region.kind === 'lazy-route').map((r) => r.label),
    injections: edges.filter((edge) => edge.kind === 'inject').length,
    provided: [...scopes]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([scope, count]) => ({ scope, count })),
    mostUsed,
    findings: result.findings.map((finding) => ({ finding, title: findingTitle(finding, index) })),
    unresolved: result.unresolved.length,
  };
}
