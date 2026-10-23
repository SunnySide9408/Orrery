# 0007. Analysing a local folder in a Web Worker

- Status: accepted
- Date: 2026-10-23

## Decision

- `/open` lets a visitor pick a folder. Where the browser has the File System Access API (`showDirectoryPicker`, Chromium), the page passes the directory handle to the worker. Elsewhere it uses `<input webkitdirectory>` and passes the file list.
- One module worker (`apps/web/src/app/local/analysis.worker.ts`) does everything after the pick: walks the folder, picks the files, reads them as text, and runs the same `analyzeAngularProject` as the CLI. The page only shows progress. Cancel calls `worker.terminate()`, which stops it at once wherever it is.
- Skipped without being opened: `node_modules`, `dist`, `coverage`, `out-tsc`, `tmp` and hidden folders (`.git`, `.angular`). The CLI uses the same rule (`isIgnoredFolder`).
- Read: `.ts` files (not `.d.ts`) and every `tsconfig*.json`, so path aliases and `extends` chains inside the folder resolve. Other files are only counted.
- Limits, confirmed by Arcadia: 5,000 source files and 50 MB in total stop the analysis before any file is read, with the count; a file over 1 MB is skipped and listed. They are checked on sizes from the listing, so an over-limit folder costs only the walk.
- The result goes through `parseAnalysisResult` and the same layout as a bundled sample, then opens at `/local` with the same 3D map, list view and inspector. It lives in memory only: a reload goes back to the picker.

## Why a worker

Parsing a few thousand files takes seconds; on the main thread it would freeze the page and the cancel button with it. In a worker the page keeps responding, and terminating the worker is a cancel that needs no cooperation from the analyser. It also keeps the TypeScript compiler (about 800 kB gzipped) in its own file, loaded only when someone picks a folder.

## Why the handle goes to the worker

With a directory handle the worker never enumerates `node_modules`, which in a real project can hold more files than the app itself. The `webkitdirectory` fallback cannot avoid that: the browser lists everything before the page sees it, and the worker drops ignored paths.

## Nothing leaves the machine

The worker makes no network request. Files are read with `File.text()` and the result stays in the tab. An end-to-end test records every request while a folder is analysed and fails on any non-GET request, any request body, or another origin. `npm run check:bundle` fails if the compiler or the analyser appears anywhere but the worker (`select-files.ts`, which holds only the limits shown on the page, is allowed). The service worker caches the analysis worker lazily, on first use, so visitors who never pick a folder never download it.

## Limits

- Only the picked folder is read. A `tsconfig.json` that `extends` a file above it loses that parent's aliases, and imports through them show as unresolved; the report says when there is no root `tsconfig.json`.
- Angular workspaces with several apps are analysed as one graph. Picking one app's folder gives a cleaner picture.
- Firefox and Safari use the fallback, which lists ignored folders too; large `node_modules` make the pick slower there, not the analysis.
