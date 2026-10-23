import { parseAnalysisResult } from '@orrery/contracts';
import { describe, expect, it } from 'vitest';
import { analyzeAngularProject, type ProjectFile } from './analyze';

/** A small Angular app written to hit every rule once. */
const files: ProjectFile[] = [
  {
    path: 'tsconfig.json',
    text: `{
      // comments are allowed, as in real tsconfig files
      "compilerOptions": { "baseUrl": "./", "paths": { "@shared/*": ["src/app/shared/*"] } }
    }`,
  },
  {
    path: 'src/main.ts',
    text: `import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
bootstrapApplication(App);`,
  },
  {
    path: 'src/app/app.ts',
    text: `import { Component } from '@angular/core';
import { HeaderComponent } from './core/header.component';
import { HomeStore } from './features/home/home.store';
@Component({ selector: 'app-root', imports: [HeaderComponent], template: '' })
export class App {}`,
  },
  {
    path: 'src/app/app.routes.ts',
    text: `import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/pages/home.component') },
  { path: 'admin', canActivate: [authGuard], loadChildren: () => import('./features/admin/admin.routes') },
  { path: 'login', loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent) },
];`,
  },
  {
    path: 'src/app/core/auth.service.ts',
    text: `import { Injectable } from '@angular/core';
import type { User } from './user.model';
@Injectable({ providedIn: 'root' })
export class AuthService { user: User | null = null; }`,
  },
  {
    path: 'src/app/core/auth.service.spec.ts',
    text: `import { AuthService } from './auth.service';
it('works', () => new AuthService());`,
  },
  { path: 'src/app/core/user.model.ts', text: `export interface User { name: string }` },
  {
    path: 'src/app/core/auth.guard.ts',
    text: `import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
export const authGuard: CanActivateFn = () => inject(AuthService).user !== null;`,
  },
  {
    path: 'src/app/core/legacy.guard.ts',
    text: `import { Injectable as Service } from '@angular/core';
import { CanActivate } from '@angular/router';
@Service() export class LegacyGuard implements CanActivate { canActivate() { return true; } }`,
  },
  {
    path: 'src/app/core/token.interceptor.ts',
    text: `import { HttpInterceptorFn } from '@angular/common/http';
export const tokenInterceptor: HttpInterceptorFn = (req, next) => next(req);`,
  },
  {
    path: 'src/app/core/header.component.ts',
    text: `import { Component } from '@angular/core';
import { AuthService } from './auth.service';
import { LogoComponent } from '@shared/logo.component';
import { missing } from './does-not-exist';
import './header.css';
@Component({ selector: 'app-header', imports: [LogoComponent], template: '' })
export class HeaderComponent { constructor(readonly auth: AuthService) {} }`,
  },
  {
    path: 'src/app/shared/logo.component.ts',
    text: `import { Component } from '@angular/core';
@Component({ selector: 'app-logo', template: '' })
export class LogoComponent {}`,
  },
  {
    path: 'src/app/shared/upper.pipe.ts',
    text: `import { Pipe, PipeTransform } from '@angular/core';
@Pipe({ name: 'upper' }) export class UpperPipe implements PipeTransform { transform(v: string) { return v; } }`,
  },
  {
    path: 'src/app/shared/focus.directive.ts',
    text: `import { Directive } from '@angular/core';
@Directive({ selector: '[appFocus]' }) export class FocusDirective {}`,
  },
  {
    path: 'src/app/features/home/pages/home.component.ts',
    text: `import { Component } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { HomeCardComponent } from '../components/home-card.component';
@Component({ selector: 'app-home', imports: [HomeCardComponent], template: '' })
export default class HomeComponent { constructor(readonly auth: AuthService) {} }`,
  },
  {
    path: 'src/app/features/home/components/home-card.component.ts',
    text: `import { Component } from '@angular/core';
@Component({ selector: 'app-home-card', template: '' }) export class HomeCardComponent {}`,
  },
  {
    path: 'src/app/features/admin/admin.routes.ts',
    text: `import { Route } from '@angular/router';
const routes: Route[] = [{ path: 'users', loadComponent: () => import('./users/users.component') }];
export default routes;`,
  },
  {
    path: 'src/app/features/admin/users/users.component.ts',
    text: `import { Component } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { UpperPipe } from '@shared/upper.pipe';
@Component({ selector: 'app-users', imports: [UpperPipe], template: '' })
export default class UsersComponent {}`,
  },
  {
    path: 'src/app/login/login.component.ts',
    text: `import { Component } from '@angular/core';
@Component({ selector: 'app-login', template: '' }) export class LoginComponent {}`,
  },
  // Lives in a lazy feature folder but the app shell imports it, so it is eager.
  {
    path: 'src/app/features/home/home.store.ts',
    text: `import { Injectable } from '@angular/core';
@Injectable({ providedIn: 'root' }) export class HomeStore {}`,
  },
  // A decorator with the right name that is not Angular's: must not count.
  {
    path: 'src/app/shared/not-angular.ts',
    text: `import { Component } from 'some-other-lib';
@Component() export class Widget {}`,
  },
];

