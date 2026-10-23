# 0016. Edge direction: source depends on target

- Status: accepted
- Date: 2026-10-23

## Decision

Every edge points the way an `import` reads: `sourceId` depends on `targetId`. `header.component.ts` imports `user.service.ts`, so the edge is header → user service. All edge kinds follow it: `import`, `standalone-import`, `lazy-route` and `inject` (docs/decisions/0005, 0008).

From that one rule:

- **Dependencies** of a node are the targets of its outgoing edges ("what it uses").
- **Dependants** are the sources of its incoming edges ("who uses it").
- **Impact** is a breadth-first walk over incoming edges, outwards from the selected node: everything that could be affected by a change to it (`traceImpact` in `@orrery/graph-core`).
- **Fan-out** counts distinct targets, **fan-in** distinct sources (0008).

## Why

- It matches the code. An edge is created where the `import` statement is written, with that file and line as evidence, so the source of the edge is the file that holds the evidence.
- It matches the tools people know: TypeScript's module graph, bundler stats and dependency-cruiser all draw "importer → imported".
- The question Orrery's "wow" answers, "who depends on AuthService?", is then simply "incoming edges", and impact is the same walk repeated.

## Consequences

- One edge per kind between two files (the edge ID is `kind:source->target`, 0002), so a file that imports and injects the same service has two edges, each with its own evidence.
- In the 3D view, edges into the focused node are amber (dependants) and edges out of it sky blue (dependencies), and each edge runs from dim at the dependant to bright at the dependency, so the direction reads without arrowheads.
