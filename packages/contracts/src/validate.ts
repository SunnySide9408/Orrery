import { edgeId, nodeId } from './ids';
import { AnalysisResultSchema, type AnalysisResult, type DependencyGraph } from './schema';

/**
 * Checks the cross-references a schema cannot express: unique IDs, IDs that
 * follow the ID rules, and references that point at things that exist.
 * Returns a list of problems; an empty list means the graph is consistent.
 */
export function findGraphIntegrityIssues(graph: DependencyGraph): string[] {
  const issues: string[] = [];
  const regionIds = collectUniqueIds('region', graph.regions, issues);
  const nodeIds = collectUniqueIds('node', graph.nodes, issues);
  collectUniqueIds('edge', graph.edges, issues);

  for (const region of graph.regions) {
    if (region.parentId !== undefined && !regionIds.has(region.parentId)) {
      issues.push(`Region "${region.id}" has unknown parent "${region.parentId}"`);
    }
  }

  for (const node of graph.nodes) {
    const expected = expectedNodeId(node.path);
    if (expected === null) {
      issues.push(`Node "${node.id}" has a path outside the project root: "${node.path}"`);
    } else if (node.id !== expected) {
      issues.push(`Node "${node.id}" should have ID "${expected}"`);
    }
    if (!regionIds.has(node.regionId)) {
      issues.push(`Node "${node.id}" is in unknown region "${node.regionId}"`);
    }
    if (node.ownerId !== undefined && !nodeIds.has(node.ownerId)) {
      issues.push(`Node "${node.id}" has unknown owner "${node.ownerId}"`);
    }
  }

  for (const edge of graph.edges) {
    const expected = edgeId(edge.kind, edge.sourceId, edge.targetId);
    if (edge.id !== expected) {
      issues.push(`Edge "${edge.id}" should have ID "${expected}"`);
    }
    for (const end of [edge.sourceId, edge.targetId]) {
      if (!nodeIds.has(end)) {
        issues.push(`Edge "${edge.id}" points at unknown node "${end}"`);
      }
    }
  }

  return issues;
}

/**
 * Parses untrusted JSON into an analysis result, or throws an error that lists
 * every problem found. Use it at every boundary where a result enters the app.
 */
export function parseAnalysisResult(input: unknown): AnalysisResult {
  const parsed = AnalysisResultSchema.safeParse(input);
  if (!parsed.success) {
    const details = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new AnalysisResultError(details);
  }

  const result = parsed.data;
  const issues = findGraphIntegrityIssues(result.graph);
  const nodeIds = new Set(result.graph.nodes.map((node) => node.id));
  for (const finding of result.findings) {
    for (const id of [...finding.nodeIds, ...finding.evidencePaths.flat()]) {
      if (!nodeIds.has(id)) {
        issues.push(`Finding "${finding.id}" refers to unknown node "${id}"`);
      }
    }
  }
  if (issues.length > 0) {
    throw new AnalysisResultError(issues);
  }
  return result;
}

export class AnalysisResultError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid analysis result:\n- ${issues.join('\n- ')}`);
    this.name = 'AnalysisResultError';
  }
}

function expectedNodeId(path: string): string | null {
  try {
    return nodeId(path);
  } catch {
    return null;
  }
}

function collectUniqueIds(
  label: string,
  items: readonly { id: string }[],
  issues: string[],
): Set<string> {
  const ids = new Set<string>();
  for (const { id } of items) {
    if (ids.has(id)) {
      issues.push(`Duplicate ${label} ID "${id}"`);
    }
    ids.add(id);
  }
  return ids;
}
