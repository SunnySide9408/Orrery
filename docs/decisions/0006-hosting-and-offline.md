# 0006. Static hosting on GitHub Pages, offline with a service worker

- Status: accepted
- Date: 2026-10-23

## Decision

- `main` deploys to GitHub Pages from GitHub Actions (`.github/workflows/deploy.yml`) at https://sunnyside9408.github.io/Orrery/. For now the workflow runs only when started by hand: the app is used locally until it is ready to show. Adding a `push` trigger makes every merge deploy. The build uses `--base-href /Orrery/`, and every runtime URL (the sample JSON, the service worker) is relative, so the same build works at any path.
- Pages has no rewrite rules, so `index.html` is also published as `404.html`; deep links like `/Orrery/realworld/list?node=…` then open the app.
- `@angular/service-worker` prefetches the app and the sample JSON on the first visit. After that the site opens without a network. An end-to-end test goes offline and reopens the page.
- The selection lives in the URL (`?node=<file path>`), so a link opens the same view and the browser's Back button steps through selections.

## Why GitHub Pages

It needs no account, no secret and no billing: the workflow uses the repository's own token. The repository is public, the site is static, and the brief rules out a backend in v1. Firebase Hosting was the alternative; it adds a project and a service-account secret for no feature we use yet. Moving later means changing one workflow.

## Consequences

- Before the first deploy, Settings → Pages → Source must be "GitHub Actions" (it is "Deploy from a branch" today).
- Every visitor gets the latest deploy on their next visit after the service worker sees a new version; that is the service worker's normal update cycle.
