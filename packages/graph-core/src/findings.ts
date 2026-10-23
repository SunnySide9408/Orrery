import { findingId, type DependencyGraph, type Finding } from '@orrery/contracts';
import { findCycles, shortestCycle } from './cycles';
import { createGraphIndex } from './graph-index';
import { degrees, flagThreshold, type ThresholdRule } from './metrics';

export interface FindingRules {
  fanIn: ThresholdRule;
  fanOut: ThresholdRule;
}

export const DEFAULT_FINDING_RULES: FindingRules = {
  fanIn: { percentile: 95, minimum: 10 },
  fanOut: { percentile: 95, minimum: 10 },
};

const COUNTED =
  'Counts imports, standalone imports, lazy routes and injection. Specs are left out. Usage that only appears in templates is not seen.';

/**
 * Review signals computed from the graph alone. Each finding carries the
 * rule, the threshold, what the rule cannot see, and the node paths that
 * prove it, so a reader can check it against the code. Findings are sorted:
 * cycles first, then the highest counts.
 *
 * Specs are left out: a spec depends on the file it tests by design, and
 * counting it would make every tested file look more used than it is.
 */
export function computeFindings(
  graph: DependencyGraph,
  rules: FindingRules = DEFAULT_FINDING_RULES,
): Finding[] {
  const index = createGraphIndex(graph);
  const include = (id: string) => {
    const kind = index.node(id)?.kind;
    return kind !== undefined && kind !== 'spec';
  };
  const name = (id: string) => index.node(id)?.name ?? id;
  const files = (count: number) => `${count} ${count === 1 ? 'file' : 'files'}`;

  const cycles: Finding[] = findCycles(index, include).map((component) => {
    const loop = shortestCycle(index, component);
    return {
      id: findingId('cycle', component),
      category: 'cycle',
      severity: 'warning',
      nodeIds: component,
      explanation:
        `${files(component.length)} depend on each other in a loop, for example ` +
        `${loop.map(name).join(' → ')}. A change to any of them potentially affects the others, ` +
        'according to static relationships, and the loop makes load order harder to reason about.',
      rule: 'Dependency cycle: files that can reach each other by following dependencies (a strongly connected component)',
      threshold: null,
      limits: `${COUNTED} Type-only imports count too, although they disappear at runtime. One shortest loop is shown as evidence; the group may contain more.`,
      evidencePaths: [loop],
    };
  });

  const degreeOf = degrees(index, include);
  const all = [...degreeOf.values()];
  const fanInAt = flagThreshold(
    all.map((d) => d.fanIn),
    rules.fanIn,
  );
  const fanOutAt = flagThreshold(
    all.map((d) => d.fanOut),
    rules.fanOut,
  );
  const ruleText = (direction: string, rule: ThresholdRule, at: number) =>
    `High ${direction}: ${at} or more files, the ${ordinal(rule.percentile)} percentile of this project or ${rule.minimum}, whichever is higher`;

  const fan: { count: number; finding: Finding }[] = [];
  for (const [id, degree] of degreeOf) {
    if (degree.fanIn >= fanInAt) {
      const dependants = index.dependantsOf(id).filter(include);
      fan.push({
        count: degree.fanIn,
        finding: {
          id: findingId('high-fan-in', [id]),
          category: 'high-fan-in',
          severity: 'info',
          nodeIds: [id],
          explanation: `${name(id)} is used directly by ${files(degree.fanIn)}. A change here potentially affects all of them, according to static relationships.`,
          rule: ruleText('fan-in', rules.fanIn, fanInAt),
          threshold: fanInAt,
          limits: COUNTED,
          evidencePaths: dependants.map((dependant) => [dependant, id]),
        },
      });
    }
    if (degree.fanOut >= fanOutAt) {
      const dependencies = index.dependenciesOf(id).filter(include);
      fan.push({
        count: degree.fanOut,
        finding: {
          id: findingId('high-fan-out', [id]),
          category: 'high-fan-out',
          severity: 'info',
          nodeIds: [id],
          explanation: `${name(id)} depends directly on ${files(degree.fanOut)}. It may be doing several jobs; this is a prompt to review, not a defect.`,
          rule: ruleText('fan-out', rules.fanOut, fanOutAt),
          threshold: fanOutAt,
          limits: COUNTED,
          evidencePaths: dependencies.map((dependency) => [id, dependency]),
        },
      });
    }
  }
  fan.sort((a, b) => b.count - a.count || compare(a.finding.id, b.finding.id));

  return [...cycles, ...fan.map(({ finding }) => finding)];
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
