import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  type BufferGeometry,
  type Vector3,
} from 'three';
import type { PlanetLook } from './planet-look';
import {
  ATMOSPHERE_FRAGMENT,
  ATMOSPHERE_VERTEX,
  PLANET_FRAGMENT,
  PLANET_VERTEX,
  RING_FRAGMENT,
  RING_VERTEX,
  STAR_FRAGMENT,
  STAR_VERTEX,
} from './planet-shaders';

export interface PlanetBody {
  position: Vector3;
  radius: number;
  look: PlanetLook;
  /** Where the light comes from: the star of the planet's region. */
  star: Vector3;
  starColor: Color;
}

/** Per-instance attributes, as [item size, dynamic]. */
const ATTRIBUTES = {
  aPos: [3, false],
  aRadius: [1, true],
  aSeed: [4, false],
  aColor: [3, false],
  aType: [1, false],
  aStar: [3, false],
  aStarColor: [3, false],
  aDim: [1, true],
  aExtra: [4, false],
} as const;
type AttributeName = keyof typeof ATTRIBUTES;

/**
 * All planets of a graph as three instanced draws: surfaces, atmospheres and
 * (for gas giants) rings. Looks come from per-instance attributes, so the
 * draw count does not grow with the number of planets or kinds.
 */
export class PlanetField {
  readonly group = new Group();
  private readonly uniforms = { uTime: { value: 0 } };
  private readonly surface: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly atmosphere: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  private readonly rings: Mesh<InstancedBufferGeometry, ShaderMaterial>;
  /** Ring instance per planet index, or -1. */
  private readonly ringOf: number[];
  private readonly baseRadius: number[];
  private readonly sphere = new SphereGeometry(1, 48, 32);
  private readonly ringShape = new RingGeometry(1.3, 2.7, 96, 1).rotateX(-Math.PI / 2);

