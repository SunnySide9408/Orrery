import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NODE_KINDS, SCHEMA_VERSION } from '@orrery/contracts';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-h-dvh bg-slate-950 text-slate-100' },
  template: `
    <main class="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 class="text-4xl font-semibold tracking-tight">Orrery</h1>
      <p class="text-slate-400">Your Angular app, as a living solar system.</p>
      <p class="text-sm text-slate-500">
        Contract schema v{{ schemaVersion }} · {{ nodeKindCount }} node kinds
      </p>
    </main>
    <router-outlet />
  `,
})
export class App {
  protected readonly schemaVersion = SCHEMA_VERSION;
  protected readonly nodeKindCount = NODE_KINDS.length;
}
