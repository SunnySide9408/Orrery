import type { NodeKind } from '@orrery/contracts';
import { KIND_STYLES, type PlanetFamily } from './kind-style';

/** Family index as the planet shader reads it. Keep in sync with `planet-shaders.ts`. */
export const FAMILY_INDEX: Record<PlanetFamily, number> = {
  ocean: 0,
  'gas-giant': 1,
  storm: 2,
  jungle: 3,
  cracked: 4,
  crystal: 5,
  moon: 6,
  rocky: 7,
};

/** Rock colour (linear RGB) under the glowing cracks of cracked worlds. */
const CRUST: Partial<Record<NodeKind, readonly [number, number, number]>> = {
  guard: [0.05, 0.04, 0.035],
  interceptor: [0.33, 0.22, 0.13],
  resolver: [0.62, 0.7, 0.74],
};

/** How thick the atmosphere glow is, by family. Moons have none. */
const ATMOSPHERE: Record<PlanetFamily, number> = {
  ocean: 1,
  'gas-giant': 0.8,
  storm: 1,
  jungle: 0.9,
  cracked: 0.45,
  crystal: 0.5,
  moon: 0,
  rocky: 0.25,
};

export interface PlanetLook {
  /** Four numbers in [0, 1) that drive hue, terrain, clouds, tilt and spin in the shader. */
  seed: readonly [number, number, number, number];
  family: number;
  /** Kind colour, as CSS hex. */
  color: string;
  crust: readonly [number, number, number];
  atmosphere: number;
  ringed: boolean;
}

/** FNV-1a: a small, fast, well-spread 32-bit hash of a string. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a seeded generator, so a seed always gives the same numbers. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How a node's planet looks. The kind picks the family; the node ID alone
 * picks everything else, so the same file always gets the same planet and
 * two files of one kind almost never look alike.
 */
export function planetLook(nodeId: string, kind: NodeKind): PlanetLook {
  const style = KIND_STYLES[kind];
  const random = seededRandom(hashString(nodeId));
  return {
    seed: [random(), random(), random(), random()],
    family: FAMILY_INDEX[style.family],
    color: style.color,
    crust: CRUST[kind] ?? [0, 0, 0],
    atmosphere: ATMOSPHERE[style.family],
    ringed: style.family === 'gas-giant',
  };
}

/** Star colours (linear RGB), warm to cool, like real star classes K, G, F, A and M. */
const STAR_COLORS: readonly (readonly [number, number, number])[] = [
  [1, 0.86, 0.62],
  [1, 0.68, 0.4],
  [1, 0.95, 0.85],
  [0.75, 0.85, 1],
  [1, 0.5, 0.32],
];

/** The colour of a region's star, from the region ID. */
export function starColor(regionId: string): readonly [number, number, number] {
  return STAR_COLORS[hashString(`star:${regionId}`) % STAR_COLORS.length]!;
}
