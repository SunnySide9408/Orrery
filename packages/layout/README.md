# @orrery/layout

Turns a `DependencyGraph` into a `Layout` (region centres, radii and node positions). No Angular, no Three.js, no DOM; ESLint enforces this.

`orbitLayout` places root regions at the centre and child regions on a ring around them. Inside a region, planets fill concentric orbits in a fixed order (by kind, then ID), and moons (specs) sit beside their planet. There is no randomness, so the same graph always gives the same positions.
