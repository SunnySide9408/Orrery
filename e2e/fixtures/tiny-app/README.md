# tiny-app

A small hand-written Angular project for the folder-analysis end-to-end test
(`e2e/folder.spec.ts`). It is only ever parsed, never built or run.

- a `@core/*` path alias in `tsconfig.json`;
- two lazy features (`orders` by `loadComponent`, `admin` by `loadChildren`);
- one import that cannot resolve (`../../missing/thing`);
- a template, a stylesheet and `angular.json`, which are counted but not read.

The test copies it to a temporary folder and adds `node_modules` and `.git`
there, to check that they are skipped.
