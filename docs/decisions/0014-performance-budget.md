# 0014. Performance budget

- Status: accepted
- Date: 2026-10-23

## Context

A 3D explorer is easy to make pretty and slow. The brief sets the budget up front, as targets to measure against rather than promises, and asks to measure before adding effects. This record collects the budget, where each number is checked, and what was measured.

## The budget

| What                | Budget                                                  | Checked by                                                                 | Measured (2026-10-23)                                      |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Frame rate          | 50–60 fps at 500 files / 2,000 edges on a named desktop | `/perf` map with every edge drawn, `?fps` readout (0010)                   | 120 fps (display cap) on an RTX 4070 laptop, full and lite |
| Initial bundle      | warning at 500 kB, error at 1 MB (raw)                  | Angular build budgets in `angular.json`                                    | 303 kB raw, 82 kB transferred                              |
| 3D scene            | not in the initial bundle                               | the explorer route is lazy (0003)                                          | 140 kB gzipped lazy chunk, Three.js included               |
| TypeScript compiler | only in the folder-analysis worker, only when used      | `npm run check:bundle` in CI fails otherwise (0007)                        | 811 kB gzipped worker, never loaded for samples            |
| Analysis            | the page never freezes; cancel works at once            | the analyser runs in a Web Worker; cancel terminates it                    | progress and cancel stay live during analysis              |
| Memory              | no growth after repeated project swaps                  | e2e: 10 sample swaps, WebGL geometry/texture counts and DOM size unchanged | passes in CI                                               |
| Folder size         | 5,000 source files, 50 MB in total, 1 MB per file       | checked from the listing, before any file is read (0007)                   | confirmed by Arcadia                                       |

## How the frame budget is kept

- **Few draw calls.** All planets are one instanced shader mesh; atmospheres and rings one more each (0009). The `/perf` worst case is 76 draw calls in full quality.
- **Draw less.** Edges are hidden until something is focused; labels are a pool of 80, placed only for planets at least 7 px wide; moons appear at 18 px (0010).
- **No work in Angular per frame.** The render loop is outside change detection (0003); label placement reads panel positions every 30 frames, not every frame.
- **Step down, once.** Below 45 fps over 3 s the renderer drops bloom and renders at pixel ratio 1 (lite). Software WebGL starts in lite. Visitors can override it in the legend.
- **Bake what does not move.** The sky and the backdrop galaxy are rendered once into textures when a project opens.

## Why these numbers

- 50–60 fps is what feels smooth on common 60 Hz screens; above it the work is invisible, below it camera glides stutter.
- 500 files and 2,000 edges is a large single Angular app. Bigger workspaces are better read one app at a time (0007).
- The initial bundle stays small because the first screen should be the map, not a spinner. Everything heavy (Three.js, the compiler) is lazy.

## Limits

- The frame rate has been measured on one fast GPU only. The lite step-down is the plan for weaker ones; the CI browser renders in software and is used for correctness, not speed.
- Frame time is measured by the app itself (`?fps`), not by an external profiler.
