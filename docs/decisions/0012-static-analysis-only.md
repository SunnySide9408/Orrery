# 0012. Static analysis only

- Status: accepted
- Date: 2026-10-23

## Context

Orrery could learn about an app in two ways: read its source (static analysis), or build and run it and watch what happens (dynamic analysis, such as a bundle stats file or runtime tracing). It also has to analyse code from strangers: a public sample, and any folder a visitor picks.

## Decision

Orrery only reads source text. It never installs dependencies, never builds and never executes a project's code, and it never needs the project's `node_modules`.

- The analyser parses each file on its own with `ts.createSourceFile` (no type checker, no `Program`). The rules are in docs/decisions/0005.
- Everything it reports is worded as static: "potentially affected according to static relationships", "review signals", never "will break" or "defect" (0008).
- What it cannot see is counted and shown: unresolved imports with file, line and reason; files skipped for size.

## Why

- **Safety.** Running someone's build means running their scripts. A picked folder or a cloned sample can contain anything; parsing text cannot run it. This is the one rule that makes a "drop your folder in" feature acceptable.
- **Works anywhere.** Parsing needs no Node.js, no network and no installed packages, so the same function runs in the CLI and in a browser worker (0007), and a half-broken project still gives a graph.
- **Speed and predictability.** One file at a time, no type checker: a few seconds for thousands of files, and the same input always gives the same output, which makes the shipped JSON diffable and testable.
- **Honest limits.** Without types the rules are simple enough to state in one page, and a reviewer can check them.

## Limits

- No type information: aliases of Angular decorators, barrel re-exports of injection tokens and generic `inject()` calls are missed or point at the barrel (0005, 0008).
- No template parsing yet: a component used only in a template, not in an `imports` array, looks less used than it is.
- Static is not runtime: a dynamic `import(variable)` is skipped, and type-only imports count as dependencies although they vanish at runtime.

Adding the type checker later is possible (it needs a `Program` over all files, more memory, and still no `node_modules`), but every limit above is written down first, in the app and in these records.
