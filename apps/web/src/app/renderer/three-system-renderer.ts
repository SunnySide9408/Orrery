import type { DependencyGraph, GraphNode, Layout } from '@orrery/contracts';
import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineLoop,
  LineSegments,
  NeutralToneMapping,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  RingGeometry,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createMarkerElement } from './kind-style';
import { createStar, PlanetField, type PlanetBody } from './planet-field';
import { hashString, planetLook, starColor } from './planet-look';
import { bakeSky, type BakedSky } from './sky';
import type { SystemRenderer, SystemRendererEvents } from './system-renderer';

const BACKGROUND = new Color('#020617');
const DEPENDANT_EDGE = new Color('#fbbf24');
const DEPENDENCY_EDGE = new Color('#38bdf8');
const GLIDE_MS = 900;
/** Time between impact waves: long enough to follow, short enough not to wait for. */
const WAVE_MS = 450;
/** Pointer travel (px) below which a press counts as a click, not a drag. */
const CLICK_TOLERANCE = 5;
const MOON_RADIUS = 0.22;
/** Keeps the biggest files inside the gap between orbits (ORBIT_GAP in the layout). */
const MAX_PLANET_RADIUS = 1.9;
/** Picking uses a slightly larger sphere, so small moons stay easy to click. */
const PICK_MIN_RADIUS = 0.35;

interface NodeSlot {
  node: GraphNode;
  /** Instance index in the planet field. */
  index: number;
  position: Vector3;
  radius: number;
  label: CSS2DObject;
}

/** A label taking part in overlap removal, highest priority first. */
interface PlacedLabel {
  object: CSS2DObject;
  /** Measured once, the first time the label is on screen. */
  size: { width: number; height: number } | null;
}

interface Glide {
  start: number;
  fromPosition: Vector3;
  fromTarget: Vector3;
  toPosition: Vector3;
  toTarget: Vector3;
}

/**
 * Three.js implementation of the system view.
 *
 * All planets are one procedural PlanetField (three draw calls in total), each
 * region has a star that lights its planets, and the sky is baked once into a
 * cube map. Edges are built only for what Angular asks to show, and labels are
 * HTML elements placed by CSS2DRenderer so they stay crisp and readable.
 *
 * The frame loop is `renderer.setAnimationLoop`. The app is zoneless, so frames
 * never trigger Angular change detection; only `events.nodePicked` crosses
 * back into Angular.
 */
export class ThreeSystemRenderer implements SystemRenderer {
  private container!: HTMLElement;
  private events!: SystemRendererEvents;
  private renderer!: WebGLRenderer;
  /** Scene, then bloom on bright pixels (stars, galaxy cores, lava), then tone mapping. */
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private labels!: CSS2DRenderer;
  private camera!: PerspectiveCamera;
  private controls!: OrbitControls;
  private resizeObserver?: ResizeObserver;
  private readonly scene = new Scene();
  private readonly graphGroup = new Group();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private pressedAt: { x: number; y: number } | null = null;

  private slots = new Map<string, NodeSlot>();
  private regionLabels: PlacedLabel[] = [];
  /** Visible node labels in priority order: focused, hovered, then larger planets first. */
  private nodeLabelOrder: PlacedLabel[] = [];
  private readonly labelSizes = new WeakMap<CSS2DObject, PlacedLabel>();
  private planets?: PlanetField;
  private sky?: BakedSky;
  /** Seconds of planet spin; it stands still under reduced motion. */
  private spin = 0;
  private lastFrame = 0;
  private edgeLines?: LineSegments;
  private halo?: Mesh;
  private graph?: DependencyGraph;
  /** Radius of the whole system, used to frame the overview. */
  private extent = 30;

  private highlighted: ReadonlySet<string> = new Set();
  /** Graph distance per lit node while an impact is shown, else null. */
  private waves: ReadonlyMap<string, number> | null = null;
  private lastWave = 0;
  /** The farthest wave on screen; Infinity when everything is shown. */
  private shownWave = Infinity;
  private revealStart = 0;
  /** Per wave, the number of edge segments with that wave or a nearer one. */
  private edgeWaveEnds: number[] = [];
  private focusedId: string | null = null;
  private hoveredId: string | null = null;
  private reducedMotion = false;
  private rightInset = 0;
  private glide: Glide | null = null;