  constructor(bodies: readonly PlanetBody[]) {
    const data = fill(bodies);
    this.baseRadius = bodies.map((body) => body.radius);
    const ringed = bodies.flatMap((body, index) => (body.look.ringed ? [index] : []));
    this.ringOf = bodies.map((body, index) => (body.look.ringed ? ringed.indexOf(index) : -1));

    this.surface = new Mesh(
      instanced(this.sphere, bodies.length, data),
      new ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: PLANET_VERTEX,
        fragmentShader: PLANET_FRAGMENT,
      }),
    );
    this.atmosphere = new Mesh(
      instanced(this.sphere, bodies.length, data),
      new ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        side: BackSide,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.rings = new Mesh(
      instanced(this.ringShape, ringed.length, subset(data, ringed)),
      new ShaderMaterial({
        vertexShader: RING_VERTEX,
        fragmentShader: RING_FRAGMENT,
        side: DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.atmosphere.renderOrder = 1;
    this.rings.renderOrder = 2;
    this.rings.visible = ringed.length > 0;
    for (const mesh of [this.surface, this.atmosphere, this.rings]) {
      // Instances are spread over the whole map; the base geometry's bounds say nothing.
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /** Spin and cloud drift, in seconds. Hold it still for reduced motion. */
  set time(seconds: number) {
    this.uniforms.uTime.value = seconds;
  }

  /** Shows or hides a planet, and lights or fades it. Call `commit` after a batch. */
  setInstance(index: number, visible: boolean, lit: boolean): void {
    const radius = visible ? this.baseRadius[index]! : 0;
    const dim = lit ? 1 : 0;
    for (const geometry of [this.surface.geometry, this.atmosphere.geometry]) {
      write(geometry, 'aRadius', index, radius);
      write(geometry, 'aDim', index, dim);
    }
    const ring = this.ringOf[index]!;
    if (ring >= 0) {
      write(this.rings.geometry, 'aRadius', ring, radius);
      write(this.rings.geometry, 'aDim', ring, dim);
    }
  }

  commit(): void {
    for (const mesh of [this.surface, this.atmosphere, this.rings]) {
      mesh.geometry.getAttribute('aRadius').needsUpdate = true;
      mesh.geometry.getAttribute('aDim').needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const mesh of [this.surface, this.atmosphere, this.rings]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.sphere.dispose();
    this.ringShape.dispose();
  }
}

function fill(bodies: readonly PlanetBody[]): Record<AttributeName, Float32Array> {
  const n = bodies.length;
  const data = Object.fromEntries(
    Object.entries(ATTRIBUTES).map(([name, [size]]) => [name, new Float32Array(n * size)]),
  ) as Record<AttributeName, Float32Array>;
  const color = new Color();
  bodies.forEach((body, i) => {
    const { look } = body;
    body.position.toArray(data.aPos, i * 3);
    data.aRadius[i] = body.radius;
    data.aSeed.set(look.seed, i * 4);
    color.set(look.color).toArray(data.aColor, i * 3);
    data.aType[i] = look.family;
    body.star.toArray(data.aStar, i * 3);
    body.starColor.toArray(data.aStarColor, i * 3);
    data.aDim[i] = 1;
    data.aExtra.set([...look.crust, look.atmosphere], i * 4);
  });
  return data;
}

function subset(
  data: Record<AttributeName, Float32Array>,
  indices: readonly number[],
): Record<AttributeName, Float32Array> {
  const out = {} as Record<AttributeName, Float32Array>;
  for (const [name, [size]] of Object.entries(ATTRIBUTES) as [
    AttributeName,
    readonly [number, boolean],
  ][]) {
    const array = new Float32Array(indices.length * size);
    indices.forEach((source, target) =>
      array.set(data[name].subarray(source * size, source * size + size), target * size),
    );
    out[name] = array;
  }
  return out;
}

function instanced(
  base: BufferGeometry,
  count: number,
  data: Record<AttributeName, Float32Array>,
): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('normal', base.getAttribute('normal'));
  for (const [name, [size, dynamic]] of Object.entries(ATTRIBUTES) as [
    AttributeName,
    readonly [number, boolean],
  ][]) {
    // Each mesh gets its own copy, so updating one never aliases another.
    const attribute = new InstancedBufferAttribute(data[name].slice(), size);
    if (dynamic) attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute(name, attribute);
  }
  geometry.instanceCount = count;
  return geometry;
}

function write(geometry: BufferGeometry, name: AttributeName, index: number, value: number): void {
  (geometry.getAttribute(name).array as Float32Array)[index] = value;
}

let glow: CanvasTexture | null = null;

/** A soft radial glow with faint diffraction spikes, shared by all stars. */
function glowTexture(): CanvasTexture {
  if (glow) return glow;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d')!;
  const radial = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  radial.addColorStop(0, 'rgba(255,255,255,1)');
  radial.addColorStop(0.08, 'rgba(255,255,255,0.75)');
  radial.addColorStop(0.25, 'rgba(255,255,255,0.18)');
  radial.addColorStop(0.6, 'rgba(255,255,255,0.04)');
  radial.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = radial;
  context.fillRect(0, 0, 256, 256);
  context.globalCompositeOperation = 'lighter';
  for (const horizontal of [true, false]) {
    const line = horizontal
      ? context.createLinearGradient(0, 128, 256, 128)
      : context.createLinearGradient(128, 0, 128, 256);
    line.addColorStop(0, 'rgba(255,255,255,0)');
    line.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    line.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = line;
    if (horizontal) context.fillRect(0, 126.5, 256, 3);
    else context.fillRect(126.5, 0, 3, 256);
  }
  glow = new CanvasTexture(canvas);
  glow.colorSpace = SRGBColorSpace;
  return glow;
}

/** A region's star: a boiling sphere and two additive glows. */
export function createStar(position: Vector3, size: number, color: Color, seed: number): Group {
  const group = new Group();
  group.position.copy(position);
  group.add(
    new Mesh(
      new SphereGeometry(size, 32, 24),
      new ShaderMaterial({
        uniforms: { uColor: { value: color }, uTime: { value: 0 }, uSeed: { value: seed } },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
      }),
    ),
  );
  for (const [scale, opacity] of [
    [size * 4, 0.6],
    [size * 11, 0.12],
  ] as const) {
    const sprite = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color,
        blending: AdditiveBlending,
        transparent: true,
        opacity,
        depthWrite: false,
      }),
    );
    sprite.scale.setScalar(scale);
    group.add(sprite);
  }
  return group;
}
