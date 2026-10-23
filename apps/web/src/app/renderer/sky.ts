import {
  AdditiveBlending,
  BackSide,
  CubeCamera,
  type CubeTexture,
  DoubleSide,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Mesh,
  NoToneMapping,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderer,
} from 'three';
import { GALAXY_FRAGMENT, GALAXY_VERTEX, SKY_FRAGMENT, SKY_VERTEX } from './planet-shaders';
import { hashString, seededRandom } from './planet-look';

/** Edge length of each cube face. 1024 keeps stars sharp on a 1440p screen. */
const FACE_SIZE = 1024;

interface GalaxySpec {
  direction: readonly [number, number, number];
  size: number;
  arms: number;
  twist: number;
  core: readonly [number, number, number];
  arm: readonly [number, number, number];
  tilt: number;
  /** Star-cluster cells across the disc; smaller galaxies need fewer to stay crisp. */
  detail: number;
}

/**
 * Fixed placements. The big galaxy sits right behind the map in the default
 * overview (the camera looks along -0.6 y, -0.8 z), like a backdrop.
 */
const GALAXIES: readonly GalaxySpec[] = [
  {
    direction: [0, -0.45, -0.89],
    size: 300,
    arms: 2,
    twist: 3,
    core: [1, 0.85, 0.7],
    arm: [0.42, 0.52, 1],
    tilt: 0.95,
    detail: 55,
  },
  {
    direction: [0.75, -0.15, 0.64],
    size: 34,
    arms: 3,
    twist: 2.4,
    core: [1, 0.9, 0.8],
    arm: [0.7, 0.45, 0.9],
    tilt: 0.5,
    detail: 12,
  },
  {
    direction: [-0.6, 0.55, -0.55],
    size: 26,
    arms: 2,
    twist: 4,
    core: [1, 0.85, 0.7],
    arm: [0.5, 0.6, 1],
    tilt: 1.2,
    detail: 10,
  },
];

export interface BakedSky {
  texture: CubeTexture;
  dispose(): void;
}

/**
 * Renders nebulae, stars and galaxies once into a cube map, from a seed text.
 * The result is used as the scene background, so the sky costs one texture
 * lookup per pixel per frame and never moves (which also suits reduced motion).
 */
export function bakeSky(renderer: WebGLRenderer, seedText: string): BakedSky {
  const random = seededRandom(hashString(seedText));
  const sky = new Scene();
  sky.add(
    new Mesh(
      new SphereGeometry(500, 64, 32),
      new ShaderMaterial({
        uniforms: { uSeed: { value: random() * 100 } },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: BackSide,
        depthWrite: false,
      }),
    ),
  );
  for (const galaxy of GALAXIES) {
    const mesh = new Mesh(
      new PlaneGeometry(galaxy.size, galaxy.size),
      new ShaderMaterial({
        uniforms: {
          uArms: { value: galaxy.arms },
          uTwist: { value: galaxy.twist },
          uCore: { value: new Vector3(...galaxy.core) },
          uArm: { value: new Vector3(...galaxy.arm) },
          uSeed: { value: random() * 10 },
          uDetail: { value: galaxy.detail },
        },
        vertexShader: GALAXY_VERTEX,
        fragmentShader: GALAXY_FRAGMENT,
        blending: AdditiveBlending,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    mesh.position
      .set(...galaxy.direction)
      .normalize()
      .multiplyScalar(420);
    mesh.lookAt(0, 0, 0);
    mesh.rotateX(galaxy.tilt);
    mesh.rotateZ(random() * Math.PI * 2);
    sky.add(mesh);
  }

  const target = new WebGLCubeRenderTarget(FACE_SIZE, {
    type: HalfFloatType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
  });
  const camera = new CubeCamera(1, 1000, target);
  const toneMapping = renderer.toneMapping;
  renderer.toneMapping = NoToneMapping;
  camera.update(renderer, sky);
  renderer.toneMapping = toneMapping;

  sky.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
      (object.material as ShaderMaterial).dispose();
    }
  });
  return { texture: target.texture, dispose: () => target.dispose() };
}
