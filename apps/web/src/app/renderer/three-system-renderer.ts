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
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { LabelLayer, type Box, type LabelRequest } from './label-layer';
import { createStar, PlanetField, type PlanetBody } from './planet-field';
import { hashString, planetLook, starColor } from './planet-look';
import {
  FrameCounter,
  gpuName,
  isSoftwareRenderer,
  shortGpuName,
  StepDownMonitor,
  type GraphicsQuality,
  type GraphicsSetting,
} from './quality';
import { bakeSky, SKY_INTENSITY, SKY_SIZES, type BakedSky } from './sky';
import type { SystemRenderer, SystemRendererEvents } from './system-renderer';

const BACKGROUND = new Color('#020617');
const DEPENDANT_EDGE = new Color('#fbbf24');
const DEPENDENCY_EDGE = new Color('#38bdf8');
/** Glide length grows with distance, within these bounds. */
const GLIDE_MIN_MS = 600;
const GLIDE_MAX_MS = 1400;
/** The opening glide, from far out to the overview, alongside the formation reveal. */
const INTRO_MS = 2200;
/** Time between impact waves: long enough to follow, short enough not to wait for. */
const WAVE_MS = 450;
/** Formation reveal: stars first, then planets from the inner orbits out. */
const STAR_MS = 500;
const PLANET_DELAY_MS = 200;
const PLANET_SPREAD_MS = 800;
const PLANET_MS = 700;
const REVEAL_MS = PLANET_DELAY_MS + PLANET_SPREAD_MS + 120 + PLANET_MS;
/** Pointer travel (px) below which a press counts as a click, not a drag. */
const CLICK_TOLERANCE = 5;
const MOON_RADIUS = 0.22;
/** Keeps the biggest files inside the gap between orbits (ORBIT_GAP in the layout). */
const MAX_PLANET_RADIUS = 1.9;
/** Picking uses a slightly larger sphere, so small moons stay easy to click. */
const PICK_MIN_RADIUS = 0.35;
/** Progressive detail: a planet this many pixels wide on screen gets its label… */
const LABEL_MIN_PX = 7;
/** …and at this size its moons (spec files) appear. */
const MOONS_MIN_PX = 18;
/** Edge width in CSS pixels, from close up to the overview: thinner when zoomed in. */
const EDGE_WIDTH_NEAR = 0.8;
const EDGE_WIDTH_FAR = 1.6;

interface NodeSlot {
  node: GraphNode;
  /** Instance index in the planet field. */
  index: number;
  /** Where the layout puts it. */
  position: Vector3;
  /** Where it is drawn now; differs from `position` only during the reveal. */
  current: Vector3;
  radius: number;
  /** Its region's centre, where the reveal starts. */
  centre: Vector3;
  /** Reveal start, in ms after the reveal begins. */
  delay: number;
  visible: boolean;
  lit: boolean;
  /** Radius on screen in pixels, refreshed each frame. */
  screenRadius: number;
}

interface Glide {
  start: number;
  duration: number;
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
 * cube map plus one texture for the backdrop galaxy. Edges are built only for
 * what Angular asks to show, and labels are pooled HTML elements placed in
 * screen space by LabelLayer, so they stay crisp and never overlap.
 *
 * The frame loop is `renderer.setAnimationLoop`. The app is zoneless, so frames
 * never trigger Angular change detection; only `events` cross back into
 * Angular, and only on clicks and quality changes, never per frame.
 *
 * Every animation (reveal, glides, impact waves) runs on this one loop and
 * never takes the controls away: dragging or scrolling stops a glide.
 */
export class ThreeSystemRenderer implements SystemRenderer {
  private container!: HTMLElement;
  private events!: SystemRendererEvents;
  private renderer!: WebGLRenderer;
  /** Scene, then bloom on bright pixels (stars, galaxy cores, lava), then tone mapping. */
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private labels!: LabelLayer;
  private camera!: PerspectiveCamera;
  private controls!: OrbitControls;
  private resizeObserver?: ResizeObserver;
  private readonly scene = new Scene();
  private readonly graphGroup = new Group();
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private pressedAt: { x: number; y: number } | null = null;

