import ts from 'typescript';

/** The `compilerOptions` that decide how a bare specifier maps to a file. */
export interface PathOptions {
  /** Relative to the project root, normalised; `null` when not set. */
  baseUrl: string | null;
  paths: Readonly<Record<string, readonly string[]>>;
}

export type Resolution =
  | { kind: 'file'; path: string }
  /** A package such as `@angular/core` or `rxjs`. Not part of the graph, not a problem. */
  | { kind: 'external' }
  | { kind: 'unresolved'; reason: string };

const EXTENSIONS = ['.ts', '.tsx', '.d.ts', '/index.ts'];

/**
 * Reads `baseUrl` and `paths` from a tsconfig, following `extends` chains to
 * other files in the project. Packages named in `extends` (such as
 * `@tsconfig/strictest`) are not read: they live in `node_modules`, which the
 * analyser never sees.
 */
export function readPathOptions(
  files: ReadonlyMap<string, string>,
  tsconfigPath = 'tsconfig.json',
): PathOptions {
  let baseUrl: string | null = null;
  let paths: Record<string, string[]> | null = null;
  let pathsBase = '';
  const seen = new Set<string>();

  for (let current: string | null = tsconfigPath; current && !seen.has(current);) {
    seen.add(current);
    const text = files.get(current);
    if (text === undefined) break;
    const { config } = ts.parseConfigFileTextToJson(current, text);
    const options = (config?.compilerOptions ?? {}) as { baseUrl?: unknown; paths?: unknown };
    const dir = dirname(current);
    // The nearest config that sets a value wins, as in tsc.
    if (baseUrl === null && typeof options.baseUrl === 'string') {
      baseUrl = joinPath(dir, options.baseUrl);
    }
    if (paths === null && options.paths && typeof options.paths === 'object') {
      paths = options.paths as Record<string, string[]>;
      pathsBase = dir;
    }
    const parent: unknown = config?.extends;
    current =
      typeof parent === 'string' && parent.startsWith('.') ? withJson(joinPath(dir, parent)) : null;
  }

  // Without a baseUrl, `paths` entries resolve against the config that declares them.
  const base = baseUrl ?? pathsBase;
  const resolvedPaths: Record<string, string[]> = {};
  for (const [pattern, targets] of Object.entries(paths ?? {})) {
    resolvedPaths[pattern] = targets
      .map((target) => joinPath(base, target))
      .filter((target): target is string => target !== null);
  }
  return { baseUrl, paths: resolvedPaths };
}

/** Maps an import specifier to a project file, following TypeScript's bundler resolution. */
export function resolveSpecifier(
  specifier: string,
  importer: string,
  files: ReadonlySet<string>,
  options: PathOptions,
): Resolution {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const path = specifier.startsWith('/')
      ? specifier.slice(1)
      : joinPath(dirname(importer), specifier);
    return toResolution(findFile(path, files), specifier);
  }

  for (const [pattern, targets] of Object.entries(options.paths)) {
    const match = matchPattern(pattern, specifier);
    if (match === null) continue;
    for (const target of targets) {
      const found = findFile(target.replace('*', match), files);
      if (found) return { kind: 'file', path: found };
    }
    return { kind: 'unresolved', reason: `No file matches the tsconfig path "${pattern}"` };
  }

  if (options.baseUrl !== null) {
    const found = findFile(joinPath(options.baseUrl, specifier), files);
    if (found) return { kind: 'file', path: found };
  }
  return { kind: 'external' };
}

function toResolution(found: string | null, specifier: string): Resolution {
  if (found) return { kind: 'file', path: found };
  if (/\.(css|scss|sass|less|html|json|svg|png)$/.test(specifier)) {
    return { kind: 'unresolved', reason: 'Not a TypeScript source file' };
  }
  return { kind: 'unresolved', reason: 'No matching file in the project' };
}

function findFile(path: string | null, files: ReadonlySet<string>): string | null {
  if (path === null) return null;
  if (files.has(path)) return path;
  // ESM-style `./user.service.js` refers to `user.service.ts`.
  const withoutJs = path.replace(/\.(m|c)?js$/, '');
  for (const extension of EXTENSIONS) {
    if (files.has(withoutJs + extension)) return withoutJs + extension;
  }
  return null;
}

function matchPattern(pattern: string, specifier: string): string | null {
  const star = pattern.indexOf('*');
  if (star === -1) return pattern === specifier ? '' : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  return specifier.length >= prefix.length + suffix.length &&
    specifier.startsWith(prefix) &&
    specifier.endsWith(suffix)
    ? specifier.slice(prefix.length, specifier.length - suffix.length)
    : null;
}

export function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/** Joins and normalises; returns `null` when the result climbs out of the project root. */
export function joinPath(base: string, relative: string): string | null {
  const segments: string[] = [];
  for (const segment of `${base}/${relative}`.replace(/\\/g, '/').split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join('/');
}

function withJson(path: string | null): string | null {
  if (path === null) return null;
  return path.endsWith('.json') ? path : `${path}.json`;
}
