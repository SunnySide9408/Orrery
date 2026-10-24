import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  EdgeKind,
  Finding,
  FindingCategory,
  GraphNode,
  SourceLocation,
} from '@orrery/contracts';
import { ExplorerState } from '../shell/explorer-state';
import {
  CATEGORY_ORDER,
  CATEGORY_TEXT,
  readFinding,
  SEVERITY_CLASS,
  SEVERITY_TEXT,
  type FindingReading,
} from './finding-text';

/** One "depends on" step of an evidence path, with where the code says so. */
interface Step {
  node: GraphNode;
  /** To the next node in the path; absent on the last node. */
  link?: { kinds: string; location: SourceLocation | undefined };
}

interface FindingCard {
  finding: Finding;
  reading: FindingReading;
  /** The DOM id; finding IDs hold paths, which make poor element IDs. */
  domId: string;
  paths: Step[][];
}

interface CategoryGroup {
  category: FindingCategory;
  heading: string;
  measures: string;
  cards: FindingCard[];
}

const EDGE_LABELS: Record<EdgeKind, string> = {
  import: 'import',
  'standalone-import': 'standalone import',
  'lazy-route': 'lazy route',
  inject: 'inject',
};

/**
 * Findings grouped by rule. Each one leads with what was found and why it
 * could matter; the rule, threshold, limits and the evidence path by path
 * (with the file and line of each relationship) are folded underneath, so
 * a reader can check it against the code. `#<finding id>` opens one finding.
 */
