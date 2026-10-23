import * as z from 'zod/mini';

/**
 * The analysis-result contract shared by the analyser (producer) and the web
 * app (consumer). The schemas are the single source of truth: the TypeScript
 * types are inferred from them, so the static types and the runtime checks
 * cannot drift apart.
 *
 * The web app ships these schemas, so they use `zod/mini` (functions instead
 * of chained methods, which bundlers can tree-shake) imported as a namespace.
 * The classic build, or `import { z }`, pulled every zod locale into the
 * initial bundle: about 430 kB.
 */

export const SCHEMA_VERSION = 1;

export const NODE_KINDS = [
  'component',
  'service',
  'directive',
  'pipe',
  'guard',
  'interceptor',
  'resolver',
  'module',
  'route-config',
  'spec',
  'other',
] as const;

/** `inject` and `renders` are planned for Phase 3 and later; adding a kind is a minor change. */
export const EDGE_KINDS = ['import', 'standalone-import', 'lazy-route'] as const;

export const REGION_KINDS = ['lazy-route', 'folder', 'library'] as const;

export const FINDING_CATEGORIES = ['cycle', 'high-fan-in', 'high-fan-out'] as const;

export const FINDING_SEVERITIES = ['info', 'warning'] as const;

const id = z.string().check(z.minLength(1));

/** A position in a source file, relative to the project root. Lines are 1-based. */
export const SourceLocationSchema = z.object({
  path: z.string().check(z.minLength(1)),
  line: z.int().check(z.positive()),
});

export const NodeMetricsSchema = z.object({
  /** Non-blank lines in the file. This is the one metric planet size encodes. */
  linesOfCode: z.int().check(z.nonnegative()),
});

export const GraphNodeSchema = z.object({
  id,
  /** Normalised path from the project root. */
  path: z.string().check(z.minLength(1)),
  /** Display name: the main exported class or function, or the file name. */
  name: z.string().check(z.minLength(1)),
  kind: z.enum(NODE_KINDS),
  regionId: id,
  /** For moons (specs, small helpers): the node they orbit. */
  ownerId: z.optional(id),
  metrics: NodeMetricsSchema,
});

export const GraphEdgeSchema = z.object({
  id,
  /** The dependant: `sourceId` depends on `targetId`. */
  sourceId: id,
  targetId: id,
  kind: z.enum(EDGE_KINDS),
  /** Where the relationship is written, so every edge can be traced to code. */
  evidence: z.array(SourceLocationSchema).check(z.minLength(1)),
});

export const RegionSchema = z.object({
  id,
  label: z.string().check(z.minLength(1)),
  kind: z.enum(REGION_KINDS),
  rootPath: z.string().check(z.minLength(1)),
  /** The enclosing region, for lazy routes nested in other lazy routes. */
  parentId: z.optional(id),
});

export const DependencyGraphSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  regions: z.array(RegionSchema),
});

export const FindingSchema = z.object({
  id,
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(FINDING_SEVERITIES),
  nodeIds: z.array(id).check(z.minLength(1)),
  /** Plain-language explanation; a review signal, never a claim of a defect. */
  explanation: z.string().check(z.minLength(1)),
  /** The rule that produced the finding, e.g. "fan-in above threshold". */
  rule: z.string().check(z.minLength(1)),
  /** The threshold used, or null when the rule has none (cycles). */
  threshold: z.nullable(z.number()),
  /** Each path is a list of node IDs that proves the finding. */
  evidencePaths: z.array(z.array(id).check(z.minLength(1))),
});

/** Something the analyser saw but could not turn into graph facts. */
export const UnresolvedItemSchema = z.object({
  kind: z.enum(['import', 'file']),
  location: SourceLocationSchema,
  /** The import specifier, when `kind` is `import`. */
  specifier: z.optional(z.string()),
  reason: z.string().check(z.minLength(1)),
});

export const AnalysisResultSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  project: z.object({
    name: z.string().check(z.minLength(1)),
  }),
  /** Git ref or another label for the analysed snapshot; null when unknown. */
  ref: z.nullable(z.string()),
  analyzerVersion: z.string().check(z.minLength(1)),
  /** ISO 8601 timestamp. */
  createdAt: z.iso.datetime(),
  graph: DependencyGraphSchema,
  findings: z.array(FindingSchema),
  unresolved: z.array(UnresolvedItemSchema),
});

/** Kept apart from the domain graph: positions are a view concern. */
export const NodePositionSchema = z.object({
  nodeId: id,
  regionId: id,
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const RegionPositionSchema = z.object({
  regionId: id,
  x: z.number(),
  y: z.number(),
  z: z.number(),
  radius: z.number().check(z.positive()),
});

export const LayoutSchema = z.object({
  layoutVersion: z.string().check(z.minLength(1)),
  nodes: z.array(NodePositionSchema),
  regions: z.array(RegionPositionSchema),
});

export type NodeKind = (typeof NODE_KINDS)[number];
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type RegionKind = (typeof REGION_KINDS)[number];
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export type SourceLocation = z.infer<typeof SourceLocationSchema>;
export type NodeMetrics = z.infer<typeof NodeMetricsSchema>;
export type GraphNode = z.infer<typeof GraphNodeSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type DependencyGraph = z.infer<typeof DependencyGraphSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type UnresolvedItem = z.infer<typeof UnresolvedItemSchema>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type NodePosition = z.infer<typeof NodePositionSchema>;
export type RegionPosition = z.infer<typeof RegionPositionSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
