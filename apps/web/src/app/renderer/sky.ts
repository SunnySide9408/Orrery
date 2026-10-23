import {
  AdditiveBlending,
  BackSide,
  Color,
  CubeCamera,
  type CubeTexture,
  DoubleSide,
  Group,
  HalfFloatType,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  WebGLCubeRenderTarget,
  WebGLRenderTarget,
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
  /** Drawn from its own texture in front of the cube map, so its arms stay sharp. */
  backdrop?: boolean;
}

/** The sky is drawn at this brightness, so labels and edges stay readable over it. */
export const SKY_INTENSITY = 0.9;

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
    backdrop: true,
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
  /**
   * The big backdrop galaxy as a textured quad. Add it to the scene and keep
   * it at the camera's position, so it sits at infinity like the cube map.
   */
  backdrop: Group;
  dispose(): void;
}

/**
 * Renders nebulae, stars and galaxies once into a cube map, from a seed text.
 * The result is used as the scene background, so the sky costs one texture
 * lookup per pixel per frame and never moves (which also suits reduced motion).
 *
 * The big backdrop galaxy covers about 40° of the view: a 1024² cube face
 * would stretch it to roughly a third of screen resolution and blur its arms.
 * It is baked into its own square texture instead (`backdropSize` pixels,
 * 2048 gives about 50 texels per degree) and drawn as one quad, still a
 * single texture lookup per pixel.
 */
export function bakeSky(renderer: WebGLRenderer, seedText: string, backdropSize = 2048): BakedSky {
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
  const backdrop = new Group();
  let backdropTarget: WebGLRenderTarget | null = null;
  for (const galaxy of GALAXIES) {
    const material = new ShaderMaterial({
      uniforms: {
        uArms: { value: galaxy.arms },
        uTwist: { value: galaxy.twist },
        uCore: { value: new Vector3(...galaxy.core) },
        uArm: { value: new Vector3(...galaxy.arm) },
        uSeed: { value: random() * 10 },
        uDetail: { value: galaxy.detail },
        uFine: { value: galaxy.backdrop ? 1 : 0 },
      },
      vertexShader: GALAXY_VERTEX,
      fragmentShader: GALAXY_FRAGMENT,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    let mesh: Mesh;
    if (galaxy.backdrop) {
      backdropTarget = bakeQuad(renderer, material, backdropSize);
      material.dispose();
      mesh = new Mesh(
        new PlaneGeometry(galaxy.size, galaxy.size),
        new MeshBasicMaterial({
          map: backdropTarget.texture,
          color: new Color(SKY_INTENSITY, SKY_INTENSITY, SKY_INTENSITY),
          blending: AdditiveBlending,
          // Opaque with additive blending: drawn first among opaque objects
          // (renderOrder), never sorted in front of planets or edges.
          depthTest: false,
          depthWrite: false,
          side: DoubleSide,
        }),
      );
      mesh.renderOrder = -1;
      backdrop.add(mesh);
    } else {
      mesh = new Mesh(new PlaneGeometry(galaxy.size, galaxy.size), material);
      sky.add(mesh);
    }
    mesh.position
      .set(...galaxy.direction)
      .normalize()
      .multiplyScalar(420);
    mesh.lookAt(0, 0, 0);
    mesh.rotateX(galaxy.tilt);
    mesh.rotateZ(random() * Math.PI * 2);
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
  return {
    texture: target.texture,
    backdrop,
    dispose: () => {
      target.dispose();
      backdropTarget?.dispose();
      backdrop.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          (object.material as MeshBasicMaterial).dispose();
        }
      });
      backdrop.removeFromParent();
    },
  };
}

/** Renders one shader over a square render target, cleared to transparent black. */
function bakeQuad(
  renderer: WebGLRenderer,
  material: ShaderMaterial,
  size: number,
): WebGLRenderTarget {
  const target = new WebGLRenderTarget(size, size, {
    type: HalfFloatType,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
  });
  const scene = new Scene();
  const quad = new Mesh(new PlaneGeometry(2, 2), material);
  scene.add(quad);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  camera.position.z = 1;
  const previous = {
    target: renderer.getRenderTarget(),
    toneMapping: renderer.toneMapping,
    clearColor: renderer.getClearColor(new Color()),
    clearAlpha: renderer.getClearAlpha(),
  };
  renderer.toneMapping = NoToneMapping;
  // The quad is added to the scene later; the app's dark clear colour would tint it.
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(previous.target);
  renderer.setClearColor(previous.clearColor, previous.clearAlpha);
  renderer.toneMapping = previous.toneMapping;
  quad.geometry.dispose();
  return target;
}
