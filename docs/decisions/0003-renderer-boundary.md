# 0003. Renderer boundary and deterministic layout

- Status: accepted
- Date: 2026-10-23

## Decision

- Angular owns meaning; Three.js only draws. The explorer computes the selection, the related nodes and the edges to show (`describeFocus`), then calls the `SystemRenderer` interface (`apps/web/src/app/renderer/system-renderer.ts`). The renderer reports clicks back through one callback.
- The renderer is a plain object held in a field, never in a signal. It is created after the first render and disposed with the component: frame loop, listeners, the resize observer, geometries, materials and label elements.
- The frame loop is `renderer.setAnimationLoop`. The app is zoneless, so frames never trigger change detection.
- One `InstancedMesh` per node kind (one draw call per kind). Edges are hidden until a node is focused. Moons (specs) appear only with their planet. Labels are HTML (`CSS2DRenderer`) for crisp text.
- The explorer route is lazy-loaded, so Three.js (about 135 kB gzipped) is not in the initial bundle.
- Layout lives in `packages/layout` and is deterministic: positions depend only on sorted IDs and counts.
- Reduced motion: camera moves are instant and damping is off.

## Why

A typed boundary keeps the scene swappable and testable: the explorer's tests use a fake renderer to check selection, focus and lifecycle (three mount and unmount cycles, one dispose each) without WebGL. Deterministic layout means the map does not reshuffle on reload, so people can build a mental model of it.

## Limits

Node labels are created for every node up front. That is fine at 40 nodes; at a few hundred it should become label pooling or semantic zoom (Phase 4).
