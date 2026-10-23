/**
 * Stable ID rules.
 *
 * Every ID is derived only from facts in the analysed source (paths, kinds),
 * never from counters, timestamps or the machine the analysis ran on. Two runs
 * over the same code therefore produce the same IDs, which keeps the layout
 * deterministic and lets a URL or a saved selection survive a re-analysis.
 */

/**
 * Normalises a path relative to the project root: forward slashes, no leading
 * `./` or `/`, no empty or `.` segments. Rejects paths that climb out of the
 * root, because a node outside the project has no stable identity.
 */
export function normalizePath(path: string): string {
  const segments = path
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.');

  if (segments.includes('..')) {
    throw new Error(`Path must stay inside the project root: "${path}"`);
  }
  if (segments.length === 0) {
    throw new Error('Path must not be empty');
  }
  return segments.join('/');
}

/** A node is one source file, so its ID is its normalised path. */
export function nodeId(path: string): string {
  return normalizePath(path);
}

/** A region is identified by its kind and the folder it starts at. */
export function regionId(kind: string, rootPath: string): string {
  return `${kind}:${normalizePath(rootPath)}`;
}

/** At most one edge per kind between two nodes; direction is source depends on target. */
export function edgeId(kind: string, sourceId: string, targetId: string): string {
  return `${kind}:${sourceId}->${targetId}`;
}

/** Node IDs are sorted so the same set of nodes always yields the same finding ID. */
export function findingId(category: string, nodeIds: readonly string[]): string {
  return `${category}:${[...nodeIds].sort().join('|')}`;
}