  initialize(container: HTMLElement, events: SystemRendererEvents): void {
    this.container = container;
    this.events = events;

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(BACKGROUND);
    // Neutral keeps hues close to the legend colours, unlike ACES.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.domElement.classList.add('block', 'size-full');
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    // CSS2DRenderer gives each label a z-index for depth order. `isolate` keeps
    // those inside this layer, so labels never paint over the app's panels.
    this.labels.domElement.classList.add('pointer-events-none', 'absolute', 'inset-0', 'isolate');
    container.appendChild(this.labels.domElement);

    this.camera = new PerspectiveCamera(50, 1, 0.1, 2000);
    this.camera.position.set(0, 50, 60);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // A high threshold: only stars, galaxy cores and glowing cracks bloom, never labels or planets' day side.
    this.bloom = new UnrealBloomPass(new Vector2(1, 1), 0.85, 0.55, 1);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxDistance = 400;
    this.controls.minDistance = 4;

    this.scene.add(this.graphGroup);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    this.renderer.setAnimationLoop(this.frame);
  }

  setGraph(graph: DependencyGraph, layout: Layout): void {
    this.clearGraph();
    this.graph = graph;

    this.setSky(graph);

    const regionLabels = new Map(graph.regions.map((region) => [region.id, region]));
    const planetsPerRegion = new Map<string, number>();
    for (const node of graph.nodes) {
      if (node.ownerId === undefined)
        planetsPerRegion.set(node.regionId, (planetsPerRegion.get(node.regionId) ?? 0) + 1);
    }
    const stars = new Map<string, { position: Vector3; color: Color }>();
    let extent = 0;
    for (const position of layout.regions) {
      const region = regionLabels.get(position.regionId);
      const centre = new Vector3(position.x, 0, position.z);
      extent = Math.max(extent, centre.length() + position.radius);
      this.graphGroup.add(createRegionRing(centre, position.radius, region?.kind === 'lazy-route'));
      const planets = planetsPerRegion.get(position.regionId) ?? 0;
      if (planets > 0) {
        // The star lights the region's planets; a busier region gets a bigger star.
        const color = new Color(...starColor(position.regionId));
        stars.set(position.regionId, {
          position: centre,
          color: color.clone().multiplyScalar(1.15),
        });
        this.graphGroup.add(
          createStar(
            centre,
            0.7 + Math.min(planets, 24) * 0.02,
            color,
            (hashString(position.regionId) % 1000) / 20,
          ),
        );
      }
      const label = createLabel(
        region ? `${region.label}${region.kind === 'lazy-route' ? ' · lazy' : ''}` : '',
        'region',
      );
      label.position.set(centre.x, 0, centre.z + position.radius + 1.5);
      this.graphGroup.add(label);
      this.regionLabels.push(this.placed(label));
    }
    this.extent = Math.max(10, extent);

    const positions = new Map(layout.nodes.map((p) => [p.nodeId, p]));
    const regionCentres = new Map(
      layout.regions.map((r) => [r.regionId, new Vector3(r.x, 0, r.z)]),
    );
    const fallbackLight = { position: new Vector3(0, 40, 0), color: new Color(1, 0.95, 0.9) };
    const bodies: PlanetBody[] = [];
    graph.nodes.forEach((node, index) => {
      const p = positions.get(node.id);
      const position = new Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);
      const radius =
        node.ownerId === undefined
          ? Math.min(0.45 + 0.11 * Math.sqrt(node.metrics.linesOfCode), MAX_PLANET_RADIUS)
          : MOON_RADIUS;
      const star = stars.get(node.regionId) ?? {
        ...fallbackLight,
        position: regionCentres.get(node.regionId) ?? fallbackLight.position,
      };
      bodies.push({
        position,
        radius,
        look: planetLook(node.id, node.kind),
        star: star.position,
        starColor: star.color,
      });
      const label = createLabel(node.name, 'node', node);
      label.position.copy(position).add(new Vector3(0, radius + 0.6, 0));
      label.visible = false;
      this.graphGroup.add(label);
      this.slots.set(node.id, { node, index, position, radius, label });
    });
    this.planets = new PlanetField(bodies);
    this.graphGroup.add(this.planets.group);
    for (const [regionId, centre] of regionCentres) {
      if (stars.has(regionId)) this.graphGroup.add(createOrbits(centre, layout, regionId));
    }

