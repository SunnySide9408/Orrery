import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SEVERITY_CLASS, SEVERITY_TEXT } from '../findings/finding-text';
import type { LoadedSample } from '../samples/loaded-sample';
import { count, listOf } from '../shell/counts';
import { SCOPE_LABELS } from '../shell/inspector';
import { describeOverview } from './overview';

/**
 * What the analysed project contains, shown on the map while nothing is
 * selected: the first answer to "what is in this codebase?". Short lines
 * first; what each number counts is one click away.
 */
@Component({
  selector: 'app-overview-panel',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let o = overview();
    @let info = sample().info;
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="font-semibold text-slate-100">{{ info.name }}</h2>
        <p class="text-xs text-slate-400">{{ origin() }}</p>
      </div>
      <button type="button" [class]="buttonClass" (click)="hidden.emit()">Hide</button>
    </header>

    <dl class="mt-3 space-y-2 text-sm">
      <div>
        <dt class="text-xs font-medium tracking-wider text-slate-400 uppercase">What’s in it</dt>
        <dd class="text-slate-200">
          {{ count(o.files, 'source file') }}: {{ o.kinds.join(', ') }}.
          @if (o.specs > 0) {
            <span class="text-slate-400">Plus {{ count(o.specs, 'spec') }}, drawn as moons.</span>
          }
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium tracking-wider text-slate-400 uppercase">
          Parts of the app
        </dt>
        <dd class="text-slate-200">
          {{ count(o.regions, 'part') }}.
          @if (o.lazyRoutes.length > 0) {
            {{ o.lazyRoutes.length }} lazy-loaded: {{ listOf(o.lazyRoutes) }}.
          } @else {
            None is lazy-loaded.
          }
        </dd>
      </div>
      <div>
        <dt class="text-xs font-medium tracking-wider text-slate-400 uppercase">
          Dependency injection
        </dt>
        <dd class="text-slate-200">
          {{ count(o.injections, 'injection') }}.
          @if (o.provided.length > 0) {
            Provided: {{ providedText() }}.
          }
        </dd>
      </div>
      @if (o.mostUsed.length > 0) {
        <div>
          <dt class="text-xs font-medium tracking-wider text-slate-400 uppercase">Most used</dt>
          <dd>
            <ul class="flex flex-wrap gap-x-3 gap-y-0.5">
              @for (entry of o.mostUsed; track entry.node.id) {
                <li>
                  <button type="button" [class]="nodeClass" (click)="selected.emit(entry.node.id)">
                    {{ entry.node.name }}
                  </button>
                  <span class="text-xs text-slate-400"> {{ count(entry.users, 'user') }}</span>
                </li>
              }
            </ul>
          </dd>
        </div>
      }
      <div>
        <dt class="text-xs font-medium tracking-wider text-slate-400 uppercase">
          Worth a look ({{ o.findings.length }})
        </dt>
        <dd>
          @if (o.findings.length === 0) {
            <p class="text-slate-300">No dependency cycles, and no file is unusually connected.</p>
          } @else {
            <ul class="space-y-1">
              @for (entry of topFindings(); track entry.finding.id) {
                <li class="flex items-baseline gap-1.5">
                  <span
                    class="shrink-0 rounded px-1 text-[0.65rem] uppercase"
                    [class]="severityClass[entry.finding.severity]"
                    [title]="severityText[entry.finding.severity].meaning"
                    >{{ severityText[entry.finding.severity].label }}</span
                  >
                  <a routerLink="findings" [fragment]="entry.finding.id" [class]="linkClass">{{
                    entry.title
                  }}</a>
                </li>
              }
            </ul>
            @if (o.findings.length > topFindings().length) {
              <a routerLink="findings" [class]="linkClass + ' mt-1 inline-block text-xs'"
                >All {{ o.findings.length }} findings</a
              >
            }
          }
        </dd>
      </div>
    </dl>

    <p class="mt-3 text-xs text-slate-400">
      Static analysis only: links used only in templates or decided at runtime are not seen.
      @if (o.unresolved > 0) {
        {{ count(o.unresolved, 'import') }} could not be resolved and may hide more.
      }
    </p>

    <details class="mt-2 text-xs text-slate-300">
      <summary class="cursor-pointer text-slate-300 hover:text-white">What these count</summary>
      <ul class="mt-1 list-disc space-y-1 pl-4">
        <li>
          <strong>Source files</strong> are the <code>.ts</code> files read, sorted into kinds by
          their Angular decorator or function.
        </li>
        <li>
          <strong>Parts</strong> are folders and lazy-loaded routes: each one is a star with its
          planets. Code in a lazy-loaded part is downloaded only when someone opens that route.
        </li>
        <li>
          <strong>Injections</strong> are places where a file asks dependency injection for one of
          the project's own services or tokens, through <code>inject()</code> or a constructor.
          "Provided" says where the injectable is registered: root is one instance for the whole
          app.
        </li>
        <li>
          <strong>Users</strong> of a file are the files that use it directly, not counting specs. A
          high count means a change there can reach many files; it is not a problem in itself.
        </li>
        <li>
          <strong>Worth a look</strong> lists the findings: dependency loops and files at the top of
          the project for users or dependencies. They are prompts to review, not defects.
        </li>
      </ul>
    </details>

    <p class="mt-3 border-t border-slate-800 pt-2 text-sm text-slate-300">
      @if (suggestionListed()) {
        Click a planet to inspect it, or one of the most used files above.
      } @else {
        Click a planet to inspect it, or start with
        <button type="button" [class]="nodeClass + ' text-amber-300'" (click)="suggested.emit()">
          {{ info.suggestedNode }}</button
        >.
      }
      Drag to orbit, scroll to zoom, Esc to go back.
    </p>
  `,
})
export class OverviewPanel {
  readonly sample = input.required<LoadedSample>();
  readonly selected = output<string>();
  readonly suggested = output();
  readonly hidden = output();

  protected readonly overview = computed(() =>
    describeOverview(this.sample().result, this.sample().index),
  );
  /** The suggested first click is usually one of the most used files; then it is not repeated. */
  protected readonly suggestionListed = computed(() =>
    this.overview().mostUsed.some((entry) => entry.node.name === this.sample().info.suggestedNode),
  );
  protected readonly topFindings = computed(() => this.overview().findings.slice(0, 3));
  protected readonly providedText = computed(() =>
    this.overview()
      .provided.map(({ scope, count }) => `${count} in ${SCOPE_LABELS[scope]}`)
      .join(', '),
  );
  /** Keeps the demo apart from a visitor's own project. */
  protected readonly origin = computed(() => {
    const info = this.sample().info;
    if (info.repository)
      return 'Demo: an open-source app, analysed ahead of time by the same analyser that reads your folders.';
    if (info.id === 'perf') return 'Generated test map, not a real project.';
    return 'Your folder, analysed in this browser. Nothing was uploaded.';
  });

  protected readonly count = count;
  protected readonly listOf = listOf;
  protected readonly severityClass = SEVERITY_CLASS;
  protected readonly severityText = SEVERITY_TEXT;
  protected readonly buttonClass =
    'pointer-events-auto shrink-0 rounded px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly nodeClass =
    'rounded text-slate-100 underline decoration-slate-500 underline-offset-2 hover:decoration-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly linkClass =
    'text-slate-200 underline decoration-slate-500 underline-offset-2 hover:decoration-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400';
}
