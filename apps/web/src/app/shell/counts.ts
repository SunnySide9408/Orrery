import type { NodeKind } from '@orrery/contracts';

/** "1 file", "3 files". */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** How a number of files of one kind reads in a sentence. */
const KIND_NOUNS: Record<NodeKind, [string, string]> = {
  component: ['component', 'components'],
  service: ['service', 'services'],
  directive: ['directive', 'directives'],
  pipe: ['pipe', 'pipes'],
  guard: ['guard', 'guards'],
  interceptor: ['interceptor', 'interceptors'],
  resolver: ['resolver', 'resolvers'],
  module: ['NgModule', 'NgModules'],
  'route-config': ['route file', 'route files'],
  spec: ['spec', 'specs'],
  other: ['other file', 'other files'],
};

export function kindCount(kind: NodeKind, n: number): string {
  const [singular, plural] = KIND_NOUNS[kind];
  return count(n, singular, plural);
}

/** "6 components, 4 services and 2 pipes", most frequent first. */
export function kindBreakdown(kinds: readonly NodeKind[]): string {
  const tally = new Map<NodeKind, number>();
  for (const kind of kinds) tally.set(kind, (tally.get(kind) ?? 0) + 1);
  const parts = [...tally]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kind, n]) => kindCount(kind, n));
  return listOf(parts);
}

/** "a", "a and b", "a, b and c". */
export function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
