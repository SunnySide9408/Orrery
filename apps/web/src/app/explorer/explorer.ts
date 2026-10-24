import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NODE_KINDS } from '@orrery/contracts';
import { OverviewPanel } from '../overview/overview-panel';
import { KindMarker } from '../renderer/kind-marker';
import { KIND_STYLES } from '../renderer/kind-style';
import type { GraphicsQuality, GraphicsSetting } from '../renderer/quality';
import { SYSTEM_RENDERER, type SystemRenderer } from '../renderer/system-renderer';
import { ExplorerState } from '../shell/explorer-state';

/** Width of the inspector panel (w-80 plus its margin); on narrow screens it covers the map anyway. */
function inspectorInset(): number {
  return window.innerWidth >= 768 ? 344 : 0;
}

/** The visitor's graphics choice, kept per browser. Storage can be missing or blocked. */
const GRAPHICS_KEY = 'orrery.graphics';
function storedGraphics(): GraphicsSetting {
  try {
    const value = localStorage.getItem(GRAPHICS_KEY);
    return value === 'full' || value === 'lite' ? value : 'auto';
  } catch {
    return 'auto';
  }
}
function storeGraphics(value: GraphicsQuality): void {
  try {
    localStorage.setItem(GRAPHICS_KEY, value);
  } catch {
    // Not remembered; the choice still applies until the page closes.
  }
}