@Component({
  selector: 'app-findings-view',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block size-full overflow-y-auto' },
  template: `
    <div
      class="space-y-8 px-4 py-4"
      [class.max-w-4xl]="!state.focus()"
      [class.md:pr-[22rem]]="state.focus()"
    >
      <header>
        <h1 class="text-lg font-semibold">Findings ({{ total() }})</h1>
        <p class="mt-1 max-w-prose text-sm text-slate-300">
          Places worth a look, found from the static relationships between files. They are prompts
          to review, not defects: each one says what was found, why it could matter and what to
          check, with the evidence underneath.
          @if (unresolved() > 0) {
            {{ unresolved() }} unresolved {{ unresolved() === 1 ? 'import' : 'imports' }} may hide
            relationships that are not counted here.
          }
        </p>
        <dl class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-300">
          @for (severity of severities(); track severity) {
            <div class="flex items-baseline gap-1.5">
              <dt
                class="rounded px-1.5 py-0.5 font-medium uppercase"
                [class]="severityClass[severity]"
              >
                {{ severityText[severity].label }}
              </dt>
              <dd>{{ severityText[severity].meaning }}</dd>
            </div>
          }
        </dl>
      </header>

      @for (group of groups(); track group.category) {
        <section class="space-y-3" [attr.aria-labelledby]="'group-' + group.category">
          <div>
            <h2 [id]="'group-' + group.category" class="text-base font-semibold">
              {{ group.heading }} ({{ group.cards.length }})
            </h2>
            <p class="max-w-prose text-sm text-slate-400">{{ group.measures }}</p>
          </div>

          @for (card of group.cards; track card.finding.id) {
            @let r = card.reading;
            @let targeted = card.finding.id === fragment();
            <article
              class="scroll-mt-4 rounded-lg border p-4"
              [class.border-slate-800]="!targeted"
              [class.border-sky-400]="targeted"
              [id]="card.domId"
              [attr.aria-labelledby]="card.domId + '-title'"
              tabindex="-1"
              data-testid="finding"
            >
              <h3
                [id]="card.domId + '-title'"
                class="flex flex-wrap items-baseline gap-2 font-semibold"
              >
                <span
                  class="rounded px-1.5 py-0.5 text-xs font-medium uppercase"
                  [class]="severityClass[card.finding.severity]"
                  >{{ severityText[card.finding.severity].label }}</span
                >
                {{ r.title }}
              </h3>

              <!-- The title states the count; the facts add what the evidence shows. -->
              <ul class="mt-2 space-y-0.5 text-sm text-slate-200">
                @for (fact of r.facts; track $index) {
                  <li>{{ fact }}</li>
                }
              </ul>

              <dl class="mt-3 space-y-2 text-sm">
                <div>
                  <dt class="text-xs font-medium tracking-wider text-slate-400 uppercase">
                    Why it could matter
                  </dt>
                  <dd class="text-slate-200">{{ r.whyItMatters }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-medium tracking-wider text-slate-400 uppercase">
                    What to check
                  </dt>
                  <dd class="text-slate-200">{{ r.nextStep }}</dd>
                </div>
              </dl>

              <p class="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <a
                  routerLink=".."
                  [queryParams]="{ node: r.mapNodeId }"
                  class="rounded-md border border-sky-400/50 px-2 py-0.5 text-sky-100 hover:bg-sky-400/10 focus-visible:outline-2 focus-visible:outline-sky-400"
                  >Show in the map</a
                >
                <button
                  type="button"
                  [class]="inlineButtonClass"
                  (click)="state.select(r.mapNodeId)"
                >
                  Inspect here
                </button>
              </p>

              <details class="mt-3 rounded border border-slate-800 px-3 py-2" [open]="targeted">
                <summary class="cursor-pointer text-sm font-medium text-slate-200">
                  Evidence and rule ·
                  {{ card.paths.length }}
                  {{ card.paths.length === 1 ? 'path' : 'paths' }}
                </summary>
                <dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt class="text-slate-400">Analyser</dt>
                  <dd class="text-slate-200">{{ card.finding.explanation }}</dd>
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
                <p class="mt-3 text-xs text-slate-400">
                  Each step reads "depends on", with the kind of relationship and the line where the
                  code says so.
                </p>
                <ol class="mt-1 space-y-1 text-sm">
                  @for (path of card.paths; track $index) {
                    <li class="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                      @for (step of path; track $index) {
                        <button
                          type="button"
                          [class]="nodeClass"
                          [title]="step.node.path"
                          (click)="state.select(step.node.id)"
                        >
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
              </details>
            </article>
          }
        </section>
      }

      @if (clear().length > 0) {
        <section aria-labelledby="clear-heading" class="text-sm text-slate-300">
          <h2 id="clear-heading" class="text-base font-semibold text-slate-100">
            Checked, nothing found
          </h2>
          <ul class="mt-1 space-y-1">
            @for (category of clear(); track category) {
              <li>
                <span class="font-medium text-slate-200"
                  >{{ categoryText[category].heading }}:</span
                >
                none. {{ categoryText[category].measures }}
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class FindingsView {
  protected readonly state = inject(ExplorerState);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly fragment = toSignal(inject(ActivatedRoute).fragment, {
    initialValue: null,
  });

  /** Only the severities on this page need explaining. */
  protected readonly severities = computed(() =>
    (['warning', 'info'] as const).filter((severity) =>
      this.state.sample().result.findings.some((finding) => finding.severity === severity),
    ),
  );
  protected readonly severityClass = SEVERITY_CLASS;
  protected readonly severityText = SEVERITY_TEXT;
  protected readonly categoryText = CATEGORY_TEXT;
  protected readonly nodeClass =
    'rounded px-1 text-slate-100 hover:bg-slate-800 hover:underline focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly inlineButtonClass =
    'rounded px-1 text-slate-300 underline decoration-slate-500 underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly unresolved = computed(() => this.state.sample().result.unresolved.length);
  protected readonly total = computed(() => this.state.sample().result.findings.length);

  private readonly cards = computed<FindingCard[]>(() => {
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
    return result.findings.map((finding, i) => ({
      finding,
      reading: readFinding(finding, result, index),
      domId: `finding-${i}`,
      paths: finding.evidencePaths.map(toSteps),
    }));
  });

  protected readonly groups = computed<CategoryGroup[]>(() =>
    CATEGORY_ORDER.map((category) => ({
      category,
      ...CATEGORY_TEXT[category],
      cards: this.cards().filter((card) => card.finding.category === category),
    })).filter((group) => group.cards.length > 0),
  );

  /** Rules that ran and found nothing: an empty result is a result too. */
  protected readonly clear = computed(() =>
    CATEGORY_ORDER.filter((category) =>
      this.cards().every((card) => card.finding.category !== category),
    ),
  );

  constructor() {
    // A link to one finding scrolls to it and moves focus there, once it is drawn.
    effect(() => {
      const id = this.fragment();
      const card = this.cards().find((c) => c.finding.id === id);
      if (!card) return;
      afterNextRender(
        () => {
          // Scroll this view only: scrollIntoView would also scroll the shell and hide its header.
          const element = document.getElementById(card.domId);
          if (!element) return;
          const view = this.host.nativeElement;
          view.scrollTop +=
            element.getBoundingClientRect().top - view.getBoundingClientRect().top - 16;
          element.focus({ preventScroll: true });
        },
        { injector: this.injector },
      );
    });
  }
}
