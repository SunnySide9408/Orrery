# 0004. One real sample, analysed at build time

- Status: accepted
- Date: 2026-10-23

## Decision

- The live site ships one real app: the [Angular RealWorld example](https://github.com/gothinkster/angular-realworld-example-app) (Conduit), MIT licence, pinned to commit `dd99ed2`.
- `tools/cli` clones the sample at that commit into a temporary folder, reads its `src/**/*.ts` and root `tsconfig*.json` as text, runs `@orrery/analyzer-angular`, validates the result against the contract, and writes `apps/web/public/samples/realworld.json`. `npm run samples` does all of this.
- The JSON is committed. The app fetches it at runtime and never sees the TypeScript compiler (`npm run check:bundle` fails the build if it does).
- `createdAt` is the sample commit's date, not the time of the run, so regenerating gives byte-identical output. CI regenerates it on every PR and fails if the committed file differs.

## Why RealWorld

The brief asks for a public, permissively licensed, medium-sized app that uses lazy routes and standalone components. RealWorld is on Angular 21, fully standalone, loads every page with `loadComponent`/`loadChildren`, and has the kinds the explorer distinguishes: services, components, a directive, pipes, functional interceptors and route files. At 48 files it is readable at a glance; `UserService` gives the same "click it, see who depends on it" moment as `AuthService` in the Phase 0 fixture.

angular-spotify was the alternative: 518 files, Nx, mostly NgModules on Angular 17. Bigger, but older in style and too dense to read before Phase 4's semantic zoom.

## Why build time and committed JSON

- The visitor gets the graph instantly, with no compiler download.
- Nothing from the sample is installed or executed: `git clone` only downloads files, and the analyser only parses text.
- The committed file makes the site build offline and reproducible, and a diff of it shows exactly what an analyser change does to real output.

## Limits

Only `src/` is analysed. The sample's guards are inline arrow functions in `app.routes.ts`, so they are part of that file rather than nodes of their own; guard detection is covered by the analyser's unit tests instead.
