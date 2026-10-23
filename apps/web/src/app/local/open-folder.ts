import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FOLDER_LIMITS } from '@orrery/analyzer-angular/select-files';
import { DEFAULT_SAMPLE_ID } from '../samples/sample-catalog';
import type { PickedFile } from './analysis-protocol';
import { FolderAnalysis, LOCAL_SAMPLE_ID } from './folder-analysis';
import { formatBytes, formatCount } from './format';

/** `showDirectoryPicker` is not in TypeScript's DOM types yet (Chromium only). */
type DirectoryPicker = (options?: { mode?: 'read' }) => Promise<FileSystemDirectoryHandle>;

const STAGE_LABELS = {
  scanning: 'Listing files',
  reading: 'Reading files',
  parsing: 'Parsing',
} as const;

/**
 * Picks a folder on this computer and analyses it in a Web Worker, then
 * reports what was read, skipped and left unresolved. Uses the File System
 * Access API where the browser has it, so ignored folders are never opened,
 * and `<input webkitdirectory>` elsewhere.
 */
@Component({
  selector: 'app-open-folder',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-slate-950 text-slate-100' },
  template: `
    @let s = analysis.state();
    <header class="flex items-center gap-4 border-b border-slate-800 px-4 py-2">
      <a
        routerLink="/"
        class="text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-sky-400"
        >Orrery</a
      >
      <a [routerLink]="['/', sampleId]" [class]="linkClass">Back to the sample</a>
    </header>

    <main class="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <section class="space-y-3">
        <h1 class="text-2xl font-semibold">Analyse a folder on this computer</h1>
        <p class="text-slate-300">
          Pick an Angular project: the folder with <code>angular.json</code>, or one app inside a
          bigger repository. Orrery reads its <code>.ts</code> files and <code>tsconfig</code> files
          as text, in this tab.
          <strong class="text-slate-100">Nothing is uploaded, installed or run.</strong>
        </p>
        <p class="text-sm text-slate-400">
          Skipped: <code>node_modules</code>, <code>dist</code>, <code>coverage</code> and hidden
          folders such as <code>.git</code>. Limits: {{ limits.files }} source files,
          {{ limits.total }} in total, {{ limits.perFile }} per file.
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <button
            type="button"
            [class]="primaryClass"
            [disabled]="s.status === 'running'"
            (click)="pick(input)"
          >
            Choose a folder
          </button>
          <!-- A real click on the label opens the browser's own file chooser, so it works where the folder dialog does not. -->
          <label [class]="linkClass + ' cursor-pointer'">
            Folder dialog not working? Use the basic picker
            <input
              #input
              type="file"
              webkitdirectory
              multiple
              class="sr-only"
              data-testid="folder-input"
              [disabled]="s.status === 'running'"
              (change)="picked(input)"
            />
          </label>
        </div>
        @if (pickerProblem(); as problem) {
          <p role="alert" class="text-sm text-amber-200">{{ problem }}</p>
        }
      </section>

      <section aria-live="polite" class="space-y-4">
        @switch (s.status) {
          @case ('running') {
            <div class="space-y-2 rounded-lg border border-slate-800 p-4">
              <p>
                {{ stageLabel() }} in <strong>{{ s.folderName }}</strong>
                @if (s.total === null) {
                  · {{ format(s.done) }} found
                } @else {
                  · {{ format(s.done) }} of {{ format(s.total) }}
                }
              </p>
              <progress
                class="h-2 w-full accent-sky-400"
                [attr.value]="s.total === null ? null : s.done"
                [attr.max]="s.total"
                aria-label="Analysis progress"
              ></progress>
              <button type="button" [class]="secondaryClass" (click)="analysis.cancel()">
                Cancel
              </button>
            </div>
          }
          @case ('cancelled') {
            <p class="text-slate-300">
              Analysis of <strong>{{ s.folderName }}</strong> cancelled. Nothing was kept.
            </p>
          }
          @case ('failed') {
            <p role="alert" class="text-red-300">
              Could not analyse <strong>{{ s.folderName }}</strong
              >: {{ s.message }}
            </p>
          }
          @case ('over-limit') {
            <div role="alert" class="space-y-1 rounded-lg border border-amber-500/40 p-4">
              @if (s.limit === 'files') {
                <p>
                  <strong>{{ s.report.folderName }}</strong> has {{ format(s.actual) }} source
                  files; the limit is {{ format(s.allowed) }}.
                </p>
              } @else {
                <p>
                  The source files in <strong>{{ s.report.folderName }}</strong> add up to
                  {{ bytes(s.actual) }}; the limit is {{ bytes(s.allowed) }}.
                </p>
              }
              <p class="text-sm text-slate-300">
                Nothing was analysed. Pick a smaller folder, such as a single app's
                <code>src</code> folder.
              </p>
            </div>
          }
          @case ('done') {
            @let r = s.report;
            @let result = s.sample.result;
            <div class="space-y-4 rounded-lg border border-slate-800 p-4">
              <h2 class="text-lg font-semibold">{{ r.folderName }} is ready</h2>
              <p class="text-slate-300">
                {{ plural(r.sourceFiles, 'source file') }} read ({{ bytes(r.totalBytes) }}) ·
                {{ plural(result.graph.edges.length, 'relationship') }} ·
                {{ plural(result.graph.regions.length, 'region') }} ·
                {{ plural(result.unresolved.length, 'unresolved import') }}
              </p>
              <div class="flex flex-wrap gap-3">
                <a [routerLink]="['/', localId]" [class]="primaryClass">Open the 3D map</a>
                <a [routerLink]="['/', localId, 'list']" [class]="secondaryClass"
                  >List view and unresolved imports</a
                >
              </div>

              <h3 class="pt-2 font-semibold">What was left out</h3>
              <ul class="list-disc space-y-1 pl-5 text-sm text-slate-300">
                @if (!r.hasRootTsconfig) {
                  <li class="text-amber-200">
                    No <code>tsconfig.json</code> at the top of the folder, so path aliases such as
                    <code>&#64;app/…</code> show up as unresolved imports.
                  </li>
                }
                <li>
                  {{ plural(r.otherFiles, 'other file') }} (templates, styles, assets,
                  <code>.d.ts</code>) were counted but not read.
                </li>
                <li>
                  @if (r.tooLarge.length === 0) {
                    No file was over {{ limits.perFile }}.
                  } @else {
                    {{ plural(r.tooLarge.length, 'file') }} over {{ limits.perFile }} skipped:
                    <ul class="mt-1 list-none space-y-0.5">
                      @for (file of r.tooLarge; track file.path) {
                        <li>
                          <code>{{ file.path }}</code> · {{ bytes(file.size) }}
                        </li>
                      }
                    </ul>
                  }
                </li>
                <li>
                  @if (r.ignoredFolders.length === 0) {
                    No folder was skipped.
                  } @else {
                    <details>
                      <summary class="cursor-pointer">
                        {{ plural(r.ignoredFolders.length, 'skipped folder') }}, not opened
                      </summary>
                      <ul class="mt-1 space-y-0.5">
                        @for (folder of r.ignoredFolders; track folder) {
                          <li>
                            <code>{{ folder }}</code>
                          </li>
                        }
                      </ul>
                    </details>
                  }
                </li>
              </ul>
            </div>
          }
        }
      </section>
    </main>
  `,
})
export class OpenFolder {
  protected readonly analysis = inject(FolderAnalysis);
  protected readonly sampleId = DEFAULT_SAMPLE_ID;
  protected readonly localId = LOCAL_SAMPLE_ID;
  protected readonly limits = {
    files: formatCount(FOLDER_LIMITS.maxFiles),
    total: formatBytes(FOLDER_LIMITS.maxTotalBytes),
    perFile: formatBytes(FOLDER_LIMITS.maxFileBytes),
  };
  protected readonly format = formatCount;
  protected readonly plural = (count: number, noun: string) =>
    `${formatCount(count)} ${noun}${count === 1 ? '' : 's'}`;
  protected readonly bytes = formatBytes;

