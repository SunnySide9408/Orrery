import type { GraphNode } from '@orrery/contracts';
import { Vector3, type PerspectiveCamera } from 'three';
import { createMarkerElement } from './kind-style';

/** A node label the renderer would like on screen, highest priority first. */
export interface LabelRequest {
  node: GraphNode;
  /** World position of the planet's centre. */
  position: Vector3;
  radius: number;
}

export interface RegionLabel {
  text: string;
  /** World position the label is centred on. */
  position: Vector3;
}

/** Most node labels on screen at once. Beyond this the map is unreadable anyway. */
const POOL_SIZE = 80;
/** Gap between a planet's edge and its label, in pixels. */
const GAP = 4;

/** A screen rectangle in pixels, relative to the map. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface PooledLabel {
  element: HTMLDivElement;
  nodeId: string | null;
  /** Last transform written, so unchanged labels cost no style write. */
  transform: string;
  shown: boolean;
}

/**
 * HTML labels over the canvas, placed in screen space every frame.
 *
 * Node labels come from a fixed pool, so a map of 5,000 files still has at
 * most {@link POOL_SIZE} label elements. Each label tries four spots around
 * its planet (above, below, right, left) and takes the first that does not
 * overlap a label placed before it; if none is free it is hidden. Region
 * labels are placed first, then node labels in the order they are requested,
 * so the focused and hovered nodes always win.
 *
 * Sizes are measured once per text and cached: reading layout every frame
 * would force the browser to recalculate styles each time.
 */
export class LabelLayer {
  readonly element = document.createElement('div');
  private readonly pool: PooledLabel[] = [];
  private regions: (PooledLabel & { position: Vector3 })[] = [];
  private readonly sizes = new Map<string, { width: number; height: number }>();
  private readonly projected = new Vector3();
  private readonly toCamera = new Vector3();

  constructor() {
    // `isolate` keeps label stacking inside this layer, so labels never paint over the app's panels.
    this.element.className = 'pointer-events-none absolute inset-0 isolate overflow-hidden';
    this.element.dataset['labels'] = '';
    for (let i = 0; i < POOL_SIZE; i++) {
      const element = document.createElement('div');
      element.className =
        'absolute top-0 left-0 flex items-center gap-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-xs whitespace-nowrap text-slate-100';
      element.style.display = 'none';
      this.element.appendChild(element);
      this.pool.push({ element, nodeId: null, transform: '', shown: false });
    }
  }

  setRegions(regions: readonly RegionLabel[]): void {
    for (const region of this.regions) region.element.remove();
    this.regions = regions.map((region) => {
      const element = document.createElement('div');
      element.className =
        'absolute top-0 left-0 text-sm font-semibold tracking-wide whitespace-nowrap text-indigo-200 [text-shadow:0_0_6px_#020617]';
      element.textContent = region.text;
      element.dataset['region'] = '';
      this.element.prepend(element);
      return { element, nodeId: null, transform: '', shown: true, position: region.position };
    });
  }

  /**
   * Places region labels and up to {@link POOL_SIZE} node labels for this
   * frame. Node labels also keep out of `keepClear`, the panels over the map.
   */
  update(
    camera: PerspectiveCamera,
    width: number,
    height: number,
    requests: readonly LabelRequest[],
    keepClear: readonly Box[] = [],
  ): void {
    const taken: Box[] = [];
    // Pixels per world unit at distance 1, for the planet's size on screen.
    const focal = height / (2 * Math.tan((camera.fov * Math.PI) / 360));

    for (const region of this.regions) {
      const point = this.toScreen(region.position, camera, width, height);
      const size = point && this.measure(region.element, `region:${region.element.textContent}`);
      if (!point || !size) {
        this.hide(region);
        continue;
      }
      const box = centred(point.x, point.y, size);
      // Region labels are never hidden for each other: they mark where things are.
      taken.push(box);
      this.show(region, box);
    }

    taken.push(...keepClear);

    // Reuse the element that already shows a node, so its content stays put.
    const byNode = new Map<string, PooledLabel>();
    for (const label of this.pool) if (label.nodeId) byNode.set(label.nodeId, label);
    const wanted = requests.slice(0, POOL_SIZE);
    const wantedIds = new Set(wanted.map((request) => request.node.id));
    const free = this.pool.filter((label) => !label.nodeId || !wantedIds.has(label.nodeId));

    for (const request of wanted) {
      let label = byNode.get(request.node.id);
      if (!label) {
        label = free.pop()!;
        fillLabel(label.element, request.node);
        label.nodeId = request.node.id;
        label.transform = '';
      }
      const point = this.toScreen(request.position, camera, width, height);
      const size = point && this.measure(label.element, `node:${request.node.id}`);
      if (!point || !size) {
        this.hide(label);
        continue;
      }
      const reach = (request.radius * focal) / point.depth;
      const box = this.place(point.x, point.y, reach, size, taken);
      if (!box) {
        this.hide(label);
        continue;
      }
      taken.push(box);
      this.show(label, box);
    }
    for (const label of free) {
      this.hide(label);
      label.nodeId = null;
    }
  }

