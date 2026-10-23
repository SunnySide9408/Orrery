import type { Routes } from '@angular/router';
import { sampleResolver } from './samples/loaded-sample';
import { DEFAULT_SAMPLE_ID } from './samples/sample-catalog';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: DEFAULT_SAMPLE_ID },
  {
    path: ':sample',
    title: 'Orrery',
    loadComponent: () => import('./shell/shell').then((m) => m.Shell),
    resolve: { sample: sampleResolver },
    // Re-run the resolver only when the sample changes, not when the selection does.
    runGuardsAndResolvers: 'paramsChange',
    children: [
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
    ],
  },
  { path: '**', redirectTo: '' },
];
