# @orrery/graph-core

Pure TypeScript graph algorithms over a `DependencyGraph`. No Angular, no Three.js, no DOM; ESLint enforces this.

- `createGraphIndex`: outgoing and incoming edges per node, direct dependencies and direct dependants.
- `traceImpact`: transitive dependants in graph-distance waves, with one shortest path each.
- `findCycles`, `shortestCycle`: strongly connected components and a short loop as evidence.
- `degrees`, `percentile`, `flagThreshold`: fan-in and fan-out with a percentile-plus-minimum threshold.
- `computeFindings`: cycles, high fan-in and high fan-out, each with rule, threshold, limits and evidence.

The rules are in [docs/decisions/0008](../../docs/decisions/0008-insights-and-di.md).
