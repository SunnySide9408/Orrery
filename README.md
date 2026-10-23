# Orrery

Your Angular app, as a living solar system. Orrery is a visual architecture explorer for Angular applications: lazy routes and feature folders become solar systems, components and services become planets, and their relationships become edges you can follow.

Status: Phase 0 (visual proof on a hand-written fixture). Nothing is deployed yet.

## Getting started

Requires Node 24 (see `.nvmrc`).

```bash
npm install
npm start          # http://localhost:4200
```

| Command                | What it does                                             |
| ---------------------- | -------------------------------------------------------- |
| `npm run lint`         | ESLint over the whole repo, including package boundaries |
| `npm run typecheck`    | `tsc` for every package and the app                      |
| `npm test`             | Vitest for the packages, then `ng test` for the app      |
| `npm run build`        | Production build of the app into `dist/web`              |
| `npm run format:check` | Prettier check                                           |

CI runs all of these on every pull request.

## Layout

```
apps/web                   Angular explorer
packages/contracts         analysis-result types, validation, ID rules
packages/analyzer-angular  TypeScript compiler API → analysis result (later)
packages/graph-core        traversal, impact, cycles, metrics (later)
packages/layout            deterministic positions (later)
docs/decisions             architecture decision records
```

See [docs/decisions](docs/decisions) for why it is shaped this way.

## License

MIT