  /** Why the last folder dialog gave nothing, shown next to the buttons. */
  protected readonly pickerProblem = signal<string | null>(null);

  protected readonly stageLabel = computed(() => {
    const state = this.analysis.state();
    return state.status === 'running' ? STAGE_LABELS[state.stage] : '';
  });

  protected readonly linkClass =
    'text-sm text-slate-300 underline decoration-slate-500 underline-offset-2 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400';
  protected readonly primaryClass =
    'rounded-md bg-sky-500 px-4 py-2 font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300';
  protected readonly secondaryClass =
    'rounded-md border border-slate-600 px-4 py-2 text-slate-100 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-sky-400';

  protected async pick(input: HTMLInputElement): Promise<void> {
    this.pickerProblem.set(null);
    if (!('showDirectoryPicker' in window)) {
      input.click();
      return;
    }
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await (
        window as unknown as { showDirectoryPicker: DirectoryPicker }
      ).showDirectoryPicker({ mode: 'read' });
    } catch (error) {
      // A closed dialog and a refused permission prompt both arrive as AbortError, and some
      // embedded browsers refuse the dialog outright. Say so, and point at the basic picker:
      // opening it from here would need a fresh click, which an awaited dialog has used up.
      const name = error instanceof DOMException ? error.name : 'Error';
      this.pickerProblem.set(
        name === 'AbortError'
          ? 'No folder was opened. If you did pick one, this browser may not allow folder access: use the basic picker.'
          : `This browser's folder dialog failed (${name}). Use the basic picker instead.`,
      );
      return;
    }
    this.analysis.start({ kind: 'handle', name: handle.name, handle });
  }

  protected picked(input: HTMLInputElement): void {
    this.pickerProblem.set(null);
    const list = [...(input.files ?? [])];
    input.value = '';
    if (list.length === 0) return;
    // `webkitRelativePath` starts with the picked folder's name: `shop/src/main.ts`.
    const name = list[0]!.webkitRelativePath.split('/')[0] || 'folder';
    const files: PickedFile[] = list.map((file) => ({
      path: file.webkitRelativePath.split('/').slice(1).join('/'),
      file,
    }));
    this.analysis.start({ kind: 'files', name, files });
  }
}
