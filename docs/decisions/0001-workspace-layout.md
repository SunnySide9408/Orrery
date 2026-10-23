# 0001. Workspace layout and package boundaries

- Status: accepted
- Date: 2026-10-23

## Context

Orrery has four concerns that must not leak into each other: parsing Angular source, graph algorithms, layout, and rendering in an Angular app. The analyser must run in two places (a Node CLI at build time and a Web Worker in the browser), and the graph and layout code must be testable without a browser.

## Decision

One repository with npm workspaces:

| Path                        | Role                                                                | May depend on    |
| --------------------------- | ------------------------------------------------------------------- | ---------------- |
| `apps/web`                  | Angular explorer (standalone, zoneless, Tailwind)                   | everything below |
| `packages/contracts`        | Types and runtime validation of an analysis result; stable ID rules | `zod` only       |
| `packages/analyzer-angular` | TypeScript compiler API → analysis result                           | `contracts`      |
| `packages/graph-core`       | Traversal, impact, cycles, metrics                                  | `contracts`      |
| `packages/layout`           | Deterministic positions                                             | `contracts`      |

- Packages are consumed as TypeScript source (`"exports": "./src/index.ts"`), so there is no package build step; the Angular builder and Vitest compile them directly.
- ESLint forbids `@angular/*`, `three` and `rxjs` inside `packages/`, so the boundary is checked on every PR rather than by convention.
- Packages are tested with plain Vitest; the app uses Angular's Vitest integration (`ng test`).

## Why not Nx or pnpm

Nx adds caching and project-graph tooling that a five-package repo does not need yet, and every extra tool is something to explain. npm workspaces ship with Node. Moving to pnpm or Nx later is a mechanical change if build times or dependency hygiene start to hurt.

## Consequences

- Adding a package means a folder with `package.json`, `tsconfig.json` and `src/index.ts`; `npm install` links it.
- Because packages ship source, they are not publishable to npm as they are. That is fine: nothing is published in v1.
