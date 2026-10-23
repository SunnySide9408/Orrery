import {
  edgeId,
  nodeId,
  normalizePath,
  regionId,
  SCHEMA_VERSION,
  type AnalysisResult,
  type EdgeKind,
  type GraphEdge,
  type GraphNode,
  type ProviderSite,
  type Region,
  type SourceLocation,
  type UnresolvedItem,
} from '@orrery/contracts';
import { computeFindings } from '@orrery/graph-core';
import { isSpecPath, parseFile, type FileFacts } from './parse-file';
import { dirname, readPathOptions, resolveSpecifier } from './resolve';

/** Bump when the output for the same source changes. */
export const ANALYZER_VERSION = '0.2.0';

export interface ProjectFile {
  /** Relative to the project root. */
  path: string;
  text: string;
}

export interface AnalyzeInput {
  projectName: string;
  /** Git ref or another label for the snapshot. */
  ref: string | null;
  /** ISO 8601. Passed in, not read from the clock, so a re-run gives identical output. */
  createdAt: string;
  /** Source files plus any tsconfig files; other files are ignored. */
  files: readonly ProjectFile[];
  /** Defaults to `tsconfig.json` at the project root. */
  tsconfigPath?: string;
}

export interface AnalyzeOptions {
  /** Called after each file is parsed, so a worker can report progress. */
  onFileParsed?: (parsed: number, total: number) => void;
}

/**
 * Folder names that hold one sub-folder per feature. A lazy route loaded from
 * `features/article/pages/home/home.component.ts` belongs to the
 * `features/article` region, not to a region of its own per page.
 */
const FEATURE_CONTAINERS = new Set(['features', 'feature', 'pages', 'modules', 'views', 'routes']);

/**
 * Turns Angular source text into an analysis result. Pure: no file system, no
 * clock, no network, so the same code runs in the CLI and in a Web Worker.
 */
