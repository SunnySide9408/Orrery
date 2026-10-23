import { InjectionToken } from '@angular/core';
import type { DependencyGraph, Layout } from '@orrery/contracts';
import type { GraphicsQuality, GraphicsSetting } from './quality';

/** What the scene reports back to Angular. */
export interface SystemRendererEvents {
  /** A planet was clicked, or empty space was clicked (`null`). */
  nodePicked(nodeId: string | null): void;
  /**
   * The quality in use changed, or was confirmed after `setQuality`.
   * `automatic` is true when the renderer chose it (a slow or software GPU).
   */
  qualityChanged?(quality: GraphicsQuality, automatic: boolean): void;
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
  /**
   * Brighten these nodes and fade the rest. An empty set shows everything
   * normally. With `waves` (graph distance per node), nodes light up one
   * distance at a time, nearest first; reduced motion shows them all at once.
   */
  highlightNodes(nodeIds: ReadonlySet<string>, waves?: ReadonlyMap<string, number> | null): void;
  /**
   * Draw only these edges. Edges are hidden by default to keep the overview
   * calm. With `waves`, every edge points towards the focused node (an impact
   * tree) and appears with the wave of its source. Call after `highlightNodes`.
   */
  showEdges(edgeIds: ReadonlySet<string>, waves?: ReadonlyMap<string, number> | null): void;
  /**
   * Reduced motion: no formation reveal, no glides, no spin, impact shown at
   * once. Call before `setGraph`, so the first view does not animate either.
   */
  setReducedMotion(enabled: boolean): void;
  /**
   * `full` (glow), `lite` (no glow, 1× pixels), or `auto`: full, stepping
   * down to lite once if the frame rate stays low or the GPU is software.
   */
  setQuality(setting: GraphicsSetting): void;
  /** A small frame-rate and draw-call readout over the map, for performance checks. */
  setFrameRateVisible(visible: boolean): void;
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
