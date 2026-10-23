import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { EdgeKind, Finding, GraphNode, SourceLocation } from '@orrery/contracts';
import { ExplorerState } from '../shell/explorer-state';
import { findingTitle, SEVERITY_CLASS } from './finding-text';

/** One "depends on" step of an evidence path, with where the code says so. */
interface Step {
  node: GraphNode;
  /** To the next node in the path; absent on the last node. */
  link?: { kinds: string; location: SourceLocation | undefined };
}

interface FindingCard {
  finding: Finding;
  title: string;
  paths: Step[][];
}

const EDGE_LABELS: Record<EdgeKind, string> = {
  import: 'import',
  'standalone-import': 'standalone import',
  'lazy-route': 'lazy route',
  inject: 'inject',
};

/**
 * Every finding with its rule, threshold, limits and evidence. Each evidence
 * path is shown step by step with the file and line of each relationship, so
 * a reader can check the finding against the code.
 */
@Component({
  selector: 'app-findings-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block size-full overflow-y-auto' },
  template: `
    <div
      class="space-y-6 px-4 py-4"
      [class.max-w-4xl]="!state.focus()"
      [class.md:pr-[22rem]]="state.focus()"
    >
      <header>
        <h1 class="text-lg font-semibold">Findings ({{ cards().length }})</h1>
        <p class="mt-1 max-w-prose text-sm text-slate-300">
          Review signals computed from static relationships between files. They point at places
          worth a look, not at defects.
          @if (unresolved() > 0) {
            {{ unresolved() }} unresolved {{ unresolved() === 1 ? 'import' : 'imports' }} may hide
            relationships that are not counted here.
          }
        </p>
      </header>

      @for (card of cards(); track card.finding.id) {
        <article
          class="rounded-lg border border-slate-800 p-4"
          [attr.aria-labelledby]="'finding-' + $index"
          data-testid="finding"
        >
          <h2 [id]="'finding-' + $index" class="flex flex-wrap items-baseline gap-2 font-semibold">
            <span
              class="rounded px-1.5 py-0.5 text-xs font-medium uppercase"
              [class]="severityClass[card.finding.severity]"
              >{{ card.finding.severity }}</span
            >
            {{ card.title }}
          </h2>
          <p class="mt-2 text-sm text-slate-200">{{ card.finding.explanation }}</p>

          <dl class="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt class="text-slate-400">Rule</dt>
            <dd class="text-slate-200">{{ card.finding.rule }}</dd>
            <dt class="text-slate-400">Threshold</dt>
            <dd class="text-slate-200">
              {{
                card.finding.threshold === null
                  ? 'None: every cycle is reported'
                  : card.finding.threshold + ' files'
              }}
            </dd>
            <dt class="text-slate-400">Limits</dt>
            <dd class="text-slate-300">{{ card.finding.limits }}</dd>
          </dl>

          <h3 class="mt-3 text-sm font-semibold text-slate-200">
            Evidence ({{ card.paths.length }} {{ card.paths.length === 1 ? 'path' : 'paths' }})
          </h3>
          <ol class="mt-1 space-y-1 text-sm">
            @for (path of card.paths; track $index) {
              <li class="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                @for (step of path; track $index) {
                  <button type="button" [class]="nodeClass" (click)="state.select(step.node.id)">
                    {{ step.node.name }}
                  </button>
                  @if (step.link; as link) {
                    <span class="text-slate-500" aria-hidden="true">→</span>
                    <span class="font-mono text-xs text-slate-400">
                      <span class="sr-only">depends on, by</span>
                      {{ link.kinds }}
                      @if (link.location; as at) {
                        <!-- Evidence is usually in the dependant itself; then the line is enough. -->
                        @if (at.path === step.node.path) {
                          · line {{ at.line }}
                        } @else {
                          · {{ at.path }}:{{ at.line }}
                        }
                      }
                    </span>
                    <span class="text-slate-500" aria-hidden="true">→</span>
                  }
                }
              </li>
            }
          </ol>
        </article>
      } @empty {
        <p class="rounded-lg border border-slate-800 p-4 text-sm text-slate-300">
          No findings: no dependency cycles, and no file at or above the fan-in or fan-out
          threshold.
        </p>
      }
    </div>
  `,
})
export class FindingsView {
  protected readonly state = inject(ExplorerState);
  protected readonly severityClass = SEVERITY_CLASS;
  protected readonly nodeClass =
    'rounded px-1 text-slate-100 hover:bg-slate-800 hover:underline focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly unresolved = computed(() => this.state.sample().result.unresolved.length);

  protected readonly cards = computed<FindingCard[]>(() => {
    const { result, index } = this.state.sample();
    const toSteps = (path: readonly string[]): Step[] =>
      path.map((id, i) => {
        const node = index.node(id)!;
        const next = path[i + 1];
        if (next === undefined) return { node };
        const edges = index.outgoing(id).filter((edge) => edge.targetId === next);
        return {
          node,
          link: {
            kinds: edges.map((edge) => EDGE_LABELS[edge.kind]).join(', '),
            location: edges[0]?.evidence[0],
          },
        };
      });
    return result.findings.map((finding) => ({
      finding,
      title: findingTitle(finding),
      paths: finding.evidencePaths.map(toSteps),
    }));
  });
}