const result = analyzeAngularProject({
  projectName: 'test-app',
  ref: 'abc123',
  createdAt: '2026-10-23T00:00:00.000Z',
  files,
});
const node = (path: string) => result.graph.nodes.find((n) => n.path === `src/app/${path}`);
const edgeKinds = (source: string, target: string) =>
  result.graph.edges
    .filter((e) => e.sourceId === `src/app/${source}` && e.targetId === `src/app/${target}`)
    .map((e) => e.kind)
    .sort();

describe('analyzeAngularProject', () => {
  it('returns a valid analysis result', () => {
    expect(() => parseAnalysisResult(JSON.parse(JSON.stringify(result)))).not.toThrow();
    expect(result.graph.nodes).toHaveLength(files.length - 1);
  });

  it('labels Angular kinds from decorators, interfaces and type annotations', () => {
    expect(
      Object.fromEntries(result.graph.nodes.map((n) => [n.path.replace('src/app/', ''), n.kind])),
    ).toMatchObject({
      'app.ts': 'component',
      'app.routes.ts': 'route-config',
      'core/auth.service.ts': 'service',
      'core/auth.service.spec.ts': 'spec',
      'core/user.model.ts': 'other',
      'core/auth.guard.ts': 'guard',
      'core/legacy.guard.ts': 'guard',
      'core/token.interceptor.ts': 'interceptor',
      'shared/upper.pipe.ts': 'pipe',
      'shared/focus.directive.ts': 'directive',
      'features/admin/admin.routes.ts': 'route-config',
      'shared/not-angular.ts': 'other',
    });
  });

  it('names nodes after their main class or function, else the file', () => {
    expect(node('core/auth.service.ts')?.name).toBe('AuthService');
    expect(node('core/auth.guard.ts')?.name).toBe('authGuard');
    expect(node('features/home/pages/home.component.ts')?.name).toBe('HomeComponent');
    expect(node('app.routes.ts')?.name).toBe('app.routes');
    expect(node('core/auth.service.spec.ts')?.name).toBe('auth.service.spec');
  });

  it('makes specs moons of the file they test', () => {
    expect(node('core/auth.service.spec.ts')?.ownerId).toBe('src/app/core/auth.service.ts');
  });

  it('turns lazy-loaded feature folders into regions', () => {
    const regions = Object.fromEntries(result.graph.regions.map((r) => [r.id, r.parentId ?? null]));
    expect(regions).toEqual({
      'folder:src/app': null,
      'folder:src/app/core': 'folder:src/app',
      'folder:src/app/shared': 'folder:src/app',
      'folder:src/app/features': 'folder:src/app',
      'lazy-route:src/app/features/home': 'folder:src/app/features',
      'lazy-route:src/app/features/admin': 'folder:src/app/features',
      'lazy-route:src/app/login': 'folder:src/app',
    });
    expect(node('features/home/components/home-card.component.ts')?.regionId).toBe(
      'lazy-route:src/app/features/home',
    );
    expect(node('features/admin/users/users.component.ts')?.regionId).toBe(
      'lazy-route:src/app/features/admin',
    );
    expect(node('core/auth.service.spec.ts')?.regionId).toBe('folder:src/app/core');
    expect(result.graph.nodes.find((n) => n.path === 'src/main.ts')?.regionId).toBe(
      'folder:src/app',
    );
  });

  it('keeps eagerly imported files out of lazy regions', () => {
    expect(node('features/home/home.store.ts')?.regionId).toBe('folder:src/app/features');
  });

  it('records imports, lazy routes and standalone imports as separate edge kinds', () => {
    expect(edgeKinds('app.routes.ts', 'features/admin/admin.routes.ts')).toEqual(['lazy-route']);
    expect(
      edgeKinds('features/admin/admin.routes.ts', 'features/admin/users/users.component.ts'),
    ).toEqual(['lazy-route']);
    expect(edgeKinds('core/header.component.ts', 'shared/logo.component.ts')).toEqual([
      'import',
      'standalone-import',
    ]);
    expect(edgeKinds('core/header.component.ts', 'core/auth.service.ts')).toEqual(['import']);
    expect(edgeKinds('core/auth.service.ts', 'core/user.model.ts')).toEqual(['import']);
  });

  it('resolves tsconfig path aliases', () => {
    expect(edgeKinds('features/admin/users/users.component.ts', 'shared/upper.pipe.ts')).toEqual([
      'import',
      'standalone-import',
    ]);
  });

  it('keeps evidence for every edge', () => {
    const edge = result.graph.edges.find(
      (e) => e.id === 'lazy-route:src/app/app.routes.ts->src/app/features/admin/admin.routes.ts',
    );
    expect(edge?.evidence).toEqual([{ path: 'src/app/app.routes.ts', line: 5 }]);
  });

  it('lists unresolved imports and ignores packages', () => {
    expect(result.unresolved).toEqual([
      {
        kind: 'import',
        location: { path: 'src/app/core/header.component.ts', line: 4 },
        specifier: './does-not-exist',
        reason: 'No matching file in the project',
      },
      {
        kind: 'import',
        location: { path: 'src/app/core/header.component.ts', line: 5 },
        specifier: './header.css',
        reason: 'Not a TypeScript source file',
      },
    ]);
  });

  it('gives identical output for the same input, whatever the file order', () => {
    const again = analyzeAngularProject({
      projectName: 'test-app',
      ref: 'abc123',
      createdAt: '2026-10-23T00:00:00.000Z',
      files: [...files].reverse(),
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(result));
  });
});
