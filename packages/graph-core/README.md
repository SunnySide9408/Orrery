# @orrery/graph-core

Pure TypeScript graph algorithms over a `DependencyGraph`. No Angular, no Three.js, no DOM; ESLint enforces this.

Phase 0 has `createGraphIndex`: outgoing and incoming edges per node, direct dependencies and direct dependants. Transitive dependants with paths, cycles (strongly connected components), fan-in and fan-out come in Phase 3.
