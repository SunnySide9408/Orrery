import type { Routes } from '@angular/router';
import { LOCAL_SAMPLE_ID, localResolver } from './local/folder-analysis';
import { sampleResolver } from './samples/loaded-sample';
import { DEFAULT_SAMPLE_ID } from './samples/sample-catalog';

/** The 3D map and the list view, the same for a bundled sample and a local folder. */
const VIEWS: Routes = [
  {
    path: '',
    title: 'Orrery · 3D map',
    loadChildren: () => import('./explorer/explorer.routes').then((m) => m.EXPLORER_ROUTES),
  },
  {
    path: 'list',
    title: 'Orrery · List',
    loadComponent: () => import('./list/list-view').then((m) => m.ListView),
  },
  {
    path: 'findings',
    title: 'Orrery · Findings',
    loadComponent: () => import('./findings/findings-view').then((m) => m.FindingsView),
  },
];

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: DEFAULT_SAMPLE_ID },
  {
    path: 'open',
    title: 'Orrery · Analyse a folder',
    loadComponent: () => import('./local/open-folder').then((m) => m.OpenFolder),
  },
  {
    path: LOCAL_SAMPLE_ID,
    title: 'Orrery',
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    resolve: { sample: localResolver },
    runGuardsAndResolvers: 'paramsChange',
    children: VIEWS,
  },
  {
    path: ':sample',
    title: 'Orrery',
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    resolve: { sample: sampleResolver },
    // Re-run the resolver only when the sample changes, not when the selection does.
    runGuardsAndResolvers: 'paramsChange',
    children: VIEWS,
  },
  { path: '**', redirectTo: '' },
];
