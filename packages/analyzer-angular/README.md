# @orrery/analyzer-angular

Parses `.ts` files with the TypeScript compiler API and returns an `AnalysisResult` from `@orrery/contracts`: Angular node kinds from decorators and typed functions, lazy-route regions, file imports, standalone imports, and a list of unresolved imports.

```ts
analyzeAngularProject({ projectName, ref, createdAt, files: [{ path, text }] });
```

It is a pure function of the file texts: no file system, clock or network, so it runs both in Node (the CLI that pre-analyses samples) and in a Web Worker (folder analysis, Phase 2). It only parses source text; it never executes or installs repository code.

The rules and their limits are in [docs/decisions/0005](../../docs/decisions/0005-angular-analysis-rules.md).
