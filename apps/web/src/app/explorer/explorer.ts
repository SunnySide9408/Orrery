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
import { RouterLink } from '@angular/router';
import { NODE_KINDS } from '@orrery/contracts';
import { KIND_STYLES } from '../renderer/kind-style';
import { SYSTEM_RENDERER, type SystemRenderer } from '../renderer/system-renderer';
import { ExplorerState } from '../shell/explorer-state';

/** Width of the inspector panel (w-80 plus its margin); on narrow screens it covers the map anyway. */
function inspectorInset(): number {
  return window.innerWidth >= 768 ? 344 : 0;
}

/** The 3D map. Angular decides what is selected and related; the renderer only draws it. */
@Component({
  selector: 'app-explorer',
  imports: [RouterLink],
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
      <p
        class="pointer-events-none absolute top-3 left-4 max-w-xs rounded-md bg-slate-950/85 p-2 text-sm text-slate-300"
      >
        Each ring is a part of the app; dashed rings are lazy-loaded routes. Click a planet to
        inspect it, or try
        <button
          type="button"
          class="pointer-events-auto text-amber-300 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-400"
          (click)="state.selectByName(sample().info.suggestedNode)"
        >
          {{ sample().info.suggestedNode }}</button
        >. Drag to orbit, scroll to zoom, Esc to go back.
      </p>
    }

    <section
      class="pointer-events-none absolute bottom-3 left-4 rounded-md bg-slate-950/85 p-2 text-xs text-slate-200"
      aria-label="Legend"
    >
      <ul class="grid grid-cols-2 gap-x-4 gap-y-0.5">
        @for (kind of legend(); track kind.label) {
          <li class="flex items-center gap-1.5">
            <span class="size-2.5 rounded-full" [style.background]="kind.color"></span>
            {{ kind.label }}
          </li>
        }
      </ul>
      <p class="mt-1.5 text-slate-300">Planet size: lines of code. Dashed ring: lazy route.</p>
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

  protected readonly legend = computed(() =>
    NODE_KINDS.filter((kind) =>
      this.sample().result.graph.nodes.some((node) => node.kind === kind),
    ).map((kind) => KIND_STYLES[kind]),
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
        });
      } catch (error) {
        console.error(error);
        this.webglFailed.set(true);
        return;
      }
      const { result, layout } = this.sample();
      renderer.setGraph(result.graph, layout);

      const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
      const onMotionChange = () => renderer.setReducedMotion(motion?.matches ?? false);
      onMotionChange();
      motion?.addEventListener('change', onMotionChange);

      this.renderer = renderer;
      this.applyFocus();

      destroyRef.onDestroy(() => {
        motion?.removeEventListener('change', onMotionChange);
        renderer.dispose();
        this.renderer = null;
      });
    });

    effect(() => this.applyFocus());
    effect(() => {
      // "Reset view": back to the overview camera, whatever is selected.
      if (this.state.resets() > 0) untracked(() => this.renderer?.focusNode(null));
    });
  }

  /** Pushes the current selection across the renderer boundary. */
  private applyFocus(): void {
    const focus = this.state.focus();
    const renderer = this.renderer;
    if (!renderer) return;
    renderer.setRightInset(focus ? inspectorInset() : 0);
    // Highlight first: the camera frames the focused node with its highlighted neighbours.
    renderer.highlightNodes(focus?.litNodeIds ?? new Set());
    renderer.focusNode(focus?.node.id ?? null);
    renderer.showEdges(focus?.edgeIds ?? new Set());
  }
}
