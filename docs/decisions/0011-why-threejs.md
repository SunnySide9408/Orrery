# 0011. Why Three.js

- Status: accepted
- Date: 2026-10-23

## Context

The explorer draws a few hundred planets, their edges, labels, a sky and a glow, at 50–60 fps, inside an Angular app whose state must not be tied to frames (docs/decisions/0003). The scene is custom: planets are generated in a shader (0009), edges are fat lines (0010), and the layout comes from our own package (0015). We need a renderer, not a graph library or a game engine.

## Decision

Three.js (`three` 0.186), used directly from a plain TypeScript class behind the `SystemRenderer` interface. No Angular wrapper and no scene framework on top.

What we use from it: `WebGLRenderer`, `InstancedBufferGeometry` with a custom `ShaderMaterial` for all planets in one draw call, `LineSegments2` for edges, `OrbitControls` with `zoomToCursor`, and `EffectComposer` with `UnrealBloomPass` for the glow. Everything else (layout, labels, picking by ray–sphere tests, quality step-down) is our code.

## Why not the alternatives

- **Babylon.js or PlayCanvas.** Full engines with physics, scene editors and asset pipelines we do not need. They would add weight and concepts to explain, and the parts we do need (instancing, custom shaders, post-processing) are the same in Three.js.
- **A graph library (3d-force-graph, Sigma.js, Cytoscape).** Quick to start, but they own the layout and the look. 3d-force-graph runs a force simulation, which breaks the deterministic layout (0015); Sigma and Cytoscape are 2D. Orrery's point is Angular-aware regions and a readable solar-system grammar, which needs control of both.
- **An Angular wrapper (angular-three).** Declarative scene templates are pleasant, but they put scene objects into Angular's world. The brief wants the opposite: frames outside change detection and a narrow typed boundary, so the renderer can be tested with a fake.
- **Raw WebGL or WebGPU.** Most of the code would be plumbing (buffers, state, matrix maths, controls) instead of product. Three.js also has a WebGPU renderer, so the door stays open.

## Consequences

- Three.js and the scene code load only on the explorer route: about 140 kB gzipped in a lazy chunk (docs/decisions/0014), never in the initial bundle.
- Three.js releases often and changes APIs between minor versions (it has no semver promise). The version is pinned by the lockfile, and the renderer is one folder (`apps/web/src/app/renderer`), so an upgrade is contained.
- Anyone who knows Three.js can read the renderer; the custom parts are the shaders, which are documented in 0009.