  private slots = new Map<string, NodeSlot>();
  private planets?: PlanetField;
  private sky?: BakedSky;
  private stars: Group[] = [];
  /** Region rings and orbits, faded in by the reveal: material and its resting opacity. */
  private fadeIns: { material: Material; opacity: number }[] = [];
  /** Seconds of planet spin; it stands still under reduced motion. */
  private spin = 0;
  private lastFrame = 0;
  private edgeLines?: LineSegments2;
  private edgeCount = 0;
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
  private waveStart = 0;
  /** Per wave, the number of edge segments with that wave or a nearer one. */
  private edgeWaveEnds: number[] = [];
  private focusedId: string | null = null;
  private hoveredId: string | null = null;
  /** Planets big enough on screen to show their moons. */
  private moonOwners = new Set<string>();
  private reducedMotion = false;
  private rightInset = 0;
  private glide: Glide | null = null;
  /** Start time of the formation reveal, or null when it is over. */
  private revealStart: number | null = null;

  private setting: GraphicsSetting = 'auto';
  private quality: GraphicsQuality = 'full';
  private softwareGpu = false;
  private readonly stepDown = new StepDownMonitor();
  private readonly counter = new FrameCounter();
  private readout: HTMLElement | null = null;
  /** Panels over the map (`data-keep-clear`) that labels avoid, refreshed every few frames. */
  private keepClear: Box[] = [];
  private framesSinceClear = Infinity;

  initialize(container: HTMLElement, events: SystemRendererEvents): void {
    this.container = container;
    this.events = events;

    this.renderer = new WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(BACKGROUND);
    // Neutral keeps hues close to the legend colours, unlike ACES.
    this.renderer.toneMapping = NeutralToneMapping;
    // The composer renders several passes a frame; count them all for the readout.
    this.renderer.info.autoReset = false;
    this.renderer.domElement.classList.add('block', 'size-full');
    container.appendChild(this.renderer.domElement);
    this.softwareGpu = isSoftwareRenderer(this.renderer.getContext());

    this.labels = new LabelLayer();
    container.appendChild(this.labels.element);

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
    // Scroll zooms towards what is under the pointer, not the middle of the screen.
    this.controls.zoomToCursor = true;
    // Any drag or scroll takes over from a glide straight away.
    this.controls.addEventListener('start', this.onControlsStart);

    this.scene.add(this.graphGroup);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.setQuality('auto');
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
    const regionRadius = new Map<string, number>();
    const labels: { text: string; position: Vector3 }[] = [];
    let extent = 0;
    for (const position of layout.regions) {
      const region = regionLabels.get(position.regionId);
      const centre = new Vector3(position.x, 0, position.z);
      regionRadius.set(position.regionId, position.radius);
      extent = Math.max(extent, centre.length() + position.radius);
      const ring = createRegionRing(centre, position.radius, region?.kind === 'lazy-route');
      this.graphGroup.add(ring);
      this.fadeIns.push({ material: ring.material, opacity: ring.material.opacity });
      const planets = planetsPerRegion.get(position.regionId) ?? 0;
      if (planets > 0) {
        // The star lights the region's planets; a busier region gets a bigger star.
        const color = new Color(...starColor(position.regionId));
        stars.set(position.regionId, {
          position: centre,
          color: color.clone().multiplyScalar(1.15),
        });
        const star = createStar(
          centre,
          0.7 + Math.min(planets, 24) * 0.02,
          color,
          (hashString(position.regionId) % 1000) / 20,
        );
        this.stars.push(star);
        this.graphGroup.add(star);
      }
      labels.push({
        text: region ? `${region.label}${region.kind === 'lazy-route' ? ' · lazy' : ''}` : '',
        position: new Vector3(centre.x, 0, centre.z + position.radius + 1.5),
      });
    }
    this.labels.setRegions(labels.filter((label) => label.text !== ''));
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
      const centre = regionCentres.get(node.regionId) ?? new Vector3();
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
      // Inner orbits form first; a little jitter keeps one orbit from popping in together.
      const orbit = Math.hypot(position.x - centre.x, position.z - centre.z);
      const reach = regionRadius.get(node.regionId) ?? 1;
      const delay =
        PLANET_DELAY_MS +
        PLANET_SPREAD_MS * Math.min(1, orbit / reach) +
        (hashString(node.id) % 120);
      this.slots.set(node.id, {
        node,
        index,
        position,
        current: position.clone(),
        radius,
        centre,
        delay,
        visible: false,
        lit: true,
        screenRadius: 0,
      });
    });
    this.planets = new PlanetField(bodies);
    this.graphGroup.add(this.planets.group);
    for (const [regionId, centre] of regionCentres) {
      if (!stars.has(regionId)) continue;
      const orbits = createOrbits(centre, layout, regionId);
      this.graphGroup.add(orbits);
      this.fadeIns.push({ material: orbits.material, opacity: orbits.material.opacity });
    }

