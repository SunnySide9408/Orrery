# 0002. Analysis-result contract and stable IDs

- Status: accepted
- Date: 2026-10-23

## Decision

- The contract lives in `packages/contracts` as zod schemas; the TypeScript types are inferred from them. A JSON result entering the app goes through `parseAnalysisResult`, which validates the shape and then the cross-references (unique IDs, no dangling edges or regions).
- We use `zod/mini` imported as `import * as z`, because the classic build put about 430 kB of locales into the initial bundle.
- Edge direction: `sourceId` depends on `targetId`. Dependants of a node are the sources of its incoming edges. Why: docs/decisions/0016.
- IDs come only from the analysed code, never from counters or timestamps:
  - node: the file path, normalised relative to the project root (`src/app/core/auth.service.ts`);
  - region: `kind:rootPath` (`lazy-route:src/app/features/checkout`);
  - edge: `kind:source->target`, so at most one edge of a kind between two nodes;
  - finding: `category:` plus the sorted node IDs.
- Layout is a separate type from the graph; positions are a view concern.

## Why

Stable IDs let the layout stay deterministic, let a selection survive a re-analysis, and make test fixtures readable. Validating at the boundary means a malformed sample or a bug in the analyser shows up as a clear list of problems, not as a broken scene.

## Limits

One file is one node. A file that declares two classes is shown as one node named after its main export. Revisit if real samples show this hides too much.
