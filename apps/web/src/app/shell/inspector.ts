import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Finding, ProviderScope } from '@orrery/contracts';
import type { GraphIndex } from '@orrery/graph-core';
import { findingTitle, SEVERITY_CLASS, SEVERITY_TEXT } from '../findings/finding-text';
import { KIND_STYLES } from '../renderer/kind-style';
import type { Focus } from './focus';

export const SCOPE_LABELS: Record<ProviderScope, string> = {
  root: 'root',
  platform: 'platform',
  any: 'any (one per lazy injector)',
  application: 'application config',
  module: 'NgModule',
  route: 'route',
  component: 'component',
};

@Component({
  selector: 'app-inspector',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @let f = focus();
    <header class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-medium uppercase tracking-wider" [style.color]="style().color">
          {{ style().label }}
        </p>
        <h2 class="text-xl font-semibold break-all">{{ f.node.name }}</h2>
      </div>
      <button
        type="button"
        class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400"
        (click)="closed.emit()"
        aria-label="Close inspector and return to overview"
      >
        ✕
      </button>
    </header>

    <dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt class="text-slate-400">Path</dt>
      <dd class="font-mono text-xs break-all text-slate-200">{{ f.node.path }}</dd>
      <dt class="text-slate-400">Region</dt>
      <dd>
        {{ f.region?.label ?? 'unknown' }}
        @if (f.region?.kind === 'lazy-route') {
          <span class="ml-1 rounded bg-indigo-500/20 px-1 text-xs text-indigo-200">lazy</span>
        }
      </dd>
      <dt class="text-slate-400">Size</dt>
      <dd>{{ f.node.metrics.linesOfCode }} lines</dd>
      @if (f.node.providers; as providers) {
        <dt class="text-slate-400">Provided</dt>
        <dd>
          <ul class="space-y-0.5">
            @for (site of providers; track $index) {
              <li>
                <span class="rounded bg-emerald-400/15 px-1 text-xs text-emerald-200">{{
                  scopeLabels[site.scope]
                }}</span>
                <span class="ml-1 font-mono text-xs break-all text-slate-400"
                  >{{ site.location.path }}:{{ site.location.line }}</span
                >
              </li>
            }
          </ul>
        </dd>
      }
    </dl>

    @if (f.findings.length > 0) {
      <section class="mt-4" aria-labelledby="node-findings-heading">
        <h3 id="node-findings-heading" class="text-sm font-semibold text-slate-200">
          Findings ({{ f.findings.length }})
        </h3>
        <ul class="mt-1 space-y-1">
          @for (finding of f.findings; track finding.id) {
            <li class="text-sm">
              <span
                class="mr-1 rounded px-1 text-xs uppercase"
                [class]="severityClass[finding.severity]"
                [title]="severityText[finding.severity].meaning"
                >{{ severityText[finding.severity].label }}</span
              >
              <a
                routerLink="./findings"
                [fragment]="finding.id"
                queryParamsHandling="preserve"
                [class]="inlineLinkClass"
                >{{ title(finding) }}</a
              >
            </li>
          }
        </ul>
      </section>
    }

    <p class="mt-4 rounded bg-amber-400/10 p-3 text-sm text-amber-100">
      Used directly by <strong>{{ f.dependants.length }}</strong>
      {{ f.dependants.length === 1 ? 'file' : 'files' }}
      @if (f.dependantLazyRoutes.length > 0) {
        across <strong>{{ f.dependantLazyRoutes.length }}</strong> lazy
        {{ f.dependantLazyRoutes.length === 1 ? 'route' : 'routes' }}
      }
    </p>

    <section class="mt-4" aria-labelledby="impact-heading">
      <h3 id="impact-heading" class="text-sm font-semibold text-amber-200">
        Impact ({{ f.impactCount }})
      </h3>
      <p class="text-xs text-slate-400">
        @if (f.impactCount === 0) {
          Nothing depends on this file, according to static relationships.
        } @else {
          {{ f.impactCount }} {{ f.impactCount === 1 ? 'file is' : 'files are' }} potentially
          affected by a change, according to static relationships, in {{ f.impactWaves.length }}
          {{ f.impactWaves.length === 1 ? 'step' : 'steps' }}.
        }
      </p>
      @if (f.impactCount > 0) {
        <button
          type="button"
          class="mt-1 rounded border border-amber-400/40 px-2 py-0.5 text-sm text-amber-100 hover:bg-amber-400/10 focus-visible:outline-2 focus-visible:outline-sky-400"
          [attr.aria-pressed]="f.showImpact"
          (click)="impactToggled.emit(!f.showImpact)"
        >
          {{ f.showImpact ? 'Show direct links only' : 'Show full impact' }}
        </button>
      }
      @if (f.showImpact) {
        @for (wave of f.impactWaves; track $index) {
          <h4 class="mt-2 text-xs font-medium text-slate-300">
            Step {{ $index + 1 }} · {{ wave.length }} {{ wave.length === 1 ? 'file' : 'files' }}
          </h4>
          <ul class="space-y-0.5">
            @for (entry of wave; track entry.node.id) {
              <li>
                <button type="button" [class]="linkClass" (click)="selected.emit(entry.node.id)">
                  {{ entry.node.name }}
                  @if (entry.path.length > 2) {
                    <span class="block text-xs text-slate-400">via {{ via(entry.path) }}</span>
                  }
                </button>
              </li>
            }
          </ul>
        }
      }
    </section>

    <section class="mt-4" aria-labelledby="dependants-heading">
      <h3 id="dependants-heading" class="text-sm font-semibold text-amber-200">
        Dependants ({{ f.dependants.length }})
      </h3>
      <p class="text-xs text-slate-400">
        Potentially affected by a change, according to static relationships.
      </p>
      <ul class="mt-1 space-y-0.5">
        @for (node of f.dependants; track node.id) {
          <li>
            <button type="button" [class]="linkClass" (click)="selected.emit(node.id)">
              {{ node.name }}
              @if (f.injected.has(node.id)) {
                <span class="ml-1 rounded bg-slate-700 px-1 text-xs text-slate-200">injects</span>
              }
            </button>
          </li>
        } @empty {
          <li class="text-sm text-slate-500">None found</li>
        }
      </ul>
    </section>

    <section class="mt-4" aria-labelledby="imports-heading">
      <h3 id="imports-heading" class="text-sm font-semibold text-sky-200">
        Depends on ({{ f.dependencies.length }})
      </h3>
      <ul class="mt-1 space-y-0.5">
        @for (node of f.dependencies; track node.id) {
          <li>
            <button type="button" [class]="linkClass" (click)="selected.emit(node.id)">
              {{ node.name }}
              @if (f.injected.has(node.id)) {
                <span class="ml-1 rounded bg-slate-700 px-1 text-xs text-slate-200">injected</span>
              }
            </button>
          </li>
        } @empty {
          <li class="text-sm text-slate-500">None found</li>
        }
      </ul>
    </section>
  `,
})
export class Inspector {
  readonly focus = input.required<Focus>();
  /** Lets finding titles name files. */
  readonly index = input.required<GraphIndex>();
  readonly selected = output<string>();
  readonly impactToggled = output<boolean>();
  readonly closed = output();

  protected readonly style = computed(() => KIND_STYLES[this.focus().node.kind]);
  protected readonly scopeLabels = SCOPE_LABELS;
  protected readonly severityClass = SEVERITY_CLASS;
  protected readonly severityText = SEVERITY_TEXT;
  protected title(finding: Finding): string {
    return findingTitle(finding, this.index());
  }
  protected readonly inlineLinkClass =
    'text-slate-200 underline decoration-slate-500 underline-offset-2 hover:decoration-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400';

  /** The files between a transitive dependant and the selection. */
  protected via(path: readonly { name: string }[]): string {
    return path
      .slice(1, -1)
      .map((node) => node.name)
      .join(' → ');
  }
  protected readonly linkClass =
    'w-full rounded px-1.5 py-0.5 text-left text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400';
}
