import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import {
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
  type IsActiveMatchOptions,
} from '@angular/router';
import { KIND_STYLES } from '../renderer/kind-style';
import { ExplorerState } from './explorer-state';
import { Inspector } from './inspector';
import { Search } from './search';

/**
 * The frame around both views of a sample: header with search and view
 * switch, breadcrumbs with a way back, the inspector, and a live region that
 * announces selection changes to screen readers.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Inspector, Search],
  providers: [ExplorerState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex h-dvh flex-col overflow-hidden bg-slate-950 text-slate-100',
    '(document:keydown)': 'onDocumentKeydown($event)',
  },
  template: `
    @let sample = state.sample();
    @let f = state.focus();
    <header
      class="z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-800 px-4 py-2"
    >
      <a
        routerLink="/"
        class="text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        Orrery
      </a>
      <p class="text-sm text-slate-300">
        @if (sample.info.repository) {
          <a
            [href]="sample.info.repository"
            target="_blank"
            rel="noopener"
            [class]="linkClass + ' text-slate-100'"
            >{{ sample.info.name }}</a
          >
          <span class="text-slate-400"> · {{ sample.info.license }} · {{ stats() }}</span>
        } @else {
          <span class="text-slate-100">{{ sample.info.name }}</span>
          <span class="text-slate-400">
            · analysed in this browser · {{ stats() }} ·
            <a routerLink="/open" [class]="linkClass">report</a>
          </span>
        }
      </p>
      <app-search
        class="order-last w-full sm:order-none sm:ml-auto sm:w-72"
        [nodes]="sample.result.graph.nodes"
        [regions]="sample.result.graph.regions"
        (selected)="state.select($event)"
      />
      <a routerLink="/open" [class]="linkClass + ' text-sm text-slate-300'">Open a folder</a>
      <nav aria-label="View" class="flex rounded-md border border-slate-700 text-sm">
        <a
          routerLink="./"
          [routerLinkActiveOptions]="exactPath"
          routerLinkActive="bg-slate-700 text-white"
          ariaCurrentWhenActive="page"
          queryParamsHandling="preserve"
          [class]="viewLinkClass"
          >3D map</a
        >
        <a
          routerLink="./list"
          [routerLinkActiveOptions]="exactPath"
          routerLinkActive="bg-slate-700 text-white"
          ariaCurrentWhenActive="page"
          queryParamsHandling="preserve"
          [class]="viewLinkClass"
          >List</a
        >
        <a
          routerLink="./findings"
          [routerLinkActiveOptions]="exactPath"
          routerLinkActive="bg-slate-700 text-white"
          ariaCurrentWhenActive="page"
          queryParamsHandling="preserve"
          [class]="viewLinkClass"
          >Findings
          <span class="tabular-nums text-slate-400">{{ state.findings().length }}</span></a
        >
      </nav>
    </header>

    <div class="flex items-center gap-3 border-b border-slate-800/60 px-4 py-1.5 text-sm">
      <nav aria-label="Breadcrumbs" class="min-w-0 flex-1">
        <ol class="flex flex-wrap items-center gap-1 text-slate-300">
          <li>
            @if (f) {
              <button type="button" [class]="crumbClass" (click)="state.select(null)">
                Overview
              </button>
            } @else {
              <span aria-current="location" class="px-1 text-slate-100">Overview</span>
            }
          </li>
          @for (region of state.regionTrail(); track region.id) {
            <li aria-hidden="true" class="text-slate-500">/</li>
            <li class="px-1">
              {{ region.label }}
              @if (region.kind === 'lazy-route') {
                <span class="rounded bg-indigo-500/20 px-1 text-xs text-indigo-200">lazy</span>
              }
            </li>
          }
          @if (f) {
            <li aria-hidden="true" class="text-slate-500">/</li>
            <li aria-current="location" class="px-1 font-medium" [style.color]="kindColor()">
              {{ f.node.name }}
            </li>
          }
        </ol>
      </nav>
      <button
        type="button"
        [class]="crumbClass + ' border border-slate-700'"
        (click)="state.reset()"
      >
        Reset view
      </button>
    </div>

    <div class="relative min-h-0 flex-1">
      <main class="absolute inset-0">
        <router-outlet />
      </main>
      @if (f) {
        <aside
          class="absolute top-3 right-3 bottom-3 w-80 max-w-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/95 p-4 shadow-xl backdrop-blur"
          aria-label="Inspector"
        >
          <app-inspector
            [focus]="f"
            (selected)="state.select($event)"
            (impactToggled)="state.setShowImpact($event)"
            (closed)="state.select(null)"
          />
        </aside>
      }
    </div>

    <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
  `,
})
export class Shell {
  protected readonly state = inject(ExplorerState);
  private readonly search = viewChild.required(Search, { read: ElementRef });

  protected readonly stats = computed(() => {
    const { graph, unresolved } = this.state.sample().result;
    const files = graph.nodes.length;
    const relationships = graph.edges.length;
    return `${files} files · ${relationships} relationships · ${unresolved.length} unresolved imports`;
  });

  protected readonly kindColor = computed(() => {
    const node = this.state.focus()?.node;
    return node ? KIND_STYLES[node.kind].color : null;
  });

  protected readonly announcement = computed(() => {
    const f = this.state.focus();
    if (!f) return `Overview of ${this.state.sample().info.name}.`;
    const users = f.dependants.length;
    const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;
    const impact = f.showImpact
      ? ` Showing ${files(f.impactCount)} potentially affected, in ${f.impactWaves.length} steps.`
      : '';
    return `Selected ${f.node.name}, ${KIND_STYLES[f.node.kind].label}. Used directly by ${files(users)}.${impact}`;
  });

  protected readonly exactPath: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };
  protected readonly linkClass =
    'underline decoration-slate-500 underline-offset-2 hover:decoration-slate-200 focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly viewLinkClass =
    'px-3 py-1 text-slate-300 first:rounded-l-md last:rounded-r-md hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly crumbClass =
    'rounded px-1.5 py-0.5 text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400';

  protected onDocumentKeydown(event: KeyboardEvent): void {
    const typing =
      event.target instanceof HTMLElement && event.target.closest('input, textarea, select');
    if (event.key === 'Escape') {
      // One level up: from a node back to the overview.
      this.state.select(null);
    } else if (event.key === '/' && !typing) {
      event.preventDefault();
      (this.search().nativeElement as HTMLElement).querySelector('input')?.focus();
    }
  }
}
