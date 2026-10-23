import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { GraphNode, Region } from '@orrery/contracts';
import { KIND_STYLES } from '../renderer/kind-style';
import { ExplorerState } from '../shell/explorer-state';

interface Row {
  node: GraphNode;
  /** Path inside the region's folder; the full path is in the region heading and the tooltip. */
  shortPath: string;
  kindLabel: string;
  color: string;
  dependants: number;
  dependencies: number;
  moons: number;
}

interface RegionGroup {
  region: Region;
  /** Enclosing regions, outermost first, e.g. "app / core". */
  path: string;
  rows: Row[];
}

/**
 * The same facts as the 3D map, as tables: one per region, one row per file.
 * A real route, not a hidden fallback, so it can be linked, read by screen
 * readers and used without WebGL. Specs appear as a count on the file they test.
 */
@Component({
  selector: 'app-list-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block size-full overflow-y-auto' },
  template: `
    <div
      class="space-y-8 px-4 py-4"
      [class.max-w-6xl]="!state.focus()"
      [class.md:pr-[22rem]]="state.focus()"
    >
      <h1 class="sr-only">{{ state.sample().info.name }}: list of files by region</h1>
      @for (group of groups(); track group.region.id) {
        <section [attr.aria-labelledby]="'region-' + $index">
          <h2 [id]="'region-' + $index" class="flex items-baseline gap-2 text-base font-semibold">
            <span>{{ group.region.label }}</span>
            @if (group.region.kind === 'lazy-route') {
              <span class="rounded bg-indigo-500/20 px-1 text-xs font-normal text-indigo-200"
                >lazy route</span
              >
            }
            <span class="text-xs font-normal text-slate-400"
              >{{ group.path }} · {{ group.region.rootPath }}</span
            >
          </h2>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="text-xs text-slate-400">
                <tr>
                  <th scope="col" class="py-1 pr-3 font-medium">Name</th>
                  <th scope="col" class="py-1 pr-3 font-medium">Kind</th>
                  <th
                    scope="col"
                    class="hidden py-1 pr-3 font-medium xl:table-cell"
                    [class.md:table-cell]="!state.focus()"
                  >
                    Path
                  </th>
                  <th scope="col" class="py-1 pr-3 text-right font-medium">Lines</th>
                  <th scope="col" class="py-1 pr-3 text-right font-medium whitespace-nowrap">
                    Used by
                  </th>
                  <th scope="col" class="py-1 pr-3 text-right font-medium">Imports</th>
                  <th scope="col" class="py-1 text-right font-medium">Specs</th>
                </tr>
              </thead>
              <tbody>
                @for (row of group.rows; track row.node.id) {
                  @let selected = row.node.id === state.selectedId();
                  <tr class="border-t border-slate-800" [class.bg-slate-800]="selected">
                    <th scope="row" class="py-1 pr-3 font-normal">
                      <button
                        type="button"
                        class="rounded px-1 text-left text-slate-100 hover:underline focus-visible:outline-2 focus-visible:outline-sky-400"
                        [attr.aria-current]="selected ? 'true' : null"
                        (click)="state.select(row.node.id)"
                      >
                        {{ row.node.name }}
                      </button>
                    </th>
                    <td class="py-1 pr-3 whitespace-nowrap">
                      <span
                        class="mr-1 inline-block size-2 rounded-full"
                        [style.background]="row.color"
                      ></span>
                      {{ row.kindLabel }}
                    </td>
                    <td
                      class="hidden py-1 pr-3 font-mono text-xs whitespace-nowrap text-slate-300 xl:table-cell"
                      [class.md:table-cell]="!state.focus()"
                    >
                      <span [title]="row.node.path">{{ row.shortPath }}</span>
                    </td>
                    <td class="py-1 pr-3 text-right tabular-nums">
                      {{ row.node.metrics.linesOfCode }}
                    </td>
                    <td class="py-1 pr-3 text-right tabular-nums" data-column="used-by">
                      {{ row.dependants }}
                    </td>
                    <td class="py-1 pr-3 text-right tabular-nums">{{ row.dependencies }}</td>
                    <td class="py-1 text-right tabular-nums">{{ row.moons || '' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section aria-labelledby="unresolved-heading">
        <h2 id="unresolved-heading" class="text-base font-semibold">
          Unresolved imports ({{ unresolved().length }})
        </h2>
        <p class="text-xs text-slate-400">
          Imports of project files that the analyser could not match to a file. Package imports such
          as
          <code>&#64;angular/core</code> are not counted.
        </p>
        @if (unresolved().length > 0) {
          <ul class="mt-2 space-y-1 text-sm">
            @for (item of unresolved(); track $index) {
              <li>
                <code class="text-amber-200">{{ item.specifier }}</code>
                in
                <code class="text-slate-300"
                  >{{ item.location.path }}:{{ item.location.line }}</code
                >
                · {{ item.reason }}
              </li>
            }
          </ul>
        } @else {
          <p class="mt-2 text-sm text-slate-300">
            None: every import of a project file was resolved.
          </p>
        }
      </section>
    </div>
  `,
})
export class ListView {
  protected readonly state = inject(ExplorerState);
  protected readonly unresolved = computed(() => this.state.sample().result.unresolved);

  protected readonly groups = computed<RegionGroup[]>(() => {
    const { result, index } = this.state.sample();
    const regions = new Map(result.graph.regions.map((region) => [region.id, region]));
    const moons = new Map<string, number>();
    for (const node of result.graph.nodes) {
      if (node.ownerId) moons.set(node.ownerId, (moons.get(node.ownerId) ?? 0) + 1);
    }
    const trail = (region: Region): string[] => {
      const parent = region.parentId ? regions.get(region.parentId) : undefined;
      return parent ? [...trail(parent), parent.label] : [];
    };

    return result.graph.regions
      .map((region) => ({
        region,
        path: [...trail(region), region.label].join(' / '),
        rows: result.graph.nodes
          .filter((node) => node.regionId === region.id && node.ownerId === undefined)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((node) => ({
            node,
            shortPath: node.path.startsWith(`${region.rootPath}/`)
              ? node.path.slice(region.rootPath.length + 1)
              : node.path,
            kindLabel: KIND_STYLES[node.kind].label,
            color: KIND_STYLES[node.kind].color,
            dependants: index.dependantsOf(node.id).length,
            dependencies: index.dependenciesOf(node.id).length,
            moons: moons.get(node.id) ?? 0,
          })),
      }))
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => a.path.localeCompare(b.path));
  });
}
