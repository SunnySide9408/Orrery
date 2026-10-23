# Orrery roadmap

The plan from Project Brief v2, turned into checks. The brief is still the source of truth. Where it leaves a value open, this file proposes one and marks it **(proposed)**. Confirm or change those values before the phase that needs them.

Each phase runs in its own thread and lands as one or more pull requests.

## Rules for every phase

### Done when (applies to every phase)

- CI is green on `main`: format, lint, typecheck, tests, build.
- The phase's checks below pass, and each one is backed by a test, a screenshot or a short note in the PR.
- **Preview check:** the running app is opened in the built-in browser and Arcadia has looked at it. See [Previews](#previews).
- New decisions have a short record in `docs/decisions/`.
- The README status line says which phase is live.

### Hard constraints

- No backend in v1. The site is static.
- Never execute or install code from an analysed repository. Nothing is uploaded.
- The TypeScript compiler loads only in the Web Worker, and only when someone analyses a folder.
- The Three.js render loop stays outside Angular change detection. Renderer objects never go into signals. All scene calls go through `SystemRenderer`.
- Layout is deterministic: the same input gives the same positions.
- Honest wording: "potentially affected according to static relationships", never "will break". Always show unresolved counts.
- v1 is out of scope for: backend and GitHub URLs, private repos, other frameworks, AI, collaboration, live sync, graph editing. DI edges wait for Phase 3, template edges for later.
- Check current library versions and docs before adding a dependency. Every decision must be explainable in an interview.
- Repo hygiene: commits authored as Samy, plain branch names, no assistant name in history.

### Visual style

- Dark space scene. Background `#020617` (Tailwind slate-950). UI panels in the slate scale; text `#f8fafc` on dark.
- Every visual encoding means something (structure, status, focus or change). Anything else is decoration and gets cut.
- Node kinds use colour **and** shape, never colour alone. Since the planet look pass (docs/decisions/0009), planets are procedural worlds: the kind sets the planet family and the marker, and the file path sets the individual look. `apps/web/src/app/renderer/kind-style.ts` is the reference, and the on-screen legend is generated from it:

  | Kind                           | Colour              | Planet family                      | Marker        |
  | ------------------------------ | ------------------- | ---------------------------------- | ------------- |
  | Component                      | `#60a5fa` blue      | ocean world                        | circle        |
  | Service                        | `#fbbf24` amber     | gas giant, always ringed           | ringed circle |
  | Directive                      | `#a78bfa` violet    | storm world                        | diamond       |
  | Pipe                           | `#34d399` green     | jungle world                       | hexagon       |
  | Guard / interceptor / resolver | red / orange / teal | lava / molten desert / cracked ice | triangle      |
  | NgModule / routes              | magenta / pink      | crystal world                      | square        |
  | Spec                           | `#94a3b8` grey      | cratered moon                      | dot           |
  | Other                          | `#cbd5e1` light     | rocky world                        | plus          |

- Each region has a star that lights its planets. The sky (nebulae, stars, galaxies) is baked once per project and stays dim behind the map.
- Edge colours: dependants amber `#fbbf24`, dependencies sky `#38bdf8`, lazy boundary dashed indigo `#818cf8`. Edges always show direction.
- Planet size encodes one metric, documented in the legend: **fan-in (proposed)**.
- Region labels are always visible at overview. Planet labels appear on zoom or focus. Labels must not overlap (open item from Phase 0).
- One motion layer at most, on the render loop. No GSAP plus something else.

### Interaction

- Semantic zoom: app → feature system → planet → (later) code.
- Edges are hidden until a node is hovered or focused.
- Focus: the selection and its relevant edges brighten; the rest fades but stays visible and clickable.
- A route back is always on screen: breadcrumbs and "reset to overview".
- Search finds files, components, services and routes, and glides to the result.
- Anything the 3D view says, the list or table view says too.

### Accessibility (proposed target: WCAG 2.2 AA)

- Text contrast at least 4.5:1 on panels; non-text indicators at least 3:1.
- Search, selection, inspector, breadcrumbs and reset all work by keyboard, with visible focus rings. Escape returns one level up.
- `prefers-reduced-motion`: no drift, instant or very short transitions. Tested in CI.
- The non-3D view is a real route (proposed `/list`), not a hidden fallback. It is also used when WebGL is missing or weak.
- The 3D canvas has a text summary for screen readers, and selection changes are announced.

### Previews

Arcadia checks every phase in the built-in browser before it counts as done, on their own PC (decided 2026-10-23):

- A Remote Control session on "samy-rog" pulls the phase branch (or `main`) into the git clone `C:\Projects\Orrery-phase1`, runs `npm install` and `npm start`, and opens `http://localhost:4200` in the built-in browser.
- This happens before the phase PR is merged, so problems are caught on the branch.
- There is no hosted preview link. The public live site (GitHub Pages, from `main`) is a separate step.

## Phase 0 · Visual proof (done)

Merged in PRs #2 and #3. Fixture of 40 nodes in 3 lazy features, orbit layout, Three.js explorer, inspector, focus on click.

Leftovers carried into Phase 1: label overlap in the dense core region; the README GIF needs recording on a real GPU.

## Phase 1 · Product shell and a real sample (weeks 2–3)

**Goal:** a live link a stranger can explore, built from a real open-source Angular app.

**Deliverables**

- Pick the demo app: public, MIT or similar, medium size, uses lazy routes and standalone components. Credit it in the README. **Chosen: Angular RealWorld** (docs/decisions/0004).
- `packages/analyzer-angular` (Node side): node kinds from decorators, lazy-route regions, standalone-import edges, file imports with relative paths and tsconfig aliases, unresolved list.
- `tools/cli`: analyses the sample into JSON shipped with the app.
- Angular shell: header, search, inspector panel, legend, breadcrumbs, reset, list/table view.
- Public deploy of `main` to a static host from GitHub Actions. **Chosen: GitHub Pages** (docs/decisions/0006). The workflow is manual for now; going live is Arcadia's call.
- First Playwright test: open sample → search → select → inspector shows the right facts.
- Name clash check for "Orrery" on GitHub and npm. **Done:** npm `orrery` is an empty placeholder and other uses are unrelated; the name stays.
- Fix the Phase 0 label overlap.

**Done when**

- The live URL loads the sample with no setup, and works offline once loaded.
- Components, services, directives, pipes and guards are labelled correctly on the sample (spot-check of 20 nodes against the source, listed in the PR).
- Lazy routes form regions. Unresolved imports are counted and shown.
- Search, focus and inspector agree with the list view for the same node.
- The sample path does not load the TypeScript compiler (checked in the build stats).
- Preview check done on the PC, and the live URL opens for a stranger.

## Phase 2 · Your own folder

**Goal:** a local Angular project yields its graph in the browser, and nothing leaves the machine.

**Deliverables**

- Folder picker (File System Access API, with `<input webkitdirectory>` fallback).
- Filtering of `node_modules`, `dist`, `.git` and non-source files; `tsconfig.json` read for aliases.
- Limits (confirmed 2026-10-23): 5,000 source files, 50 MB total, 1 MB per file, each with a clear message.
- The same analyser running in a Web Worker, with progress and cancel.
- Report of unresolved imports and skipped files.
- Playwright test on a fixture project.

**Done when**

- A real Angular project on Arcadia's PC opens as a graph in the browser.
- The UI never freezes during analysis, and cancel works.
- The network panel shows no request carrying source.
- Going over a limit shows the right message and count.
- Preview check done, including analysing a folder from the PC in the built-in browser.

## Phase 3 · Insights

Delivered in the phase-3-insights pull request; see docs/decisions/0008.

**Goal:** every finding can be traced to the nodes and paths that support it.

**Deliverables**

- Impact: transitive dependants with paths, revealed in graph-distance waves.
- Cycles (strongly connected components) and fan-in / fan-out with thresholds (confirmed 2026-10-23: flag at or above the 95th percentile, and never below 10).
- DI edges from `inject(X)` and constructor parameters; provider scope shown as a ring or badge.
- Findings panel: rule, threshold, limits and evidence (file and line) for each.

**Done when**

- Unit tests cover traversal, paths, cycles and metrics.
- Clicking AuthService on the sample answers "who uses AuthService?" in one click.
- Every finding links to its evidence; wording follows the honesty rule.
- Preview check done.

## Planet look pass (before Phase 4)

Delivered in the planet-look pull request; see docs/decisions/0009.

**Goal:** planets that look like real, unique worlds against a real-looking sky, without losing readability or speed.

**Done when**

- Every kind has its own planet family, and files of one kind do not repeat (unit test on 2,000 IDs).
- Kinds still differ without colour: surface, rings on services, marker shape in labels and legend.
- Planets, atmospheres and rings are three draw calls in total; the sky is baked once.
- Reduced motion stops spin and drift.
- Preview check done.

## Phase 4 · Cinematic polish

Delivered in the phase-4-motion pull request; see docs/decisions/0010. Baseline device: Arcadia's PC "samy-rog", NVIDIA GeForce RTX 4070 Laptop GPU. Measured: 120 fps (the display cap) at 500 nodes / 2,000 edges, in full and lite quality.

**Goal:** smooth effects that never block controls. The look itself was settled in the planet look pass, so this phase is about motion and speed.

**Deliverables**

- Formation reveal in waves, camera easing, progressive detail (labels and moons by zoom level), label pooling.
- WebGL capability detection that steps effects down or switches to the list view.
- Performance baseline on a named device (proposed: Arcadia's PC "samy-rog", with GPU model written down).

**Done when**

- 50–60 FPS at 500 nodes / 2,000 edges on the baseline device, measured and written down.
- Controls respond during every animation.
- No memory growth after 10 sample swaps (lifecycle test).
- Reduced motion still works end to end.
- Preview check done on the baseline device.

## Phase 5 · Launch

**Goal:** a reviewer understands the product and the engineering in five minutes.

**Deliverables**

- README: GIF of the 10-second "wow", live link, 30-second start, architecture diagram, limitations.
- Decision records: why Three.js, static analysis only, no backend, Angular kind detection and its limits, edge direction, deterministic layout, performance budget.
- End-to-end suite covering open → search → select → inspect → impact, plus folder analysis.
- Accessibility pass: keyboard, contrast, reduced motion, non-3D route.

**Done when**

- Someone who has never seen it finds the "wow" moment unaided.
- All tests and CI green; live URL on the CV and LinkedIn.
- Final preview check on the live URL.
