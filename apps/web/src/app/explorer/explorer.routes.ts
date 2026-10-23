import type { Routes } from '@angular/router';
import { SYSTEM_RENDERER } from '../renderer/system-renderer';
import { ThreeSystemRenderer } from '../renderer/three-system-renderer';
import { Explorer } from './explorer';

/** Lazy-loaded, so Three.js stays out of the initial bundle. */
export const EXPLORER_ROUTES: Routes = [
  {
    path: '',
    component: Explorer,
    providers: [{ provide: SYSTEM_RENDERER, useValue: () => new ThreeSystemRenderer() }],
  },
];
