import type { AnalysisResult, Finding, FindingCategory, NodeKind } from '@orrery/contracts';
import type { GraphIndex } from '@orrery/graph-core';
import { count, kindBreakdown, listOf } from '../shell/counts';

/**
 * How a finding reads to someone new to the project. The analyser states
 * facts (the explanation, rule, threshold, limits and evidence); everything
 * here is interpretation drawn from those facts, and the views label it so.
 */
export interface FindingReading {
  /** Names the file, so a list of findings can be scanned. */
  title: string;
  /** Further facts taken from the evidence, such as where the users are. */
  facts: string[];
  whyItMatters: string;
  nextStep: string;
  /** The node "Show in the map" selects: the flagged file, or the first file of the loop. */
  mapNodeId: string;
}

/** What a severity means, so a badge never reads as a verdict. */
export const SEVERITY_TEXT: Record<Finding['severity'], { label: string; meaning: string }> = {
  warning: {
    label: 'Worth checking',
    meaning: 'A pattern that often makes code harder to change. Worth a look in most projects.',
  },
  info: {
    label: 'Observation',
    meaning: 'A structural fact that is often fine. Read why it was flagged before acting on it.',
  },
};

/** Badge colours per severity, readable on the dark panels. */
export const SEVERITY_CLASS: Record<Finding['severity'], string> = {
  warning: 'bg-amber-400/15 text-amber-200',
  info: 'bg-sky-400/15 text-sky-200',
};

/** One group on the findings page: what the rule looks for, in plain words. */
export const CATEGORY_TEXT: Record<FindingCategory, { heading: string; measures: string }> = {
  cycle: {
    heading: 'Dependency cycles',
    measures:
      'Files that depend on each other in a loop, directly or through other files. Every loop is reported.',
  },
  'high-fan-in': {
    heading: 'Widely used files',
    measures:
      'Files that many others use directly (high fan-in). Flagged when the count is at the 95th percentile of this project or higher, and never below 10.',
  },
  'high-fan-out': {
    heading: 'Files with many dependencies',
    measures:
      'Files that use many others directly (high fan-out). Same threshold: the 95th percentile of this project, and never below 10.',
  },
};

export const CATEGORY_ORDER: readonly FindingCategory[] = ['cycle', 'high-fan-in', 'high-fan-out'];

/** A short title that names the file, for lists and links. */
export function findingTitle(finding: Finding, index: GraphIndex): string {
  const name = (id: string) => index.node(id)?.name ?? id;
  const first = finding.nodeIds[0]!;
  switch (finding.category) {
    case 'cycle': {
      const loop = finding.evidencePaths[0] ?? finding.nodeIds;
      const names = [...new Set(loop)].map(name);
      return names.length <= 3
        ? `Dependency cycle: ${listOf(names)}`
        : `Dependency cycle: ${names.slice(0, 2).join(', ')} and ${count(finding.nodeIds.length - 2, 'more file', 'more files')}`;
    }
    case 'high-fan-in':
      return `${name(first)} is used directly by ${count(finding.evidencePaths.length, 'file')}`;
    case 'high-fan-out':
      return `${name(first)} depends directly on ${count(finding.evidencePaths.length, 'file')}`;
  }
}

export function readFinding(
  finding: Finding,
  result: AnalysisResult,
  index: GraphIndex,
): FindingReading {
  const title = findingTitle(finding, index);
  const first = finding.nodeIds[0]!;
  const node = index.node(first);
  const kindsOf = (ids: readonly string[]) =>
    ids.map((id) => index.node(id)?.kind).filter((kind): kind is NodeKind => kind !== undefined);

  switch (finding.category) {
    case 'cycle': {
      const loop = finding.evidencePaths[0] ?? finding.nodeIds;
      const stepKinds = loop.slice(0, -1).map((id, i) =>
        index
          .outgoing(id)
          .filter((edge) => edge.targetId === loop[i + 1])
          .map((edge) => edge.kind),
      );
      const allInject =
        stepKinds.length > 0 && stepKinds.every((kinds) => kinds.includes('inject'));
      const facts = [`The loop: ${loop.map((id) => index.node(id)?.name ?? id).join(' → ')}.`];
      if (finding.nodeIds.length > new Set(loop).size) {
        facts.push(
          `The group holds ${count(finding.nodeIds.length, 'file')}; the shortest loop is shown.`,
        );
      }
      return {
        title,
        facts,
        whyItMatters:
          'Files in a loop cannot be changed, tested or loaded one at a time: a change to one can reach all the others. ' +
          'When one file uses another’s export while the loop is still loading, that export can be undefined at runtime.',
        nextStep: allInject
          ? 'Every step is an injection. If these services inject each other when they are created, Angular reports a circular dependency (NG0200). Check whether one side can take what it needs as a parameter, or move the shared part into a third service.'
          : 'Follow the loop and look for the step that points the wrong way, for example a shared or core file importing a feature. Moving the piece both sides need (a type, token or constant) into its own file usually breaks the loop. A step that is only an `import type` disappears at runtime and is harmless there.',
        mapNodeId: loop[0] ?? first,
      };
    }
    case 'high-fan-in': {
      const users = finding.evidencePaths.map((path) => path[0]!);
      const regions = new Map(result.graph.regions.map((region) => [region.id, region]));
      const areas = [...new Set(users.map((id) => index.node(id)?.regionId))]
        .map((id) => (id ? regions.get(id) : undefined))
        .filter((region) => region !== undefined);
      const lazy = areas.filter((region) => region.kind === 'lazy-route');
      const injecting = users.filter((id) =>
        index.outgoing(id).some((edge) => edge.targetId === first && edge.kind === 'inject'),
      ).length;
      const facts = [
        `Its users are ${kindBreakdown(kindsOf(users))}.`,
        `They sit in ${count(areas.length, 'part', 'parts')} of the app` +
          (lazy.length > 0
            ? `, including ${count(lazy.length, 'lazy-loaded route')}: ${listOf(lazy.map((r) => r.label))}.`
            : '.'),
      ];
      if (injecting === users.length) facts.push(`All of them inject it.`);
      else if (injecting > 0) facts.push(`${injecting} of them inject it.`);
      return {
        title,
        facts,
        whyItMatters:
          'A change to its public members or its behaviour can reach every one of these files. ' +
          'That is normal for a core service or a small shared component; it becomes a risk when the users rely on unrelated parts of it.',
        nextStep:
          `Before changing ${node?.name ?? 'it'}, look at which of its members each user calls, starting with the users listed in the evidence. ` +
          'If groups of users need different parts, splitting it narrows the reach of each change. If it is small and stable, nothing needs to change.',
        mapNodeId: first,
      };
    }
    case 'high-fan-out': {
      const dependencies = finding.evidencePaths.map((path) => path[1]!);
      const isComponent = node?.kind === 'component';
      return {
        title,
        facts: [`It uses ${kindBreakdown(kindsOf(dependencies))}.`],
        whyItMatters:
          'Each dependency is one more thing to set up or replace in a test, and a change in any of them can reach this file. ' +
          'Many dependencies can mean the file does several jobs.',
        nextStep: isComponent
          ? 'Check whether it does several jobs. A page that puts many child components together is often fine; logic that is not about this view can move into a service, and a repeated part of the template into a child component.'
          : 'Check whether it does several jobs that could live in separate services or functions, each with fewer dependencies.',
        mapNodeId: first,
      };
    }
  }
}
