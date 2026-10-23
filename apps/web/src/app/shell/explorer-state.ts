import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import type { Region } from '@orrery/contracts';
import { map } from 'rxjs';
import type { LoadedSample } from '../samples/loaded-sample';
import { describeFocus } from './focus';

/**
 * The selection and the sample, shared by the 3D map, the list view and the
 * inspector, so every view says the same thing about the same node.
 *
 * The selected node lives in the URL (`?node=<id>`): it survives a reload,
 * can be shared as a link, and Back returns to the previous selection.
 * Provided by the shell component, so it lives as long as one sample is open.
 */
@Injectable()
export class ExplorerState {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly sample = toSignal(this.route.data.pipe(map((data) => data['sample'] as LoadedSample)), {
    requireSync: true,
  });
  private readonly requestedId = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('node'))),
    { requireSync: true },
  );

  /** The selected node's ID, or `null` for the overview. Unknown IDs count as no selection. */
  readonly selectedId = computed(() => {
    const id = this.requestedId();
    return id && this.sample().index.node(id) ? id : null;
  });
  readonly focus = computed(() => {
    const id = this.selectedId();
    const { result, index } = this.sample();
    return id ? describeFocus(result, index, id) : null;
  });
  /** The selected node's region and its enclosing regions, outermost first. */
  readonly regionTrail = computed(() => {
    const regionId = this.focus()?.node.regionId;
    const regions = new Map(this.sample().result.graph.regions.map((r) => [r.id, r]));
    const trail: Region[] = [];
    for (let region = regionId ? regions.get(regionId) : undefined; region;) {
      trail.unshift(region);
      region = region.parentId ? regions.get(region.parentId) : undefined;
    }
    return trail;
  });

  /** Bumped by "Reset view", so the map returns to the overview even with nothing selected. */
  readonly resets = signal(0);

  select(nodeId: string | null): void {
    if (nodeId === this.selectedId()) return;
    void this.router.navigate([], {
      queryParams: { node: nodeId },
      queryParamsHandling: 'merge',
    });
  }

  selectByName(name: string): void {
    this.select(this.sample().result.graph.nodes.find((node) => node.name === name)?.id ?? null);
  }

  reset(): void {
    this.select(null);
    this.resets.update((count) => count + 1);
  }
}