export function analyzeAngularProject(
  input: AnalyzeInput,
  options: AnalyzeOptions = {},
): AnalysisResult {
  const texts = new Map(input.files.map((file) => [normalizePath(file.path), file.text]));
  const sourcePaths = [...texts.keys()]
    .filter((path) => path.endsWith('.ts') && !path.endsWith('.d.ts'))
    .sort();
  const sourceSet = new Set(sourcePaths);
  const pathOptions = readPathOptions(texts, input.tsconfigPath);
  const facts = new Map<string, FileFacts>();
  for (const path of sourcePaths) {
    facts.set(path, parseFile(path, texts.get(path)!));
    options.onFileParsed?.(facts.size, sourcePaths.length);
  }

  const edges = new Map<string, GraphEdge>();
  const unresolved: UnresolvedItem[] = [];
  /** Lazy-route targets, the region seeds. */
  const lazyTargets = new Set<string>();
  const providersOf = new Map<string, ProviderSite[]>();

  const addEdge = (kind: EdgeKind, source: string, target: string, evidence: SourceLocation) => {
    if (source === target) return;
    const id = edgeId(kind, source, target);
    const existing = edges.get(id);
    if (existing) {
      existing.evidence.push(evidence);
    } else {
      edges.set(id, { id, sourceId: source, targetId: target, kind, evidence: [evidence] });
    }
  };
  const resolve = (specifier: string, path: string, line: number): string | null => {
    const resolution = resolveSpecifier(specifier, path, sourceSet, pathOptions);
    if (resolution.kind === 'file') return resolution.path;
    if (resolution.kind === 'unresolved') {
      unresolved.push({
        kind: 'import',
        location: { path, line },
        specifier,
        reason: resolution.reason,
      });
    }
    return null;
  };

  for (const [path, fileFacts] of facts) {
    const importedFrom = new Map<string, string>();
    for (const fact of fileFacts.imports) {
      const target = resolve(fact.specifier, path, fact.line);
      if (target === null) continue;
      addEdge('import', path, target, { path, line: fact.line });
      for (const name of fact.names) importedFrom.set(name, target);
    }
    for (const fact of fileFacts.lazyRoutes) {
      const target = resolve(fact.specifier, path, fact.line);
      if (target === null) continue;
      addEdge('lazy-route', path, target, { path, line: fact.line });
      lazyTargets.add(target);
    }
    for (const fact of fileFacts.standaloneImports) {
      const target = importedFrom.get(fact.name);
      if (target !== undefined)
        addEdge('standalone-import', path, target, { path, line: fact.line });
    }
    for (const fact of fileFacts.injections) {
      const target = importedFrom.get(fact.name);
      if (target !== undefined) addEdge('inject', path, target, { path, line: fact.line });
    }
    for (const fact of fileFacts.providers) {
      const target =
        importedFrom.get(fact.name) ?? (fileFacts.classNames.includes(fact.name) ? path : null);
      if (target === null) continue;
      const sites = providersOf.get(target) ?? [];
      sites.push({ scope: fact.scope, location: { path, line: fact.line } });
      providersOf.set(target, sites);
    }
  }

  const ownerOf = new Map<string, string>();
  for (const path of sourcePaths) {
    const owner = path.replace(/\.spec\.ts$/, '.ts');
    if (isSpecPath(path) && sourceSet.has(owner)) ownerOf.set(path, owner);
  }
  const { regions, regionOf } = assignRegions(
    sourcePaths,
    lazyTargets,
    [...edges.values()],
    ownerOf,
  );

  const nodes: GraphNode[] = sourcePaths.map((path) => {
    const fileFacts = facts.get(path)!;
    const owner = ownerOf.get(path);
    const node: GraphNode = {
      id: nodeId(path),
      path,
      name: fileFacts.name ?? basename(path),
      kind: fileFacts.kind,
      regionId: regionOf.get(path)!,
      metrics: { linesOfCode: fileFacts.linesOfCode },
    };
    if (owner !== undefined) node.ownerId = nodeId(owner);
    const providers = providersOf.get(path);
    if (providers) {
      node.providers = providers.sort(
        (a, b) => compare(a.location.path, b.location.path) || a.location.line - b.location.line,
      );
    }
    return node;
  });
  const graph = {
    nodes,
    edges: [...edges.values()].sort((a, b) => compare(a.id, b.id)),
    regions: [...regions].sort((a, b) => compare(a.id, b.id)),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    project: { name: input.projectName },
    ref: input.ref,
    analyzerVersion: ANALYZER_VERSION,
    createdAt: input.createdAt,
    graph,
    findings: computeFindings(graph),
    unresolved: unresolved.sort(
      (a, b) =>
        compare(a.location.path, b.location.path) ||
        a.location.line - b.location.line ||
        compare(a.specifier ?? '', b.specifier ?? ''),
    ),
  };
}

interface RegionRoot {
  kind: 'lazy-route' | 'folder';
  root: string;
}

/**
 * Puts every file in one region:
 * - a `lazy-route` region per feature folder reached by `loadComponent` or
 *   `loadChildren`, holding the files of that folder that only lazy code reaches;
 * - a `folder` region per top-level folder of the app (`core`, `shared`) for
 *   eagerly loaded files, including eager files that sit in a feature folder;
 * - the app root itself for everything else.
 *
 * "Eager" means reachable by imports from a file outside every lazy feature
 * folder, which is roughly what ends up in the initial bundle. A spec goes
 * where the file it tests goes, so moons stay with their planet.
 */
