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
  viewChild,
} from '@angular/core';
import { NODE_KINDS, parseAnalysisResult } from '@orrery/contracts';
import { shopFixture } from '@orrery/fixture-shop';
import { createGraphIndex } from '@orrery/graph-core';
import { orbitLayout } from '@orrery/layout';
import { KIND_STYLES } from '../renderer/kind-style';
import { SYSTEM_RENDERER, type SystemRenderer } from '../renderer/system-renderer';
import { describeFocus } from './focus';
import { Inspector } from './inspector';

@Component({
  selector: 'app-explorer',
  imports: [Inspector],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'relative block h-dvh overflow-hidden bg-slate-950 text-slate-100',
    '(document:keydown.escape)': 'select(null)',
  },
  template: `
    <div #scene class="absolute inset-0" aria-hidden="true"></div>

    <header
      class="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-3 bg-linear-to-b from-slate-950 to-transparent p-4"
    >
      <h1 class="text-lg font-semibold tracking-tight">Orrery</h1>
      <span class="text-sm text-slate-400">{{ result.project.name }}</span>
      <label class="pointer-events-auto flex items-center gap-2 text-sm">
        <span class="sr-only sm:not-sr-only text-slate-400">Jump to</span>
        <select
          class="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus-visible:outline-2 focus-visible:outline-sky-400"
          [value]="selectedId() ?? ''"
          (change)="select($any($event.target).value || null)"
        >
          <option value="">Overview</option>
          @for (group of nodeGroups; track group.label) {
            <optgroup [label]="group.label">
              @for (node of group.nodes; track node.id) {
                <option [value]="node.id">{{ node.name }}</option>
              }
            </optgroup>
          }
        </select>
      </label>
      @if (selectedId()) {
        <button
          type="button"
          class="pointer-events-auto rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400"
          (click)="select(null)"
        >
          Back to overview
        </button>
      }
    </header>

    @if (focus(); as f) {
      <aside
        class="absolute top-16 right-4 bottom-4 w-80 max-w-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/90 p-4 shadow-xl backdrop-blur"
        aria-label="Inspector"
      >
        <app-inspector [focus]="f" (selected)="select($event)" (closed)="select(null)" />
      </aside>
    } @else {
      <p class="pointer-events-none absolute top-16 left-4 max-w-xs text-sm text-slate-400">
        Click a planet to inspect it. Try
        <button
          type="button"
          class="pointer-events-auto text-amber-300 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-sky-400"
          (click)="selectByName('AuthService')"
        >
          AuthService</button
        >. Drag to orbit, scroll to zoom, Esc to return.
      </p>
    }

    <ul
      class="pointer-events-none absolute bottom-4 left-4 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-300"
      aria-label="Legend"
    >
      @for (kind of legend; track kind.label) {
        <li class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full" [style.background]="kind.color"></span>
          {{ kind.label }}
        </li>
      }
    </ul>
  `,
})
export class Explorer {
  private readonly createRenderer = inject(SYSTEM_RENDERER);
  private readonly sceneHost = viewChild.required<ElementRef<HTMLElement>>('scene');
  /** A plain field, not a signal: renderer objects never enter Angular state. */
  private renderer: SystemRenderer | null = null;

  /** Validated at the boundary, as a real analysis result will be. */
  protected readonly result = parseAnalysisResult(structuredClone(shopFixture));
  private readonly index = createGraphIndex(this.result.graph);
  private readonly layout = orbitLayout(this.result.graph);

  protected readonly selectedId = signal<string | null>(null);
  protected readonly focus = computed(() => {
    const id = this.selectedId();
    return id ? describeFocus(this.result, this.index, id) : null;
  });

  protected readonly legend = NODE_KINDS.filter((kind) =>
    this.result.graph.nodes.some((node) => node.kind === kind),
  ).map((kind) => KIND_STYLES[kind]);

  protected readonly nodeGroups = this.result.graph.regions.map((region) => ({
    label: region.label,
    nodes: this.result.graph.nodes
      .filter((node) => node.regionId === region.id && node.kind !== 'spec')
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const renderer = this.createRenderer();
      renderer.initialize(this.sceneHost().nativeElement, {
        nodePicked: (id) => this.select(id),
      });
      renderer.setGraph(this.result.graph, this.layout);

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
  }

  protected select(nodeId: string | null): void {
    this.selectedId.set(nodeId && this.index.node(nodeId) ? nodeId : null);
  }

  protected selectByName(name: string): void {
    this.select(this.result.graph.nodes.find((node) => node.name === name)?.id ?? null);
  }

  /** Pushes the current selection across the renderer boundary. */
  private applyFocus(): void {
    const focus = this.focus();
    const renderer = this.renderer;
    if (!renderer) return;
    // Highlight first: the camera frames the focused node with its highlighted neighbours.
    renderer.highlightNodes(focus?.litNodeIds ?? new Set());
    renderer.focusNode(focus?.node.id ?? null);
    renderer.showEdges(focus?.edgeIds ?? new Set());
  }
}