    this.highlighted = new Set();
    this.waves = null;
    this.shownWave = Infinity;
    this.focusedId = null;
    this.moonOwners = new Set();
    this.stepDown.reset();

    const overview = this.overviewPosition();
    if (this.reducedMotion) {
      this.revealStart = null;
      this.moveCamera(new Vector3(), overview, true);
    } else {
      // Open from further out and a little to the side, gliding in while the systems form.
      this.revealStart = performance.now();
      this.camera.position.copy(overview).multiplyScalar(1.5).applyAxisAngle(UP, 0.35);
      this.controls.target.set(0, 0, 0);
      this.glide = {
        start: this.revealStart,
        duration: INTRO_MS,
        fromPosition: this.camera.position.clone(),
        fromTarget: new Vector3(),
        toPosition: overview,
        toTarget: new Vector3(),
      };
    }
    this.applyAppearance();
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
    this.waveStart = performance.now();
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
    this.edgeCount = 0;
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
      this.edgeCount++;
    }
    // Fat lines, so the width can follow the zoom; plain GL lines are always 1 device pixel.
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(points);
    geometry.setColors(colors);
    this.edgeLines = new LineSegments2(
      geometry,
      new LineMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        linewidth: EDGE_WIDTH_FAR,
        toneMapped: false,
      }),
    );
    this.edgeLines.frustumCulled = false;
    this.graphGroup.add(this.edgeLines);
    this.updateEdgeRange();
  }

  setReducedMotion(enabled: boolean): void {
    this.reducedMotion = enabled;
    if (enabled) {
      if (this.shownWave !== Infinity) {
        this.shownWave = Infinity;
        this.updateEdgeRange();
      }
      if (this.revealStart !== null) this.finishReveal();
      if (this.glide) this.moveCamera(this.glide.toTarget, this.glide.toPosition, true);
      this.applyAppearance();
    }
    this.controls.enableDamping = !enabled;
  }

  setQuality(setting: GraphicsSetting): void {
    this.setting = setting;
    if (setting === 'auto') {
      this.stepDown.reset();
      this.applyQuality(this.softwareGpu ? 'lite' : 'full', true);
    } else {
      this.stepDown.stop();
      this.applyQuality(setting, false);
    }
  }

  setFrameRateVisible(visible: boolean): void {
    if (!visible) {
      this.readout?.remove();
      this.readout = null;
      return;
    }
    if (this.readout) return;
    this.readout = document.createElement('div');
    this.readout.className =
      'pointer-events-none absolute top-3 max-w-xs rounded-md bg-slate-950/85 px-2 py-1 font-mono text-xs text-slate-200';
    this.readout.dataset['frameRate'] = '';
    this.readout.dataset['keepClear'] = '';
    this.readout.style.right = `${this.rightInset + 16}px`;
    this.container.appendChild(this.readout);
  }

  setRightInset(pixels: number): void {
    if (pixels === this.rightInset) return;
    this.rightInset = pixels;
    if (this.readout) this.readout.style.right = `${pixels + 16}px`;
    this.framesSinceClear = Infinity;
    this.resize();
  }

  resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.framesSinceClear = Infinity;
    this.renderer.setSize(width, height, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
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
    this.controls.removeEventListener('start', this.onControlsStart);
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
    this.labels.dispose();
    this.readout?.remove();
  }

  private readonly frame = (time: number): void => {
    const delta = Math.min((time - (this.lastFrame || time)) / 1000, 0.1);
    this.lastFrame = time;
    if (!this.reducedMotion) this.spin += delta;
    if (this.planets) this.planets.time = this.spin;
    if (this.revealStart !== null) this.stepReveal(time);
    if (this.shownWave !== Infinity) {
      const wave = Math.floor((time - this.waveStart) / WAVE_MS);
      if (wave > this.shownWave) {
        this.shownWave = wave > this.lastWave ? Infinity : wave;
        this.applyAppearance();
        this.updateEdgeRange();
      }
    }
    if (this.glide) {
      const t = Math.min(1, (time - this.glide.start) / this.glide.duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this.glide.fromPosition, this.glide.toPosition, eased);
      this.controls.target.lerpVectors(this.glide.fromTarget, this.glide.toTarget, eased);
      if (t === 1) this.glide = null;
    }
    this.controls.update();
    this.sky?.backdrop.position.copy(this.camera.position);
    this.halo?.quaternion.copy(this.camera.quaternion);
    this.updateEdgeWidth();

    this.renderer.info.reset();
    if (this.quality === 'full') this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    this.updateDetail();
    // Reading layout every frame would force style recalculation; panels move rarely.
    if (++this.framesSinceClear >= 30) this.measureKeepClear();
    this.labels.update(
      this.camera,
      this.container.clientWidth,
      this.container.clientHeight,
      this.labelRequests(),
      this.keepClear,
    );

    if (
      this.setting === 'auto' &&
      this.quality === 'full' &&
      this.stepDown.frame(time, document.visibilityState === 'visible')
    ) {
      this.applyQuality('lite', true);
    }
    const counted = this.counter.frame(time);
    // Also on the first frame of a new graph, so the readout never shows the last one.
    if (this.readout && (counted || this.readout.dataset['nodes'] !== String(this.slots.size))) {
      this.updateReadout();
    }
  };

  /** Planets grow out of their star and spiral to their orbit; rings and labels fade in. */
  private stepReveal(time: number): void {
    const elapsed = time - this.revealStart!;
    if (elapsed >= REVEAL_MS) {
      this.finishReveal();
      this.applyAppearance();
      return;
    }
    const starScale = easeOut(Math.min(1, elapsed / STAR_MS));
    for (const star of this.stars) star.scale.setScalar(Math.max(starScale, 0.001));
    const overall = easeOut(Math.min(1, elapsed / REVEAL_MS));
    for (const { material, opacity } of this.fadeIns) material.opacity = opacity * overall;
    this.labels.element.style.opacity = String(overall);
    for (const slot of this.slots.values()) {
      const e = easeOut(Math.min(1, Math.max(0, (elapsed - slot.delay) / PLANET_MS)));
      // Spiral out: start at the star, a little behind on the orbit, and swing into place.
      slot.current
        .copy(slot.position)
        .sub(slot.centre)
        .applyAxisAngle(UP, (1 - e) * -0.9)
        .multiplyScalar(e)
        .add(slot.centre);
    }
    this.applyAppearance();
  }

  private finishReveal(): void {
    this.revealStart = null;
    for (const star of this.stars) star.scale.setScalar(1);
    for (const { material, opacity } of this.fadeIns) material.opacity = opacity;
    this.labels.element.style.opacity = '';
    for (const slot of this.slots.values()) {
      slot.current.copy(slot.position);
      this.planets?.setPosition(slot.index, slot.position);
    }
  }

  /** How far a planet has grown in the reveal, from 0 to 1. */
  private revealScale(slot: NodeSlot): number {
    if (this.revealStart === null) return 1;
    const elapsed = performance.now() - this.revealStart;
    return easeOut(Math.min(1, Math.max(0, (elapsed - slot.delay) / PLANET_MS)));
  }

  /**
   * Progressive detail: works out each planet's size on screen, and shows the
   * moons of planets that are big enough. Labels use the same sizes.
   */
  private updateDetail(): void {
    const height = this.container.clientHeight;
    const focal = height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    const view = this.camera.matrixWorldInverse;
    const point = new Vector3();
    let changed = false;
    for (const slot of this.slots.values()) {
      const depth = -point.copy(slot.current).applyMatrix4(view).z;
      slot.screenRadius = depth > this.camera.near ? (slot.radius * focal) / depth : 0;
      if (slot.node.ownerId !== undefined) continue;
      const wants = slot.screenRadius >= MOONS_MIN_PX;
      if (wants !== this.moonOwners.has(slot.node.id)) {
        if (wants) this.moonOwners.add(slot.node.id);
        else this.moonOwners.delete(slot.node.id);
        changed = true;
      }
    }
    if (changed) this.applyAppearance();
  }

  /**
   * Node labels wanted this frame, most important first: the focused node,
   * the hovered node, then either the highlighted nodes (biggest first) or,
   * with nothing selected, every planet big enough on screen to name.
   */
  private labelRequests(): LabelRequest[] {
    const anyHighlight = this.highlighted.size > 0;
    const rank = (slot: NodeSlot) =>
      slot.node.id === this.focusedId ? 0 : slot.node.id === this.hoveredId ? 1 : 2;
    const wanted: NodeSlot[] = [];
    for (const slot of this.slots.values()) {
      if (!slot.visible) continue;
      const important = slot.node.id === this.focusedId || slot.node.id === this.hoveredId;
      const shown = anyHighlight ? slot.lit : slot.screenRadius >= LABEL_MIN_PX;
      if (important || shown) wanted.push(slot);
    }
    wanted.sort(
      (a, b) =>
        rank(a) - rank(b) || b.screenRadius - a.screenRadius || (a.node.id < b.node.id ? -1 : 1),
    );
    return wanted.map((slot) => ({ node: slot.node, position: slot.current, radius: slot.radius }));
  }

  private applyQuality(quality: GraphicsQuality, automatic: boolean): void {
    if (quality === this.quality) {
      this.events.qualityChanged?.(quality, automatic);
      return;
    }
    this.quality = quality;
    // Lite draws straight to the screen at 1×, with no bloom passes.
    this.renderer.setPixelRatio(quality === 'full' ? Math.min(window.devicePixelRatio, 2) : 1);
    this.resize();
    this.events.qualityChanged?.(quality, automatic);
  }

  private measureKeepClear(): void {
    this.framesSinceClear = 0;
    const origin = this.container.getBoundingClientRect();
    const scope = this.container.parentElement ?? this.container;
    this.keepClear = [...scope.querySelectorAll<HTMLElement>('[data-keep-clear]')].map((panel) => {
      const rect = panel.getBoundingClientRect();
      return {
        left: rect.left - origin.left,
        right: rect.right - origin.left,
        top: rect.top - origin.top,
        bottom: rect.bottom - origin.top,
      };
    });
  }

  private updateReadout(): void {
    const readout = this.readout!;
    const { memory, render } = this.renderer.info;
    readout.textContent =
      (this.counter.fps > 0
        ? `${Math.round(this.counter.fps)} fps · ${this.counter.frameMs.toFixed(1)} ms · `
        : 'measuring… · ') +
      `${render.calls} draws · ${this.slots.size} nodes · ${this.edgeCount} edges · ` +
      `${this.labels.shownCount} labels · ${this.quality} · ${shortGpuName(gpuName(this.renderer.getContext()))}`;
    readout.dataset['fps'] = this.counter.fps.toFixed(1);
    readout.dataset['nodes'] = String(this.slots.size);
    // Anything moving on its own: lets a test check that reduced motion keeps the scene still.
    readout.dataset['animating'] = String(
      this.revealStart !== null || this.glide !== null || this.shownWave !== Infinity,
    );
    readout.dataset['quality'] = this.quality;
    readout.dataset['geometries'] = String(memory.geometries);
    readout.dataset['textures'] = String(memory.textures);
  }

  /** Thinner, softer edges up close, where they would otherwise cover the planets. */
  private updateEdgeWidth(): void {
    if (!this.edgeLines) return;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const far = Math.min(1, distance / (this.extent * 1.2));
    const material = this.edgeLines.material;
    material.linewidth = EDGE_WIDTH_NEAR + (EDGE_WIDTH_FAR - EDGE_WIDTH_NEAR) * far;
    material.opacity = 0.6 + 0.3 * far;
  }

  private moveCamera(target: Vector3, position: Vector3, instant: boolean): void {
    if (instant) {
      this.glide = null;
      this.camera.position.copy(position);
      this.controls.target.copy(target);
      return;
    }
    // Longer trips take a little longer, so speed feels the same.
    const distance =
      this.camera.position.distanceTo(position) + this.controls.target.distanceTo(target);
    this.glide = {
      start: performance.now(),
      duration: Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, 450 + distance * 6)),
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

  /** Colours, visibility and reveal growth from the current highlight, focus, hover and zoom. */
  private applyAppearance(): void {
    const anyHighlight = this.highlighted.size > 0;
    for (const [id, slot] of this.slots) {
      slot.lit =
        !anyHighlight || (this.highlighted.has(id) && (this.waves?.get(id) ?? 0) <= this.shownWave);
      const owner = slot.node.ownerId;
      // Moons stay hidden until their planet is in focus or big on screen.
      slot.visible = owner === undefined || (anyHighlight ? slot.lit : this.moonOwners.has(owner));
      this.planets?.setInstance(slot.index, slot.visible, slot.lit, this.revealScale(slot));
      if (this.revealStart !== null) this.planets?.setPosition(slot.index, slot.current);
    }
    this.planets?.commit();
  }

  /** Shows the edges of the waves revealed so far. */
  private updateEdgeRange(): void {
    if (!this.edgeLines) return;
    const ends = this.edgeWaveEnds;
    const segments =
      this.shownWave === Infinity || ends.length === 0
        ? this.edgeCount
        : (ends[Math.min(this.shownWave, ends.length - 1)] ?? 0);
    this.edgeLines.geometry.instanceCount = segments;
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
    let best: string | null = null;
    let bestDistance = Infinity;
    for (const [id, slot] of this.slots) {
      if (!slot.visible) continue;
      sphere.set(slot.current, Math.max(slot.radius * 1.1, PICK_MIN_RADIUS));
      if (!ray.intersectSphere(sphere, hit)) continue;
      const distance = hit.distanceTo(ray.origin);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = id;
      }
    }
    return best;
  }

  private readonly onControlsStart = (): void => {
    this.glide = null;
  };

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
  };

  /** Bakes a sky for this project. The seed comes from its regions, so each project has its own. */
  private setSky(graph: DependencyGraph): void {
    this.sky?.dispose();
    this.sky = undefined;
    this.scene.background = null;
    try {
      // Lite bakes at half size: a quarter of the memory and of the bake time.
      this.sky = bakeSky(
        this.renderer,
        graph.regions.map((r) => r.id).join('|'),
        SKY_SIZES[this.quality],
      );
      this.scene.background = this.sky.texture;
      // Keep the sky behind the map, so labels and edges stay readable.
      this.scene.backgroundIntensity = SKY_INTENSITY;
      this.scene.add(this.sky.backdrop);
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
    this.stars = [];
    this.fadeIns = [];
    this.labels.clear();
    this.planets?.dispose();
    this.planets = undefined;
    this.edgeLines = undefined;
    this.edgeCount = 0;
    this.halo = undefined;
    this.revealStart = null;
  }

  private disposeObject(object: Object3D): void {
    object.removeFromParent();
    object.traverse((child) => this.disposeResources(child));
  }

  private disposeResources(object: Object3D): void {
    const { geometry, material } = object as Partial<Mesh>;
    geometry?.dispose();
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      (m as Material).dispose();
    }
  }
}

const UP = new Vector3(0, 1, 0);

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function createRegionRing(
  centre: Vector3,
  radius: number,
  lazy: boolean,
): LineLoop<BufferGeometry, LineBasicMaterial | LineDashedMaterial> {
  const points: Vector3[] = [];
  for (let i = 0; i < 96; i++) {
    const angle = (i / 96) * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new BufferGeometry().setFromPoints(points);
  // A lazy boundary is dashed, like a route that loads on demand.
  const material = lazy
    ? new LineDashedMaterial({
        color: '#818cf8',
        dashSize: 1,
        gapSize: 0.6,
        transparent: true,
        toneMapped: false,
      })
    : new LineBasicMaterial({ color: '#334155', transparent: true, toneMapped: false });
  const ring = new LineLoop(geometry, material);
  if (lazy) ring.computeLineDistances();
  ring.position.copy(centre);
  return ring;
}

/** Faint circles along the orbits in use, so each region reads as a solar system. */
function createOrbits(
  centre: Vector3,
  layout: Layout,
  regionId: string,
): LineSegments<BufferGeometry, LineBasicMaterial> {
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