/** Whether the overview panel is hidden, kept per browser like the graphics choice. */
const OVERVIEW_KEY = 'orrery.overview';
function storedOverviewShown(): boolean {
  try {
    return localStorage.getItem(OVERVIEW_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

/** The 3D map. Angular decides what is selected and related; the renderer only draws it. */
@Component({
  selector: 'app-explorer',
  imports: [RouterLink, KindMarker, OverviewPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block size-full overflow-hidden' },
  template: `
    <div #scene class="absolute inset-0" aria-hidden="true"></div>
    <p class="sr-only">{{ summary() }}</p>

    @if (webglFailed()) {
      <div class="absolute inset-0 grid place-items-center p-6">
        <p class="max-w-md text-center text-slate-300">
          This browser could not start the 3D view (WebGL is unavailable).
          <a
            routerLink="list"
            queryParamsHandling="preserve"
            class="text-sky-300 underline underline-offset-2"
            >The list view</a
          >
          shows the same information.
        </p>
      </div>
    } @else if (!state.focus()) {
      @if (overviewShown()) {
        <section
          data-keep-clear
          class="absolute top-3 left-4 max-h-[45%] w-[22rem] sm:max-h-[calc(100%-13rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-md bg-slate-950/85 p-3 backdrop-blur-sm"
          aria-label="Overview"
        >
          <app-overview-panel
            [sample]="sample()"
            (selected)="state.select($event)"
            (suggested)="state.selectByName(sample().info.suggestedNode)"
            (hidden)="setOverviewShown(false)"
          />
        </section>
      } @else {
        <button
          type="button"
          data-keep-clear
          class="absolute top-3 left-4 rounded-md border border-slate-700 bg-slate-950/85 px-2 py-1 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400"
          (click)="setOverviewShown(true)"
        >
          Show overview
        </button>
      }
    }

    <section
      data-keep-clear
      class="pointer-events-none absolute bottom-3 left-4 rounded-md bg-slate-950/85 p-2 text-xs text-slate-200"
      aria-label="Legend"
    >
      <ul class="grid grid-cols-2 gap-x-4 gap-y-0.5">
        @for (kind of legend(); track kind.id) {
          <li class="flex items-center gap-1.5" [title]="kind.style.familyLabel">
            <app-kind-marker [kind]="kind.id" />
            {{ kind.style.label }}
          </li>
        }
      </ul>
      <p class="mt-1.5 text-slate-300">
        Planet size: lines of code. Each region has its own star. Dashed ring: lazy route.
      </p>
      @if (quality(); as q) {
        <p class="mt-1 flex items-center gap-2 text-slate-300">
          <button
            type="button"
            class="pointer-events-auto rounded border border-slate-600 px-1.5 py-0.5 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400"
            [attr.aria-pressed]="q.quality === 'lite'"
            (click)="toggleLite()"
          >
            Lite graphics: {{ q.quality === 'lite' ? 'on' : 'off' }}
          </button>
          @if (q.automatic && q.quality === 'lite') {
            <span>Turned on to keep the map smooth on this device.</span>
          }
        </p>
      }
      @if (state.focus(); as f) {
        <p class="mt-1 text-slate-300">
          <span class="text-amber-300">Amber</span> lines: files that depend on it.
          @if (!f.showImpact) {
            <span class="text-sky-300">Blue</span> lines: what it depends on.
          }
        </p>
      }
    </section>
  `,
})
export class Explorer {
  protected readonly state = inject(ExplorerState);
  private readonly createRenderer = inject(SYSTEM_RENDERER);
  private readonly sceneHost = viewChild.required<ElementRef<HTMLElement>>('scene');
  /** A plain field, not a signal: renderer objects never enter Angular state. */
  private renderer: SystemRenderer | null = null;

  protected readonly sample = this.state.sample;
  protected readonly webglFailed = signal(false);
  protected readonly overviewShown = signal(storedOverviewShown());
  /** What the renderer reports, so the toggle shows the quality really in use. */
  protected readonly quality = signal<{ quality: GraphicsQuality; automatic: boolean } | null>(
    null,
  );
  private readonly route = inject(ActivatedRoute);

  protected readonly legend = computed(() =>
    NODE_KINDS.filter((kind) =>
      this.sample().result.graph.nodes.some((node) => node.kind === kind),
    ).map((kind) => ({ id: kind, style: KIND_STYLES[kind] })),
  );

  /** What the canvas shows, for screen readers. */
  protected readonly summary = computed(() => {
    const { graph } = this.sample().result;
    const lazy = graph.regions.filter((region) => region.kind === 'lazy-route').length;
    return `3D map of ${graph.nodes.length} files in ${graph.regions.length} regions, ${lazy} of them lazy-loaded routes. Use the search or the list view to explore the same information as text.`;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      let renderer: SystemRenderer;
      try {
        renderer = this.createRenderer();
        renderer.initialize(this.sceneHost().nativeElement, {
          nodePicked: (id) => this.state.select(id),
          qualityChanged: (quality, automatic) => this.quality.set({ quality, automatic }),
        });
      } catch (error) {
        console.error(error);
        this.webglFailed.set(true);
        return;
      }
      renderer.setQuality(storedGraphics());
      // `?fps` shows the frame-rate readout, for performance checks.
      renderer.setFrameRateVisible(this.route.snapshot.queryParamMap.has('fps'));

      // Before the graph, so a reduced-motion visitor never sees the opening reveal.
      const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const onMotionChange = () => renderer.setReducedMotion(motion?.matches ?? false);
      onMotionChange();
      motion?.addEventListener('change', onMotionChange);

      this.renderer = renderer;
      this.applyGraph();

      destroyRef.onDestroy(() => {
        motion?.removeEventListener('change', onMotionChange);
        renderer.dispose();
        this.renderer = null;
      });
    });

    // A different sample in the same route (e.g. /realworld to /perf) replaces the graph.
    effect(() => {
      this.sample();
      untracked(() => this.applyGraph());
    });
    effect(() => this.applyFocus());
    effect(() => {
      // "Reset view": back to the overview camera, whatever is selected.
      if (this.state.resets() > 0) untracked(() => this.renderer?.focusNode(null));
    });
  }

  protected setOverviewShown(shown: boolean): void {
    this.overviewShown.set(shown);
    try {
      if (shown) localStorage.removeItem(OVERVIEW_KEY);
      else localStorage.setItem(OVERVIEW_KEY, 'hidden');
    } catch {
      // Not remembered; the choice still applies until the page closes.
    }
  }

  protected toggleLite(): void {
    const next = this.quality()?.quality === 'lite' ? 'full' : 'lite';
    storeGraphics(next);
    this.renderer?.setQuality(next);
  }

  private shownSample: unknown = null;

  /** Sends the sample to the renderer once per sample, then the current selection. */
  private applyGraph(): void {
    const sample = this.sample();
    const renderer = this.renderer;
    if (!renderer || sample === this.shownSample) return;
    this.shownSample = sample;
    renderer.setGraph(sample.result.graph, sample.layout);
    this.applyFocus();
  }

  /** Pushes the current selection across the renderer boundary. */
  private applyFocus(): void {
    const focus = this.state.focus();
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.setRightInset(focus ? inspectorInset() : 0);
    // Highlight first: the camera frames the focused node with its highlighted neighbours.
    renderer.highlightNodes(focus?.litNodeIds ?? new Set(), focus?.waves);
    renderer.focusNode(focus?.node.id ?? null);
    // The frame-rate test map draws every edge with nothing selected: the worst case.
    const allEdges =
      !focus && this.sample().info.id === 'perf'
        ? new Set(this.sample().result.graph.edges.map((edge) => edge.id))
        : null;
    renderer.showEdges(allEdges ?? focus?.edgeIds ?? new Set(), focus?.waves);
  }
}
