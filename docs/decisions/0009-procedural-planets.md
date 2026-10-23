# 0009. Procedural planets, stars and sky

- Status: accepted
- Date: 2026-10-23

## Decision

Planets are drawn as real-looking worlds, generated in a shader, instead of flat coloured shapes. The look was agreed on an interactive prototype before Phase 4.

**Families.** Each node kind is a planet family with its own surface: components are ocean worlds, services ringed gas giants, directives storm worlds, pipes jungle worlds, guards, interceptors and resolvers cracked worlds (lava, molten desert, ice), NgModules and route files crystal worlds, specs cratered moons, and other files rocky worlds. The family list lives in `kind-style.ts`; the legend is generated from it.

**One look per file.** The node ID is hashed (FNV-1a) into a seed (Mulberry32), which gives four numbers in [0, 1). The shader uses them for hue, terrain height, clouds, ice caps, band count, storm position, axial tilt and spin. The same project gives the same planets on every load; two files of one kind practically never match (a test checks 2,000 IDs).

**Shape as well as colour.** The old cube, cone and torus shapes are gone. Kinds stay apart without colour in three ways: the surface pattern of the family, rings on services only, and a marker shape (circle, ringed circle, diamond, hexagon, triangle, square, dot, plus) next to each 3D label and in the legend, search and list.

**Stars.** Each region with planets gets a star at its centre. Its colour comes from the region ID; its size grows a little with the number of planets. The star is the light source for its planets, so they have a day side and a night side. A faint fill from the camera keeps the night side readable.

**Sky.** Nebula clouds, a dusty band, three layers of stars and three spiral galaxies are rendered once per project into a 1024² cube map and used as the scene background. Its seed comes from the region IDs, so each project has its own sky.

**Readability.** The sky is kept dim (background intensity 0.9 under ACES tone mapping). Edges, region rings and the focus halo skip tone mapping so their colours match the legend exactly. Faded planets drop to 22 % brightness; edges are still hidden until focus.

## Why

- **Draw calls.** All planets are one `InstancedBufferGeometry` mesh with per-instance attributes (position, radius, seed, family, kind colour, star position and colour, fade). Atmospheres and rings are two more. Three draws whatever the number of nodes or kinds, against one per kind before.
- **No textures.** Procedural noise (simplex, fbm, Voronoi) means nothing to download, nothing to keep in memory per planet, and no repeats from a small texture set.
- **Static sky.** Baking costs one render of six faces when a project opens; after that the sky is a texture lookup. It never moves, which suits reduced motion.
- **Picking.** Planets are shaded spheres, so picking is a ray–sphere test per node (with a minimum radius so moons stay easy to click), no longer a mesh raycast.
- **Reduced motion.** Planet spin and cloud drift stop; lighting and the sky do not move anyway.

## Limits and next steps

- The fragment shader is the heaviest part of the frame. Phase 4 measures it at 500 nodes and, if needed, lowers detail for planets that are only a few pixels wide.
- Bloom and other post-processing are not used. Phase 4 can add them if the frame budget allows.
- If baking the sky fails (a very weak GPU), the plain dark background is used.
