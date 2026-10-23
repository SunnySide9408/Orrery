# 0015. A deterministic layout

- Status: accepted
- Date: 2026-10-23

## Context

Most graph tools place nodes with a force simulation: nodes push each other apart and edges pull them together until things settle. It looks organic, but the result depends on the starting positions, the number of steps and every node in the graph. Orrery is a map people come back to and share links to.

## Decision

`packages/layout` (`orbitLayout`) places everything from sorted IDs and counts, with no randomness and no simulation:

- **Regions are solar systems.** Root regions sit at the centre. Child regions (lazy features, folders) are spaced evenly on a ring around their parent. The ring is sized by each child's full extent, including its own children, so families never overlap.
- **Planets fill orbits.** Inside a region, files are sorted by kind (route files, services, components, directives, pipes, guards, resolvers, interceptors, modules, other), then by ID. Orbit _k_ holds 6*k* planets, so spacing along every orbit stays similar.
- **Moons follow their planet.** A spec file sits next to the file it tests.
- **Sorting is by code unit**, not `localeCompare`, so the order does not change with the visitor's language settings.
- The output carries a `layoutVersion` (`orbit-3` today), bumped whenever the algorithm changes.

## Why

- **A stable mental map.** The same project looks the same on every load, on every machine. People learn where `core` and each feature live, and a shared link opens the same picture.
- **Small changes stay small.** Adding a file moves only the files after it in the same region (and, if the region needs a new orbit, the rings around it); nothing else reshuffles.
- **Structure carries meaning.** Position says something true: which region a file belongs to, and its kind, by orbit. A force layout says only "these are connected", which the edges already show on focus.
- **Testable and cheap.** It is a pure function: tests compare exact positions, and it runs in linear time, against a simulation's many iterations over all pairs.

## Limits

- Edges do not shape the layout, so two related files in different regions can be far apart. That is on purpose: focus mode draws the edges between them, and the camera frames both.
- A region with hundreds of files gets many orbits and becomes large. Semantic zoom (labels and moons appear as planets grow on screen, 0010) keeps it readable.
