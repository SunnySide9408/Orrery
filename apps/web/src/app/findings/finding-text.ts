import type { Finding } from '@orrery/contracts';

/** A short title for a finding, from its category and evidence. */
export function findingTitle(finding: Finding): string {
  const count =
    finding.category === 'cycle' ? finding.nodeIds.length : finding.evidencePaths.length;
  const files = `${count} ${count === 1 ? 'file' : 'files'}`;
  switch (finding.category) {
    case 'cycle':
      return `Dependency cycle of ${files}`;
    case 'high-fan-in':
      return `High fan-in: used directly by ${files}, not counting specs`;
    case 'high-fan-out':
      return `High fan-out: depends directly on ${files}`;
  }
}

/** Badge colours per severity, readable on the dark panels. */
export const SEVERITY_CLASS: Record<Finding['severity'], string> = {
  warning: 'bg-amber-400/15 text-amber-200',
  info: 'bg-sky-400/15 text-sky-200',
};
