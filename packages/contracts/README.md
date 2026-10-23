# @orrery/contracts

The shape of an analysis result, shared by the analyser that produces it and the web app that renders it.

- `schema.ts`: zod schemas for nodes, edges, regions, findings, unresolved items, the analysis result and the layout. The TypeScript types are inferred from them, so static types and runtime checks cannot drift.
- `ids.ts`: stable ID rules. IDs come only from paths and kinds, so the same code always gives the same IDs.
- `validate.ts`: `parseAnalysisResult` validates untrusted JSON, then checks cross-references (unique IDs, no dangling edges, IDs that follow the rules).

Edge direction: `sourceId` depends on `targetId`. A component that imports `AuthService` is the source; `AuthService` is the target.
