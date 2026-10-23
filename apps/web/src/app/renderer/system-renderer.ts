import { InjectionToken } from '@angular/core';
import type { DependencyGraph, Layout } from '@orrery/contracts';

/** What the scene reports back to Angular. */
export interface SystemRendererEvents {
  /** A planet was clicked, or empty space was clicked (`null`). */
  nodePicked(nodeId: string | null): void;
}

/**
 * The typed boundary between Angular and the 3D scene.
 *
 * Angular decides what is selected and what is related; the renderer only
 * draws it. Renderer objects (scene, camera, meshes) never leave the
 * implementation and never go into signals. Compared with the brief, this adds
 * the event callback, `showEdges`, and `null` in `focusNode` for "back to
 * overview".
 */
export interface SystemRenderer {
  initialize(container: HTMLElement, events: SystemRendererEvents): void;
  setGraph(graph: DependencyGraph, layout: Layout): void;
  /**
   * Glide to a node, or back to the overview with `null`. The camera frames
   * the node together with the currently highlighted nodes, so call
   * `highlightNodes` first.
   */
  focusNode(nodeId: string | null): void;
  /** Brighten these nodes and fade the rest. An empty set shows everything normally. */
  highlightNodes(nodeIds: ReadonlySet<string>): void;
  /** Draw only these edges. Edges are hidden by default to keep the overview calm. */
  showEdges(edgeIds: ReadonlySet<string>): void;
  setReducedMotion(enabled: boolean): void;
  /**
   * Pixels on the right covered by UI (the inspector). The view centres and
   * frames content in the space that is left. Call before `focusNode`.
   */
  setRightInset(pixels: number): void;
  resize(): void;
  dispose(): void;
}

/** Creates one renderer per explorer lifecycle. Tests swap in a fake. */
export const SYSTEM_RENDERER = new InjectionToken<() => SystemRenderer>('SYSTEM_RENDERER');
