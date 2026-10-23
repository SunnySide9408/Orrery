import { inject, Injectable } from '@angular/core';
import { RedirectCommand, Router, type ResolveFn } from '@angular/router';
import { parseAnalysisResult, type AnalysisResult, type Layout } from '@orrery/contracts';
import { createGraphIndex, type GraphIndex } from '@orrery/graph-core';
import { orbitLayout } from '@orrery/layout';
import { DEFAULT_SAMPLE_ID, SAMPLE_CATALOG, type SampleInfo } from './sample-catalog';

/** A sample ready to show: validated, indexed and laid out once, then shared by every view. */
export interface LoadedSample {
  info: SampleInfo;
  result: AnalysisResult;
  index: GraphIndex;
  layout: Layout;
}

export function prepareSample(info: SampleInfo, json: unknown): LoadedSample {
  // Validated at the boundary: a bad file fails here with a list of problems, not in the scene.
  const result = parseAnalysisResult(json);
  return {
    info,
    result,
    index: createGraphIndex(result.graph),
    layout: orbitLayout(result.graph),
  };
}

@Injectable({ providedIn: 'root' })
export class SampleLoader {
  private readonly cache = new Map<string, Promise<LoadedSample>>();

  load(info: SampleInfo): Promise<LoadedSample> {
    let loaded = this.cache.get(info.id);
    if (!loaded) {
      // Relative to <base href>, so it works under the GitHub Pages sub-path too.
      loaded = fetch(`samples/${info.id}.json`)
        .then((response) => {
          if (!response.ok) throw new Error(`Sample "${info.id}": HTTP ${response.status}`);
          return response.json() as Promise<unknown>;
        })
        .then((json) => prepareSample(info, json));
      loaded.catch(() => this.cache.delete(info.id));
      this.cache.set(info.id, loaded);
    }
    return loaded;
  }
}

/** Loads the sample named in the URL; unknown names go to the default sample. */
export const sampleResolver: ResolveFn<LoadedSample> = (route) => {
  const info = SAMPLE_CATALOG.find((sample) => sample.id === route.paramMap.get('sample'));
  if (!info) {
    return new RedirectCommand(inject(Router).parseUrl(`/${DEFAULT_SAMPLE_ID}`));
  }
  return inject(SampleLoader).load(info);
};
