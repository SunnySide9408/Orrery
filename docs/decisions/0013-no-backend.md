# 0013. No backend in version 1

- Status: accepted
- Date: 2026-10-23

## Context

Many code-visualisation tools take a GitHub URL, clone it on a server and send back a result. That needs a server, storage, quotas, abuse protection and a policy for other people's code.

## Decision

Version 1 is a static site. There is no server, no database, no account and no upload.

- **Bundled samples** are analysed at build time by the CLI and shipped as JSON (docs/decisions/0004).
- **A visitor's folder** is analysed in their own browser, in a Web Worker; the result stays in the tab (0007).
- **Hosting** is GitHub Pages, deployed from GitHub Actions on every merge to `main` (0006). A service worker makes the site work offline after the first visit.

## Why

- **Privacy by construction.** "Nothing leaves your machine" is a property of the architecture, not a promise in a policy. An end-to-end test records every request during a folder analysis and fails on any upload or any other origin.
- **Nothing to run or pay for.** No secrets, no billing, no uptime. The live link keeps working while the project is idle, which matters for a portfolio piece.
- **Smaller attack surface.** The riskiest feature, analysing untrusted code, runs in the visitor's sandboxed browser on their own files.
- **Same analyser everywhere.** Because the analyser is a pure function of file texts, the CLI and the worker share it, and so would a future server.

## What we give up, and how it could come back

- **GitHub-URL analysis** is the obvious next feature. GitHub's unauthenticated API is limited (60 requests an hour per IP), so doing it well needs a small backend or the visitor's own token. If a backend is added, the brief's ingestion rules apply: validated URLs only, safe extraction, no execution, quotas, short retention.
- **Sharing a local analysis** by link is not possible: the result lives in memory. Exporting the result JSON would be a small, server-free step.
- **Private repositories** stay out of scope.
