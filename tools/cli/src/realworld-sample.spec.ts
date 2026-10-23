import { readFileSync } from 'node:fs';
import { parseAnalysisResult, type NodeKind } from '@orrery/contracts';
import { describe, expect, it } from 'vitest';

/**
 * Checks the shipped RealWorld JSON against facts read by hand from the
 * sample's source at the pinned commit (the Phase 1 spot-check). If the
 * analyser changes, `npm run samples` regenerates the JSON and this test says
 * whether the facts still hold.
 */
const result = parseAnalysisResult(
  JSON.parse(
    readFileSync(
      new URL('../../../apps/web/public/samples/realworld.json', import.meta.url),
      'utf8',
    ),
  ),
);
const byPath = new Map(result.graph.nodes.map((node) => [node.path.replace('src/app/', ''), node]));

/** Path → [kind, name], each checked against the decorator or type annotation in the source. */
const SPOT_CHECK: Record<string, [NodeKind, string]> = {
  'core/auth/services/user.service.ts': ['service', 'UserService'],
  'core/auth/services/jwt.service.ts': ['service', 'JwtService'],
  'core/auth/auth.component.ts': ['component', 'AuthComponent'],
  'core/auth/if-authenticated.directive.ts': ['directive', 'IfAuthenticatedDirective'],
  'core/interceptors/api.interceptor.ts': ['interceptor', 'apiInterceptor'],
  'core/interceptors/error.interceptor.ts': ['interceptor', 'errorInterceptor'],
  'core/interceptors/token.interceptor.ts': ['interceptor', 'tokenInterceptor'],
  'core/layout/header.component.ts': ['component', 'HeaderComponent'],
  'core/layout/footer.component.ts': ['component', 'FooterComponent'],
  'shared/pipes/default-image.pipe.ts': ['pipe', 'DefaultImagePipe'],
  'shared/pipes/markdown.pipe.ts': ['pipe', 'MarkdownPipe'],
  'shared/components/list-errors.component.ts': ['component', 'ListErrorsComponent'],
  'features/article/services/articles.service.ts': ['service', 'ArticlesService'],
  'features/article/services/tags.service.ts': ['service', 'TagsService'],
  'features/article/pages/home/home.component.ts': ['component', 'HomeComponent'],
  'features/article/components/favorite-button.component.ts': [
    'component',
    'FavoriteButtonComponent',
  ],
  'features/profile/services/profile.service.ts': ['service', 'ProfileService'],
  'features/profile/profile.routes.ts': ['route-config', 'profile.routes'],
  'features/settings/settings.component.ts': ['component', 'SettingsComponent'],
  'app.routes.ts': ['route-config', 'app.routes'],
};

describe('RealWorld sample', () => {
  it.each(Object.entries(SPOT_CHECK))('labels %s', (path, [kind, name]) => {
    expect(byPath.get(path)).toMatchObject({ kind, name });
  });

  it('turns the lazy-loaded features into regions', () => {
    const lazy = result.graph.regions.filter((region) => region.kind === 'lazy-route');
    expect(lazy.map((region) => region.label).sort()).toEqual([
      'article',
      'auth',
      'profile',
      'settings',
    ]);
  });

  it('keeps eagerly loaded auth services out of the lazy auth region', () => {
    expect(byPath.get('core/auth/services/user.service.ts')?.regionId).toBe('folder:src/app/core');
    expect(byPath.get('core/auth/auth.component.ts')?.regionId).toBe(
      'lazy-route:src/app/core/auth',
    );
  });

  it('resolves every import of a project file', () => {
    expect(result.unresolved).toEqual([]);
  });
});
