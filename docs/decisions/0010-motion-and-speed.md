# 0010. Motion, detail and graphics quality

- Status: accepted
- Date: 2026-10-23

## Decision

**One motion layer.** Every animation (the opening reveal, camera glides, impact waves, planet spin) runs on the renderer's single `setAnimationLoop`. No animation library.

**Formation reveal.** When a project opens, each star grows in, then planets spiral out of their star to their orbit, inner orbits first (about 1.8 s in all). Rings, orbits and labels fade in, and the camera glides in from further out at the same time.

**Controls never wait.** Glides no longer switch the orbit controls off. Any drag or scroll stops the glide where it is and hands over. Glide length grows with distance (0.6 to 1.4 s), so speed feels the same for short and long trips.

**Zoom to the pointer.** `OrbitControls.zoomToCursor`: scrolling zooms towards what is under the mouse.

**Edges.** Edges are fat lines (`LineSegments2`), because WebGL lines are always one device pixel. Their width follows the zoom: 1.6 px at the overview, 0.8 px close up, with lower opacity, so they never cover the planets they connect.

**Progressive detail.** With nothing selected, a planet gets its label once it is 7 px wide on screen, and its moons (spec files) once it is 18 px wide. With a selection, the highlighted nodes are labelled as before.

**Labels.** Labels are a pool of 80 HTML elements placed in screen space each frame (`label-layer.ts`), not one `CSS2DObject` per node. Each label tries four spots around its planet (above, below, right, left) and takes the first free one; otherwise it is hidden. Region labels go first, then the focused node, the hovered node, and bigger planets before smaller ones. Region labels sit centred under their ring and move aside when two rings are close. All labels also keep out from under the panels over the map (the hint, the legend and the frame-rate readout, marked `data-keep-clear`). Text sizes are measured once and cached, and panel positions are read every 30 frames, so the frame loop does not force layout.

**Backdrop galaxy.** The big galaxy behind the map is baked into its own 2048² texture (in lite: 1024², with 512² cube faces instead of 1024², which also shortens the one-off bake on a software GPU) and drawn as one quad that follows the camera, instead of living in the 1024² cube map, where it was stretched to about a third of screen resolution. Its shader gained spurs between the arms, dust lanes broken into filaments, a finer star field and grain in the bulge.

**Graphics quality** (chosen by Arcadia: automatic, with a toggle):

- `full`: bloom, pixel ratio up to 2.
- `lite`: no bloom passes, drawn straight to the screen at pixel ratio 1, and the sky baked at half size.
- By default the renderer starts in full and steps down to lite once if the frame rate stays under 45 fps over 3 s (after a 1.5 s warm-up, ignoring time in a hidden tab). Software WebGL (SwiftShader, llvmpipe, Basic Render Driver) starts in lite.
- A "Lite graphics" switch in the legend shows the quality in use and overrides it; the choice is kept in `localStorage`. When the step-down was automatic, the legend says so.
- No WebGL at all still shows the list view, as before.

**Performance check.** `/perf` is a generated map at the budget (500 files, 2,000 edges), drawn with every edge visible as the worst case. It is not in the sample catalog, so nothing links to it. Adding `?fps` to any map shows a readout: fps, frame time, draw calls, nodes, edges, labels, quality and GPU.

**Measured baseline** (2026-10-23, Arcadia's PC "samy-rog", NVIDIA GeForce RTX 4070 Laptop GPU, Chrome-based browser via ANGLE/D3D11, 120 Hz display): `/perf` with all 2,000 edges drawn runs at 120 fps (8.3 ms a frame) in full quality (76 draw calls) and in lite (62 draw calls). Both sit at the display cap, so the budget of 50–60 fps is met with room to spare; what lite saves shows only on weaker GPUs.

## Why

- Readability and control come first: animations are short, can be interrupted, and never hide controls.
- Pooling and screen-space placement keep label cost flat as projects grow, and placing around the planet keeps more names on screen than hiding on first overlap.
- Stepping down only once, and never with a manual choice, avoids flicking between modes.

## Reduced motion

No reveal, no glides, no spin, impact waves shown at once, from the first frame (`setReducedMotion` is now called before `setGraph`). A browser test records every state the readout reports and fails if anything animates.

## Tests

- Unit: step-down monitor (slow, fast, hidden tab, warm-up), frame counter, GPU names, the generated test map (size, validity, determinism, layout).
- Browser: reduced motion stays still; the map opens with a reveal otherwise; the graphics switch is remembered; and after 10 client-side sample swaps the WebGL geometry and texture counts and the DOM size are unchanged (a separate Playwright project that runs last, because it keeps the CPU busy).