    this.highlighted = new Set();
    this.waves = null;
    this.shownWave = Infinity;
    this.focusedId = null;
    this.applyAppearance();
    this.moveCamera(new Vector3(), this.overviewPosition(), true);
  }

  focusNode(nodeId: string | null): void {
    this.focusedId = nodeId && this.slots.has(nodeId) ? nodeId : null;
    this.updateHalo();
    this.applyAppearance();
    if (this.focusedId === null) {
      this.moveCamera(new Vector3(), this.overviewPosition(), this.reducedMotion);
      return;
    }
    // Frame the node together with everything highlighted: the point is to
    // see its dependants light up in other systems, not just the node itself.
    const focused = this.slots.get(this.focusedId)!;
    const lit = [...this.highlighted, this.focusedId]
      .map((id) => this.slots.get(id))
      .filter((slot): slot is NodeSlot => slot !== undefined);
    const target = new Vector3();
    for (const slot of lit) target.add(slot.position);
    target.divideScalar(lit.length).lerp(focused.position, 0.3);
    let reach = 6;
    for (const slot of lit) {
      reach = Math.max(reach, slot.position.distanceTo(target) + slot.radius);
    }
    // Keep the current viewing direction, tilted up a little so orbits stay readable.
    const direction = this.camera.position
      .clone()
      .sub(this.controls.target)
      .normalize()
      .add(new Vector3(0, 0.5, 0))
      .normalize();
    // Extra room for the labels, which stick out beyond the planets they name.
    const position = target.clone().add(direction.multiplyScalar(this.fitDistance(reach * 1.3)));
    this.moveCamera(target, position, this.reducedMotion);
  }

  highlightNodes(
    nodeIds: ReadonlySet<string>,
    waves: ReadonlyMap<string, number> | null = null,
  ): void {
    this.highlighted = nodeIds;
    this.waves = waves;
    this.lastWave = waves ? Math.max(0, ...waves.values()) : 0;
    // Wave 0 is the focused node; the frame loop reveals the rest.
    this.shownWave = waves && !this.reducedMotion && this.lastWave > 0 ? 0 : Infinity;
    this.revealStart = performance.now();
    this.applyAppearance();
  }

  showEdges(edgeIds: ReadonlySet<string>, waves: ReadonlyMap<string, number> | null = null): void {
    if (this.edgeLines) {
      this.disposeObject(this.edgeLines);
      this.edgeLines = undefined;
    }
    const waveOf = (id: string) => waves?.get(id) ?? 0;
    const edges = (this.graph?.edges ?? [])
      .filter((edge) => edgeIds.has(edge.id))
      // Nearest wave first, so a draw range can reveal them in order.
      .sort((a, b) => waveOf(a.sourceId) - waveOf(b.sourceId));
    this.edgeWaveEnds = [];
    if (edges.length === 0) return;

    const points: number[] = [];
    const colors: number[] = [];
    for (const edge of edges) {
      const source = this.slots.get(edge.sourceId);
      const target = this.slots.get(edge.targetId);
      if (!source || !target) continue;
      // Edges run from dim (dependant) to bright (dependency) to show direction.
      // In an impact tree, every edge leads towards the focused node.
      const towardsFocus = waves !== null || edge.targetId === this.focusedId;
      const tint = towardsFocus ? DEPENDANT_EDGE : DEPENDENCY_EDGE;
      const dim = tint.clone().lerp(BACKGROUND, 0.75);
      points.push(...source.position.toArray(), ...target.position.toArray());
      colors.push(...dim.toArray(), ...tint.toArray());
      const wave = waveOf(edge.sourceId);
      while (this.edgeWaveEnds.length <= wave)
        this.edgeWaveEnds.push(this.edgeWaveEnds.at(-1) ?? 0);
      this.edgeWaveEnds[wave]!++;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.edgeLines = new LineSegments(
      geometry,
      new LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
      }),
    );
    this.graphGroup.add(this.edgeLines);
    this.updateEdgeRange();
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled && this.shownWave !== Infinity) {
      this.shownWave = Infinity;
      this.applyAppearance();
      this.updateEdgeRange();
    }
    this.controls.enableDamping = !enabled;
  }

  setRightInset(pixels: number): void {
    if (pixels === this.rightInset) return;
    this.rightInset = pixels;
    this.resize();
  }

  resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.labels.setSize(width, height);
    // Render a window of a wider virtual view, so its centre sits in the middle
    // of the part of the screen the inspector does not cover.
    const inset = Math.min(this.rightInset, width / 2);
    this.camera.aspect = (width + inset) / height;
    if (inset > 0) this.camera.setViewOffset(width + inset, height, inset, 0, width, height);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    this.resizeObserver?.disconnect();
    this.controls.dispose();
    this.clearGraph();
    this.sky?.dispose();
    this.scene.traverse((object) => this.disposeResources(object));
    this.scene.clear();
    this.bloom.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    canvas.remove();
    this.labels.domElement.remove();
  }

  private readonly frame = (time: number): void => {
    const delta = Math.min((time - (this.lastFrame || time)) / 1000, 0.1);
    this.lastFrame = time;
    if (!this.reducedMotion) this.spin += delta;
    if (this.planets) this.planets.time = this.spin;
    if (this.shownWave !== Infinity) {
      const wave = Math.floor((time - this.revealStart) / WAVE_MS);
      if (wave > this.shownWave) {
        this.shownWave = wave > this.lastWave ? Infinity : wave;
        this.applyAppearance();
        this.updateEdgeRange();
      }
    }
    if (this.glide) {
      const t = Math.min(1, (time - this.glide.start) / GLIDE_MS);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.glide.fromPosition, this.glide.toPosition, eased);
      this.controls.target.lerpVectors(this.glide.fromTarget, this.glide.toTarget, eased);
      if (t === 1) {
        this.glide = null;
        this.controls.enabled = true;
      }
    }
    this.controls.update();
    this.halo?.quaternion.copy(this.camera.quaternion);
    this.composer.render();
    this.labels.render(this.scene, this.camera);
    this.declutterLabels();
  };

  /**
   * Hides labels that would overlap a label of higher priority, in screen
   * space, after CSS2DRenderer has placed them. Region labels always win, then
   * the focused node, the hovered node, and bigger planets before smaller ones.
   * Runs every frame because overlap depends on the camera; it only touches
   * the few labels that are visible, so the cost stays small.
   */
  private declutterLabels(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const taken: { left: number; top: number; right: number; bottom: number }[] = [];
    const projected = new Vector3();

    for (const entry of [...this.regionLabels, ...this.nodeLabelOrder]) {
      const element = entry.object.element;
      if (!entry.object.visible || element.style.display === 'none') continue;
      entry.size ??=
        element.offsetWidth > 0
          ? { width: element.offsetWidth, height: element.offsetHeight }
          : null;
      if (!entry.size) continue;

      entry.object.getWorldPosition(projected).project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const box = {
        left: x - entry.size.width / 2 - 2,
        right: x + entry.size.width / 2 + 2,
        top: y - entry.size.height / 2 - 1,
        bottom: y + entry.size.height / 2 + 1,
      };
      const overlaps = taken.some(
        (other) =>
          box.left < other.right &&
          box.right > other.left &&
          box.top < other.bottom &&
          box.bottom > other.top,
      );
      element.style.visibility = overlaps ? 'hidden' : '';
      if (!overlaps) taken.push(box);
    }
  }

  private placed(object: CSS2DObject): PlacedLabel {
    let entry = this.labelSizes.get(object);
    if (!entry) {
      entry = { object, size: null };
      this.labelSizes.set(object, entry);
    }
    return entry;
  }

  private moveCamera(target: Vector3, position: Vector3, instant: boolean): void {
    if (instant) {
      this.glide = null;
      this.controls.enabled = true;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      return;
    }
    this.controls.enabled = false;
    this.glide = {
      start: performance.now(),
      fromPosition: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      toPosition: position,
      toTarget: target,
    };
  }

  private overviewPosition(): Vector3 {
    // A little margin, so the outer ring labels stay on screen.
    return new Vector3(0, 0.6, 0.8)
      .normalize()
      .multiplyScalar(this.fitDistance(this.extent * 1.08));
  }

  /** Camera distance at which a sphere of `radius` fits the narrower side of the view. */
  private fitDistance(radius: number): number {
    const vertical = (this.camera.fov * Math.PI) / 360;
    const { clientWidth: width, clientHeight: height } = this.container;
    const visibleAspect =
      height > 0 ? (width - Math.min(this.rightInset, width / 2)) / height : this.camera.aspect;
    const horizontal = Math.atan(Math.tan(vertical) * visibleAspect);
    // Graph content is mostly flat (orbits lie in a plane), so tan is a closer fit than sin.
    return radius / Math.tan(Math.min(vertical, horizontal));
  }

  /** Colours, visibility and labels from the current highlight, focus and hover. */
  private applyAppearance(): void {
    const anyHighlight = this.highlighted.size > 0;

    for (const [id, slot] of this.slots) {
      const lit =
        !anyHighlight || (this.highlighted.has(id) && (this.waves?.get(id) ?? 0) <= this.shownWave);
      // Moons stay hidden until their planet is in focus.
      const visible = slot.node.ownerId === undefined || (anyHighlight && lit);
      this.planets?.setInstance(slot.index, visible, lit);
      slot.label.visible = (anyHighlight && lit && visible) || id === this.hoveredId;
    }
    const rank = (slot: NodeSlot) =>
      slot.node.id === this.focusedId ? 0 : slot.node.id === this.hoveredId ? 1 : 2;
    this.nodeLabelOrder = [...this.slots.values()]
      .filter((slot) => slot.label.visible)
      .sort((a, b) => rank(a) - rank(b) || b.radius - a.radius || (a.node.id < b.node.id ? -1 : 1))
      .map((slot) => this.placed(slot.label));
    this.planets?.commit();
  }

  /** Shows the edges of the waves revealed so far. */
  private updateEdgeRange(): void {
    if (!this.edgeLines) return;
    const ends = this.edgeWaveEnds;
    const segments =
      this.shownWave === Infinity || ends.length === 0
        ? Infinity
        : (ends[Math.min(this.shownWave, ends.length - 1)] ?? 0);
    this.edgeLines.geometry.setDrawRange(0, segments === Infinity ? Infinity : segments * 2);
  }

  private updateHalo(): void {
    if (this.halo) {
      this.disposeObject(this.halo);
      this.halo = undefined;
    }
    const slot = this.focusedId ? this.slots.get(this.focusedId) : undefined;
    if (!slot) return;
    this.halo = new Mesh(
      new RingGeometry(slot.radius * 1.35, slot.radius * 1.45, 64),
      new MeshBasicMaterial({
        color: '#f8fafc',
        side: DoubleSide,
        transparent: true,
        opacity: 0.8,
        toneMapped: false,
      }),
    );
    this.halo.position.copy(slot.position);
    this.graphGroup.add(this.halo);
  }

  private pick(event: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Planets are drawn by a shader, so pick them as spheres: nearest hit wins.
    const { ray } = this.raycaster;
    const sphere = new Sphere();
    const hit = new Vector3();
    const anyHighlight = this.highlighted.size > 0;
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [id, slot] of this.slots) {
      const visible = slot.node.ownerId === undefined || (anyHighlight && this.highlighted.has(id));
      if (!visible) continue;
      sphere.set(slot.position, Math.max(slot.radius * 1.1, PICK_MIN_RADIUS));
      if (!ray.intersectSphere(sphere, hit)) continue;
      const distance = hit.distanceTo(ray.origin);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pressedAt = { x: event.clientX, y: event.clientY };
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.pressedAt) return;
    const moved = Math.hypot(event.clientX - this.pressedAt.x, event.clientY - this.pressedAt.y);
    this.pressedAt = null;
    if (moved <= CLICK_TOLERANCE) {
      this.events.nodePicked(this.pick(event));
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.pressedAt) return;
    const hovered = this.pick(event);
    if (hovered === this.hoveredId) return;
    this.hoveredId = hovered;
    this.renderer.domElement.style.cursor = hovered ? 'pointer' : '';
    this.applyAppearance();
  };

  /** Bakes a sky for this project. The seed comes from its regions, so each project has its own. */
  private setSky(graph: DependencyGraph): void {
    this.sky?.dispose();
    this.sky = undefined;
    this.scene.background = null;
    try {
      this.sky = bakeSky(this.renderer, graph.regions.map((r) => r.id).join('|'));
      this.scene.background = this.sky.texture;
      // Keep the sky behind the map, so labels and edges stay readable.
      this.scene.backgroundIntensity = 0.9;
    } catch (error) {
      // A weak GPU may fail to bake; the plain background still works.
      console.warn('Sky could not be drawn', error);
    }
  }

  private clearGraph(): void {
    for (const child of [...this.graphGroup.children]) {
      this.disposeObject(child);
    }
    this.slots.clear();
    this.regionLabels = [];
    this.nodeLabelOrder = [];
    this.planets?.dispose();
    this.planets = undefined;
    this.edgeLines = undefined;
    this.halo = undefined;
  }

  private disposeObject(object: Object3D): void {
    object.removeFromParent();
    object.traverse((child) => this.disposeResources(child));
  }

  private disposeResources(object: Object3D): void {
    if (object instanceof CSS2DObject) {
      object.element.remove();
    }
    const { geometry, material } = object as Partial<Mesh>;
    geometry?.dispose();
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      (m as Material).dispose();
    }
  }
}

