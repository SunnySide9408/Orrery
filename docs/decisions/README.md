# Decision records

Short records of the choices that shape Orrery: the context, what was decided, why, and the limits. Each one can be read on its own. The one-line answers below are the short version.

| #                                           | Question                                  | Short answer                                                                                                                                   |
| ------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001](0001-workspace-layout.md)            | How is the code split up?                 | npm workspaces: the app plus four framework-free packages (contracts, analyser, graph, layout); ESLint enforces the boundaries.                |
| [0002](0002-contract-and-ids.md)            | What does an analysis result look like?   | A zod-validated contract; every ID comes from the code (file paths), never from counters, so results are stable and diffable.                  |
| [0003](0003-renderer-boundary.md)           | How do Angular and Three.js talk?         | Angular owns meaning, Three.js only draws, behind a typed `SystemRenderer` interface; frames never touch change detection.                     |
| [0004](0004-bundled-sample.md)              | Why a pre-analysed sample?                | The Angular RealWorld app is analysed at build time and shipped as JSON: instant, offline, reproducible, and the compiler is never downloaded. |
| [0005](0005-angular-analysis-rules.md)      | How are Angular kinds and edges detected? | Decorators and typed functions imported from `@angular/core`, one file at a time, no type checker; the limits are listed.                      |
| [0006](0006-hosting-and-offline.md)         | Where is it hosted?                       | GitHub Pages from GitHub Actions on every merge; a service worker makes it work offline.                                                       |
| [0007](0007-folder-analysis-in-a-worker.md) | How is a local folder analysed?           | In a Web Worker, with the same analyser as the CLI; nothing leaves the machine, and a test proves it.                                          |
| [0008](0008-insights-and-di.md)             | What are impact, findings and DI edges?   | Breadth-first impact waves with paths; cycles and fan-in/out at the 95th percentile (never below 10); `inject()` and constructor edges.        |
| [0009](0009-procedural-planets.md)          | How are the planets drawn?                | One shader, one draw call; each file's path seeds its own planet, each kind is a planet family, no textures.                                   |
| [0010](0010-motion-and-speed.md)            | How does it stay smooth and readable?     | One animation loop, interruptible glides, pooled labels with semantic zoom, and an automatic lite mode for weak GPUs.                          |
| [0011](0011-why-threejs.md)                 | Why Three.js?                             | A renderer, not an engine or a graph library: full control of layout and look, small enough to lazy-load, well known.                          |
| [0012](0012-static-analysis-only.md)        | Why static analysis only?                 | Reading text is safe for strangers' code, runs anywhere (even in a browser) and is predictable; what it cannot see is shown, not hidden.       |
| [0013](0013-no-backend.md)                  | Why no backend?                           | Privacy by construction, nothing to run or pay for; GitHub-URL analysis is the feature that would bring one back.                              |
| [0014](0014-performance-budget.md)          | What is the performance budget?           | 50–60 fps at 500 files / 2,000 edges (measured: 120 fps), a small initial bundle, the compiler only in the worker, no memory growth.           |
| [0015](0015-deterministic-layout.md)        | Why not a force-directed layout?          | Positions come from sorted IDs and counts, so the map never reshuffles and position itself means something (region, kind).                     |
| [0016](0016-edge-direction.md)              | Which way do edges point?                 | Source depends on target, like an `import`; dependants are incoming edges, and impact walks them outwards.                                     |

New records get the next number. A record that is replaced keeps its text and gets a note pointing to the new one.
