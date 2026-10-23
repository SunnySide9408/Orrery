import type { NodeKind } from '@orrery/contracts';

export type KindShape = 'sphere' | 'icosahedron' | 'octahedron' | 'torus' | 'cone' | 'box';

export interface KindStyle {
  label: string;
  /** CSS colour, also used for the legend. */
  color: string;
  shape: KindShape;
}

/** Colour plus shape per kind, so kinds stay distinguishable without colour vision. */
export const KIND_STYLES: Record<NodeKind, KindStyle> = {
  component: { label: 'Component', color: '#60a5fa', shape: 'icosahedron' },
  service: { label: 'Service', color: '#fbbf24', shape: 'sphere' },
  directive: { label: 'Directive', color: '#a78bfa', shape: 'octahedron' },
  pipe: { label: 'Pipe', color: '#34d399', shape: 'torus' },
  guard: { label: 'Guard', color: '#f87171', shape: 'cone' },
  interceptor: { label: 'Interceptor', color: '#fb923c', shape: 'cone' },
  resolver: { label: 'Resolver', color: '#2dd4bf', shape: 'cone' },
  module: { label: 'NgModule', color: '#e879f9', shape: 'box' },
  'route-config': { label: 'Routes', color: '#f472b6', shape: 'box' },
  spec: { label: 'Spec (moon)', color: '#94a3b8', shape: 'sphere' },
  other: { label: 'Other', color: '#cbd5e1', shape: 'sphere' },
};
