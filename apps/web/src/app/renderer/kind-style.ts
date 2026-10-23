import type { NodeKind } from '@orrery/contracts';

/** Marker drawn next to labels and in the legend, so kinds differ by shape as well as colour. */
export type KindMarker =
  'circle' | 'ring' | 'diamond' | 'hexagon' | 'triangle' | 'square' | 'dot' | 'plus';

/** The kind of world a planet is drawn as. Its surface pattern is a second shape cue. */
export type PlanetFamily =
  'ocean' | 'gas-giant' | 'storm' | 'jungle' | 'cracked' | 'crystal' | 'moon' | 'rocky';

export interface KindStyle {
  label: string;
  /** CSS colour, also used for the legend. */
  color: string;
  marker: KindMarker;
  family: PlanetFamily;
  /** How the planet looks, in words, for the legend. */
  familyLabel: string;
}

/**
 * Colour, marker and planet family per kind, so kinds stay distinguishable
 * without colour vision: by marker shape, by surface pattern, and by rings
 * (services only).
 */
export const KIND_STYLES: Record<NodeKind, KindStyle> = {
  component: {
    label: 'Component',
    color: '#60a5fa',
    marker: 'circle',
    family: 'ocean',
    familyLabel: 'ocean world',
  },
  service: {
    label: 'Service',
    color: '#fbbf24',
    marker: 'ring',
    family: 'gas-giant',
    familyLabel: 'ringed gas giant',
  },
  directive: {
    label: 'Directive',
    color: '#a78bfa',
    marker: 'diamond',
    family: 'storm',
    familyLabel: 'storm world',
  },
  pipe: {
    label: 'Pipe',
    color: '#34d399',
    marker: 'hexagon',
    family: 'jungle',
    familyLabel: 'jungle world',
  },
  guard: {
    label: 'Guard',
    color: '#f87171',
    marker: 'triangle',
    family: 'cracked',
    familyLabel: 'lava world',
  },
  interceptor: {
    label: 'Interceptor',
    color: '#fb923c',
    marker: 'triangle',
    family: 'cracked',
    familyLabel: 'molten desert',
  },
  resolver: {
    label: 'Resolver',
    color: '#2dd4bf',
    marker: 'triangle',
    family: 'cracked',
    familyLabel: 'cracked ice world',
  },
  module: {
    label: 'NgModule',
    color: '#e879f9',
    marker: 'square',
    family: 'crystal',
    familyLabel: 'crystal world',
  },
  'route-config': {
    label: 'Routes',
    color: '#f472b6',
    marker: 'square',
    family: 'crystal',
    familyLabel: 'crystal world',
  },
  spec: {
    label: 'Spec (moon)',
    color: '#94a3b8',
    marker: 'dot',
    family: 'moon',
    familyLabel: 'cratered moon',
  },
  other: {
    label: 'Other',
    color: '#cbd5e1',
    marker: 'plus',
    family: 'rocky',
    familyLabel: 'rocky world',
  },
};

/** SVG paths for each marker, in a 10 × 10 view box. `stroke` is drawn as an outline. */
export const MARKER_PATHS: Record<KindMarker, { fill: string; stroke?: string }> = {
  circle: { fill: 'M5 1a4 4 0 1 1 0 8a4 4 0 1 1 0-8Z' },
  ring: {
    fill: 'M5 2.4a2.6 2.6 0 1 1 0 5.2a2.6 2.6 0 1 1 0-5.2Z',
    stroke: 'M0.4 5a4.6 1.6 0 1 0 9.2 0a4.6 1.6 0 1 0-9.2 0Z',
  },
  diamond: { fill: 'M5 0.5 9.5 5 5 9.5 0.5 5Z' },
  hexagon: { fill: 'M5 0.6 9 2.8 9 7.2 5 9.4 1 7.2 1 2.8Z' },
  triangle: { fill: 'M5 0.8 9.5 9.2H0.5Z' },
  square: { fill: 'M1 1h8v8H1Z' },
  dot: { fill: 'M5 2.6a2.4 2.4 0 1 1 0 4.8a2.4 2.4 0 1 1 0-4.8Z' },
  plus: { fill: 'M3.8 1h2.4v2.8H9v2.4H6.2V9H3.8V6.2H1V3.8h2.8Z' },
};

/** The marker as an SVG element, for labels built outside Angular templates. */
export function createMarkerElement(kind: NodeKind, size = 10): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const { color, marker } = KIND_STYLES[kind];
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 10 10');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  const { fill, stroke } = MARKER_PATHS[marker];
  const body = document.createElementNS(ns, 'path');
  body.setAttribute('d', fill);
  body.setAttribute('fill', color);
  svg.appendChild(body);
  if (stroke) {
    const outline = document.createElementNS(ns, 'path');
    outline.setAttribute('d', stroke);
    outline.setAttribute('fill', 'none');
    outline.setAttribute('stroke', color);
    outline.setAttribute('stroke-width', '1.1');
    svg.appendChild(outline);
  }
  return svg;
}
