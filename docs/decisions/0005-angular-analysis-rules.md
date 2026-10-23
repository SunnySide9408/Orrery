# 0005. How the analyser reads Angular code

- Status: accepted
- Date: 2026-10-23

## Decision

`@orrery/analyzer-angular` parses each file on its own with `ts.createSourceFile`: no type checker, no `Program`, no `node_modules`. That keeps it fast, identical in Node and in a Web Worker (Phase 2), and its limits easy to state. It is a pure function of the file texts, so the same input always gives the same output.

**Node kinds**, first match wins:

1. `*.spec.ts` → spec, a moon of the file with the same name without `.spec`.
2. A class decorator imported from `@angular/core` (aliases included): `@Component`, `@Directive`, `@Pipe`, `@NgModule`, `@Injectable`. An `@Injectable` that `implements CanActivate`/`CanMatch`/… is a guard, `HttpInterceptor` an interceptor, `Resolve` a resolver; otherwise a service. A decorator with the same name from another package does not count.
3. A variable typed `CanActivateFn` (and the other guard function types), `HttpInterceptorFn`, `ResolveFn`, `Routes` or `Route[]` → guard, interceptor, resolver or routes.
4. Anything else → other (models, configs, helpers).

The node's name is the decorated class or typed function, else the first export, else the file name.

**Edges** (source depends on target):

- `import`: every `import`/`export … from` and every other `import()` of a project file.
- `standalone-import`: a class listed in `imports: [...]` of `@Component`, `@Directive` or `@NgModule`, matched to the file it was imported from. It sits next to the plain import edge on purpose: one says "the file mentions it", the other "the template can use it".
- `lazy-route`: an `import()` inside `loadComponent` or `loadChildren`.
- `inject` (Phase 3): `inject(X)`, a constructor parameter typed `X`, or `@Inject(X)`. See docs/decisions/0008.

Specifiers resolve like TypeScript's bundler resolution: relative paths, `.ts`/`/index.ts`, `.js` written for `.ts`, `paths` aliases and `baseUrl` from `tsconfig.json` (following relative `extends`). A bare specifier that matches no project file is a package and is ignored. A relative or aliased one that matches nothing goes into `unresolved` with the file, line and reason; the app shows the count.

**Regions:**

- Each lazy-route target starts a feature region. Its folder is the target's folder, widened to the feature when it sits under a container folder (`features`, `pages`, `modules`, `views`, `routes`): `features/article/pages/home/home.component.ts` belongs to `features/article`.
- A file in a feature folder belongs to the lazy region only if lazy code alone reaches it. A file imported, directly or not, from anywhere outside the lazy folders is eager and goes to the folder region of its top-level folder (`core`, `shared`). In RealWorld this puts `UserService` in `core` although it sits in `core/auth`, next to the lazily loaded login page: that matches what actually ships in the initial bundle.
- Everything else belongs to the app region (`src/app`).

## Limits

- No type information: a class decorated through a re-exported alias of `Component`, or a guard typed through a custom alias, is labelled "other".
- Template usage without an `imports` entry (NgModule declarations elsewhere) is not an edge. Template edges are a later phase; DI edges came in Phase 3 (docs/decisions/0008).
- Dynamic specifiers (`import(variable)`) are skipped.
- TypeScript 7 replaces the JavaScript compiler API with a native one; the analyser stays on TypeScript 6 until that API settles.
