# 0008. Insights: impact, findings and DI edges

- Status: accepted
- Date: 2026-10-23

## Decision

**DI edges.** The analyser adds an `inject` edge (source depends on target) for:

- `inject(X)` where `inject` comes from `@angular/core`, aliases included, anywhere in the file (fields, functional guards and interceptors);
- a constructor parameter typed `X`, or marked `@Inject(X)`.

`X` must be imported from a project file, exactly like standalone imports; tokens and classes from packages (`HttpClient`, `Router`) are not project nodes. The edge sits next to the plain import edge on purpose: one says "the file mentions it", the other "the injector hands it over".

**Provider scope.** Each node may list where it is provided (`GraphNode.providers`, with file and line): `root`, `platform` or `any` from `@Injectable({ providedIn })` (`module` when `providedIn` names a module), and `component`, `module`, `route` or `application` from the place a `providers` / `viewProviders` array is written. The inspector shows them as badges. Providers in spec files (test modules) are skipped.

**Impact** (`traceImpact` in `@orrery/graph-core`): a breadth-first walk over incoming edges from the selected node. Breadth-first gives the graph-distance waves and one shortest path per dependant; each wave is visited in ID order, so the paths are the same on every run. The inspector lists the waves with "via …" paths; "Show full impact" (`?impact=1`) lights the whole set in the 3D map, wave by wave, with the impact tree as edges. Reduced motion shows all waves at once.

**Findings** (`computeFindings`), computed by the analyser into `AnalysisResult.findings`, so the CLI and the worker give the same result:

- **Cycles:** strongly connected components with more than one node (Tarjan, iterative so long chains cannot overflow the stack). Evidence: one shortest loop through the component's first node. Severity: warning. No threshold.
- **High fan-in / fan-out:** distinct direct dependants / dependencies. Flagged at or above the 95th percentile (nearest rank) of the project's own counts, and never below 10 (confirmed by Arcadia, 2026-10-23). Evidence: one path per neighbour. Severity: info.
- Specs are left out of all three: a spec depends on the file it tests by design.

Each finding carries its rule, threshold, limits and evidence paths; every step of a path is an edge with file and line. The Findings view (`/<sample>/findings`) shows them all, and the inspector links to the findings of the selected node.

**Wording.** Every count of dependants says "potentially affected … according to static relationships". Findings are "review signals", never defects.

## Why

- Percentile plus minimum: a fixed number is noisy on big projects and silent on small ones; a pure percentile flags something in every project, however healthy. The minimum keeps small apps quiet (RealWorld flags two files).
- "At or above" the percentile, not "above": with fewer than 20 files the 95th percentile is the largest count, so "above" could never flag anything.
- Findings in the result rather than in the page: one place computes them, and the shipped JSON can be read without the app.

## Limits

- No type checker: a token re-exported through a barrel file points at the barrel; an `inject()` of a variable or a generic type is skipped; providers built by functions (`provideHttpClient()`, `provideX()`) are not read.
- Type-only imports count towards cycles and fan-out, although they disappear at runtime.
- Template usage that is not in an `imports` array is not an edge, so a component used only in templates looks less used than it is.
- `application` scope means "a `providers` array outside a decorator or route"; it is usually `ApplicationConfig` but is not checked.
