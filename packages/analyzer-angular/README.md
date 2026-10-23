# @orrery/analyzer-angular

Empty in Phase 0. From Phase 1 it parses `.ts` files with the TypeScript compiler API and returns an `AnalysisResult` from `@orrery/contracts`: Angular node kinds from decorators, lazy-route regions, file imports and standalone imports.

It must run both in Node (the CLI that pre-analyses samples) and in a Web Worker (folder analysis), so it uses no Node-only APIs. It only parses source text; it never executes or installs repository code.