function createRegionRing(centre: Vector3, radius: number, lazy: boolean): LineLoop {
  const points: Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new BufferGeometry().setFromPoints(points);
  // A lazy boundary is dashed, like a route that loads on demand.
  const material = lazy
    ? new LineDashedMaterial({ color: '#818cf8', dashSize: 1, gapSize: 0.6, toneMapped: false })
    : new LineBasicMaterial({ color: '#334155', toneMapped: false });
  const ring = new LineLoop(geometry, material);
  if (lazy) ring.computeLineDistances();
  ring.position.copy(centre);
  return ring;
}

function createLabel(text: string, variant: 'region' | 'node', node?: GraphNode): CSS2DObject {
  const element = document.createElement('div');
  element.className =
    variant === 'region'
      ? 'text-sm font-semibold tracking-wide text-indigo-200 [text-shadow:0_0_6px_#020617]'
      : 'flex items-center gap-1 rounded bg-slate-900/80 px-1.5 py-0.5 text-xs text-slate-100';
  // The marker repeats the kind as a shape, so labels do not rely on colour.
  if (node) element.appendChild(createMarkerElement(node.kind));
  element.append(text);
  return new CSS2DObject(element);
}

/** Faint circles along the orbits in use, so each region reads as a solar system. */
function createOrbits(centre: Vector3, layout: Layout, regionId: string): LineSegments {
  const radii = new Set<number>();
  for (const p of layout.nodes) {
    if (p.regionId !== regionId) continue;
    radii.add(Math.round(Math.hypot(p.x - centre.x, p.z - centre.z) * 10) / 10);
  }
  const points: number[] = [];
  const steps = 128;
  for (const radius of radii) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const b = ((i + 1) / steps) * Math.PI * 2;
      points.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
      points.push(Math.cos(b) * radius, 0, Math.sin(b) * radius);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const orbits = new LineSegments(
    geometry,
    new LineBasicMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  orbits.position.copy(centre);
  return orbits;
}
