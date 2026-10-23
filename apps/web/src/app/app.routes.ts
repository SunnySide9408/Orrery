import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Orrery',
    loadChildren: () => import('./explorer/explorer.routes').then((m) => m.EXPLORER_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
