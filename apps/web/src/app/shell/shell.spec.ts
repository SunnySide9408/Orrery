import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Explorer } from '../explorer/explorer';
import { ListView } from '../list/list-view';
import { SYSTEM_RENDERER } from '../renderer/system-renderer';
import { FakeRenderer } from '../testing/fake-renderer';
import { shopSample } from '../testing/shop-sample';
import { Shell } from './shell';

const AUTH = 'src/app/core/auth.service.ts';
const sample = shopSample();

async function open(url: string) {
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await harness.fixture.whenStable();
  return harness;
}

const text = (harness: RouterTestingHarness) =>
  (harness.routeNativeElement?.closest('body')?.textContent ?? '').replace(/\s+/g, ' ');
const inspector = () => document.querySelector('[aria-label="Inspector"]');

describe('Shell', () => {
  beforeEach(() => {
    FakeRenderer.instances = [];
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: ':sample',
            component: Shell,
            resolve: { sample: () => sample },
            children: [
              { path: '', component: Explorer },
              { path: 'list', component: ListView },
            ],
          },
        ]),
        { provide: SYSTEM_RENDERER, useValue: () => new FakeRenderer() },
      ],
    });
  });

  it('creates one renderer per mount and disposes it on unmount', async () => {
    const harness = await open('/shop');
    for (let i = 0; i < 2; i++) {
      await harness.navigateByUrl('/shop/list');
      await harness.navigateByUrl('/shop');
    }
    await harness.navigateByUrl('/shop/list');
    expect(FakeRenderer.instances).toHaveLength(3);
    for (const renderer of FakeRenderer.instances) {
      expect(renderer.initialized).toBe(1);
      expect(renderer.disposed).toBe(1);
    }
  });

  it('shows the inspector and puts the selection in the URL when the scene reports a pick', async () => {
    const harness = await open('/shop');
    const renderer = FakeRenderer.instances[0]!;

    renderer.events!.nodePicked(AUTH);
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe(`/shop?node=${encodeURIComponent(AUTH)}`);
    expect(text(harness)).toContain('Used directly by 12 files across 3 lazy routes');
    expect(renderer.focused.at(-1)).toBe(AUTH);
    expect(renderer.highlighted.has('src/app/features/account/login-page.ts')).toBe(true);
    expect(renderer.edges.size).toBeGreaterThan(0);
  });

  it('opens a shared link with the node already selected, with breadcrumbs back', async () => {
    const harness = await open(`/shop?node=${encodeURIComponent(AUTH)}`);
    expect(inspector()).not.toBeNull();
    const crumbs = document
      .querySelector('[aria-label="Breadcrumbs"]')!
      .textContent!.replace(/\s+/g, ' ');
    expect(crumbs).toMatch(/Overview ?\/ app \/ core \/ AuthService/);

    (document.querySelector('[aria-label="Breadcrumbs"] button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    expect(inspector()).toBeNull();
  });

  it('returns to the overview on Escape', async () => {
    const harness = await open(`/shop?node=${encodeURIComponent(AUTH)}`);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await harness.fixture.whenStable();

    expect(inspector()).toBeNull();
    expect(FakeRenderer.instances[0]!.focused.at(-1)).toBeNull();
    expect(FakeRenderer.instances[0]!.highlighted.size).toBe(0);
  });

  it('selects a node from the search box with the keyboard', async () => {
    const harness = await open('/shop');
    const input = document.querySelector<HTMLInputElement>('#node-search')!;
    input.value = 'authserv';
    input.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    expect(input.getAttribute('aria-expanded')).toBe('true');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await harness.fixture.whenStable();
    expect(inspector()?.textContent).toContain('AuthService');
  });

  it('keeps the selection when switching to the list view, and the list agrees with the inspector', async () => {
    const harness = await open(`/shop/list?node=${encodeURIComponent(AUTH)}`);
    const row = [...document.querySelectorAll('tbody tr')].find((tr) =>
      tr.querySelector('th')?.textContent?.includes('AuthService'),
    )!;
    const usedBy = row.querySelectorAll('td')[3]!.textContent!.trim();
    expect(usedBy).toBe(String(sample.index.dependantsOf(AUTH).length));
    expect(row.querySelector('[aria-current="true"]')).not.toBeNull();
    expect(text(harness)).toContain(`Dependants (${usedBy})`);
  });

  it('lets keyboard users jump to the suggested node without the 3D scene', async () => {
    const harness = await open('/shop');
    const button = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'AuthService',
    )!;
    button.click();
    await harness.fixture.whenStable();
    expect(inspector()).not.toBeNull();
  });
});
