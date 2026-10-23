import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type { GraphNode, Region } from '@orrery/contracts';
import { KIND_STYLES } from '../renderer/kind-style';
import { searchNodes } from './search-nodes';

/**
 * Search box following the WAI-ARIA combobox pattern: focus stays in the
 * input, arrow keys move the active option, Enter picks it, Escape closes the
 * list (and only then lets Escape reach the page).
 */
@Component({
  selector: 'app-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block' },
  template: `
    <label for="node-search" class="sr-only">Search files, components, services and routes</label>
    <input
      id="node-search"
      type="search"
      role="combobox"
      autocomplete="off"
      placeholder="Search…  (press /)"
      aria-autocomplete="list"
      aria-controls="node-search-results"
      [attr.aria-expanded]="open()"
      [attr.aria-activedescendant]="open() && hits().length > 0 ? optionId(active()) : null"
      [value]="query()"
      (input)="onInput($any($event.target).value)"
      (keydown)="onKeydown($event)"
      (focus)="open.set(query() !== '')"
      (blur)="open.set(false)"
      class="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-sky-400"
    />
    <ul
      id="node-search-results"
      role="listbox"
      aria-label="Search results"
      [hidden]="!open()"
      class="absolute inset-x-0 top-full z-20 mt-1 max-h-96 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 py-1 shadow-xl"
    >
      @for (hit of hits(); track hit.node.id; let i = $index) {
        <!-- Keyboard is handled on the input (combobox pattern); mousedown keeps focus there. -->
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
        <li
          role="option"
          [id]="optionId(i)"
          [attr.aria-selected]="i === active()"
          (mousedown)="$event.preventDefault()"
          (click)="pick(i)"
          (mousemove)="active.set(i)"
          class="flex cursor-pointer items-baseline gap-2 px-3 py-1.5 text-sm"
          [class.bg-slate-700]="i === active()"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            [style.background]="style(hit.node).color"
          ></span>
          <span class="font-medium text-slate-100">{{ hit.node.name }}</span>
          <span class="truncate text-xs text-slate-300"
            >{{ style(hit.node).label }} · {{ hit.regionLabel }}</span
          >
        </li>
      } @empty {
        <li class="px-3 py-1.5 text-sm text-slate-300">No matches</li>
      }
    </ul>
  `,
})
export class Search {
  readonly nodes = input.required<readonly GraphNode[]>();
  readonly regions = input.required<readonly Region[]>();
  readonly selected = output<string>();

  protected readonly query = signal('');
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly hits = computed(() => searchNodes(this.nodes(), this.regions(), this.query()));

  protected style(node: GraphNode) {
    return KIND_STYLES[node.kind];
  }

  protected optionId(index: number): string {
    return `node-search-option-${index}`;
  }

  protected onInput(value: string): void {
    this.query.set(value);
    this.active.set(0);
    this.open.set(value.trim() !== '');
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.hits().length;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.open.set(true);
        if (count > 0) this.active.update((i) => (i + 1) % count);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (count > 0) this.active.update((i) => (i - 1 + count) % count);
        break;
      case 'Enter':
        if (this.open() && count > 0) {
          event.preventDefault();
          this.pick(this.active());
        }
        break;
      case 'Escape':
        if (this.open() || this.query() !== '') {
          // Close the list first; the next Escape goes up a level on the page.
          event.stopPropagation();
          if (this.open()) this.open.set(false);
          else this.query.set('');
        }
        break;
    }
  }

  protected pick(index: number): void {
    const hit = this.hits()[index];
    if (!hit) return;
    this.selected.emit(hit.node.id);
    this.query.set('');
    this.open.set(false);
  }
}