  /** How many node labels are on screen this frame, for the frame-rate readout. */
  get shownCount(): number {
    return this.pool.filter((label) => label.shown).length;
  }

  clear(): void {
    this.setRegions([]);
    for (const label of this.pool) {
      this.hide(label);
      label.nodeId = null;
    }
  }

  dispose(): void {
    this.element.remove();
  }

  /** First free spot around the planet: above, below, right, then left. */
  private place(
    x: number,
    y: number,
    reach: number,
    size: { width: number; height: number },
    taken: readonly Box[],
  ): Box | null {
    const dy = reach + GAP + size.height / 2;
    const dx = reach + GAP + size.width / 2;
    for (const [ox, oy] of [
      [0, -dy],
      [0, dy],
      [dx, 0],
      [-dx, 0],
    ] as const) {
      const box = centred(x + ox, y + oy, size);
      if (!taken.some((other) => overlaps(box, other))) return box;
    }
    return null;
  }

  private toScreen(
    position: Vector3,
    camera: PerspectiveCamera,
    width: number,
    height: number,
  ): { x: number; y: number; depth: number } | null {
    const depth = this.toCamera.copy(position).applyMatrix4(camera.matrixWorldInverse).z;
    // Behind the camera, or so close it fills the view.
    if (depth > -camera.near) return null;
    this.projected.copy(position).project(camera);
    const x = (this.projected.x * 0.5 + 0.5) * width;
    const y = (-this.projected.y * 0.5 + 0.5) * height;
    if (x < -200 || x > width + 200 || y < -100 || y > height + 100) return null;
    return { x, y, depth: -depth };
  }

  private measure(element: HTMLElement, key: string): { width: number; height: number } | null {
    let size = this.sizes.get(key);
    if (!size) {
      if (element.style.display === 'none') element.style.display = '';
      if (element.offsetWidth === 0) return null;
      size = { width: element.offsetWidth, height: element.offsetHeight };
      this.sizes.set(key, size);
    }
    return size;
  }

  private show(label: PooledLabel, box: Box): void {
    const transform = `translate(${Math.round(box.left + 2)}px, ${Math.round(box.top + 1)}px)`;
    if (!label.shown) {
      label.element.style.display = '';
      label.shown = true;
    }
    if (transform !== label.transform) {
      label.element.style.transform = transform;
      label.transform = transform;
    }
  }

  private hide(label: PooledLabel): void {
    if (!label.shown && label.element.style.display === 'none') return;
    label.element.style.display = 'none';
    label.shown = false;
  }
}

/** A box around a label centred on (x, y), with a small margin so labels never touch. */
function centred(x: number, y: number, size: { width: number; height: number }): Box {
  return {
    left: x - size.width / 2 - 2,
    right: x + size.width / 2 + 2,
    top: y - size.height / 2 - 1,
    bottom: y + size.height / 2 + 1,
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function fillLabel(element: HTMLElement, node: GraphNode): void {
  // The marker repeats the kind as a shape, so labels do not rely on colour.
  element.replaceChildren(createMarkerElement(node.kind), node.name);
  element.dataset['node'] = node.id;
}