function assignRegions(
  sourcePaths: readonly string[],
  lazyTargets: ReadonlySet<string>,
  edges: readonly GraphEdge[],
  ownerOf: ReadonlyMap<string, string>,
): { regions: Region[]; regionOf: Map<string, string> } {
  const appRoot = findAppRoot(sourcePaths);
  const appRegion: Region = {
    id: appRoot === '' ? 'folder:.' : regionId('folder', appRoot),
    label: appRoot === '' ? 'app' : basename(appRoot),
    kind: 'folder',
    rootPath: appRoot || '.',
  };

  const lazyRoots = [...new Set([...lazyTargets].map((target) => featureRoot(target, appRoot)))]
    .filter((root) => root !== appRoot && root !== '')
    // Deepest first, so the first match is the innermost feature.
    .sort((a, b) => b.length - a.length || compare(a, b));
  const lazyRootOf = (path: string) => lazyRoots.find((root) => isInside(path, root)) ?? null;

  const eager = reachable(
    sourcePaths.filter((path) => !isSpecPath(path) && lazyRootOf(path) === null),
    edges.filter((edge) => edge.kind !== 'lazy-route'),
  );

  const rootOf = (path: string): RegionRoot | null => {
    const lazyRoot = lazyRootOf(path);
    if (lazyRoot !== null && !eager.has(path)) return { kind: 'lazy-route', root: lazyRoot };
    if (!isInside(path, appRoot)) return null;
    const rest = appRoot === '' ? path : path.slice(appRoot.length + 1);
    const slash = rest.indexOf('/');
    if (slash === -1) return null;
    const top = rest.slice(0, slash);
    return { kind: 'folder', root: appRoot === '' ? top : `${appRoot}/${top}` };
  };

  const rootByPath = new Map<string, RegionRoot | null>();
  for (const path of sourcePaths) {
    if (!ownerOf.has(path)) rootByPath.set(path, rootOf(path));
  }
  for (const [spec, owner] of ownerOf) rootByPath.set(spec, rootByPath.get(owner) ?? null);

  const used = new Map<string, RegionRoot>();
  for (const root of rootByPath.values()) {
    if (root) used.set(regionId(root.kind, root.root), root);
  }
  const usedRoots = [...used.values()].sort(
    (a, b) => b.root.length - a.root.length || compare(a.root, b.root),
  );

  const regions: Region[] = usedRoots.map(({ kind, root }) => {
    const parent = usedRoots.find((other) => other.root !== root && isInside(root, other.root));
    return {
      id: regionId(kind, root),
      label: basename(root),
      kind,
      rootPath: root,
      parentId: parent ? regionId(parent.kind, parent.root) : appRegion.id,
    };
  });

  const regionOf = new Map<string, string>();
  for (const [path, root] of rootByPath) {
    regionOf.set(path, root ? regionId(root.kind, root.root) : appRegion.id);
  }
  return { regions: [...regions, appRegion], regionOf };
}

function reachable(starts: readonly string[], edges: readonly GraphEdge[]): Set<string> {
  const next = new Map<string, string[]>();
  for (const edge of edges) {
    const list = next.get(edge.sourceId);
    if (list) list.push(edge.targetId);
    else next.set(edge.sourceId, [edge.targetId]);
  }
  const seen = new Set(starts);
  const queue = [...starts];
  while (queue.length > 0) {
    for (const target of next.get(queue.pop()!) ?? []) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

/** `src/app` when present (the Angular CLI default), else the deepest folder shared by all sources. */
function findAppRoot(paths: readonly string[]): string {
  if (paths.some((path) => path.startsWith('src/app/'))) return 'src/app';
  const dirs = paths.map((path) => dirname(path).split('/'));
  const common: string[] = [];
  for (
    let i = 0;
    dirs.length > 0 && dirs.every((dir) => dir[i] !== undefined && dir[i] === dirs[0]![i]);
    i++
  ) {
    common.push(dirs[0]![i]!);
  }
  return common.join('/');
}

function featureRoot(target: string, appRoot: string): string {
  const dir = dirname(target);
  if (!isInside(dir, appRoot) || dir === appRoot) return dir;
  const prefix = appRoot === '' ? [] : appRoot.split('/');
  const rest = dir.split('/').slice(prefix.length);
  const container = rest.findIndex(
    (segment, index) => FEATURE_CONTAINERS.has(segment) && index + 1 < rest.length,
  );
  return container === -1 ? dir : [...prefix, ...rest.slice(0, container + 2)].join('/');
}

function isInside(path: string, root: string): boolean {
  return root === '' || root === '.' || path === root || path.startsWith(`${root}/`);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.ts$/, '');
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
