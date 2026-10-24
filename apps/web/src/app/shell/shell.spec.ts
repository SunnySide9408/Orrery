import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Explorer } from '../explorer/explorer';
import { FindingsView } from '../findings/findings-view';
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
              { path: 'findings', component: FindingsView },
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
    const usedBy = row.querySelector('[data-column="used-by"]')!.textContent!.trim();
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

  it('shows the full impact in waves, with paths, and says it honestly', async () => {
    const harness = await open(`/shop?node=${encodeURIComponent(AUTH)}`);
    const renderer = FakeRenderer.instances[0]!;
    expect(renderer.waves).toBeNull();
    expect(text(harness)).toMatch(
      /potentially affected by a change, according to static relationships/,
    );

    const toggle = [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Show full impact',
    )!;
    toggle.click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toContain('impact=1');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(renderer.waves?.get(AUTH)).toBe(0);
    expect(renderer.waves?.get('src/app/features/account/login-page.ts')).toBe(1);
    expect(Math.max(...renderer.waves!.values())).toBeGreaterThan(1);
    expect(text(harness)).toContain('Step 2');
    expect(text(harness)).toMatch(/via /);
  });

  it('starts a new selection with direct links only', async () => {
    const harness = await open(`/shop?node=${encodeURIComponent(AUTH)}&impact=1`);
    FakeRenderer.instances[0]!.events!.nodePicked('src/app/features/account/login-page.ts');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).not.toContain('impact');
  });

  it('marks injected dependencies and shows where a service is provided', async () => {
    const harness = await open(`/shop?node=${encodeURIComponent(AUTH)}`);
    expect(inspector()?.textContent).toMatch(/Provided\s*root/);
    expect(text(harness)).toMatch(/LoginPage\s*injects/);
  });

  it('lists findings by rule: what was found, why, what to check, and the evidence folded away', async () => {
    const harness = await open('/shop/findings');
    const cards = document.querySelectorAll('[data-testid="finding"]');
    expect(cards).toHaveLength(sample.result.findings.length);
    const card = cards[0]!.textContent!.replace(/\s+/g, ' ');
    // 12 direct dependants in the inspector, minus 2 specs, which findings leave out.
    expect(card).toContain('AuthService is used directly by 10 files');
    expect(card).toContain('Observation');
    expect(card).toContain('Why it could matter');
    expect(card).toContain('What to check');
    expect(card).toMatch(/including 3 lazy-loaded routes/);
    expect(text(harness)).toContain('Widely used files (1)');
    // Rules that found nothing say so.
    expect(text(harness)).toMatch(/Checked, nothing found Dependency cycles: none/);

    const details = cards[0]!.querySelector('details')!;
    expect(details.open).toBe(false);
    const evidence = details.textContent!.replace(/\s+/g, ' ');
    expect(evidence).toContain('Threshold 10 files');
    expect(evidence).toContain('Limits');
    expect(evidence).toMatch(/import · line \d+/);

    const step = details.querySelector('li button') as HTMLButtonElement;
    step.click();
    await harness.fixture.whenStable();
    expect(inspector()).not.toBeNull();
    expect(text(harness)).toContain('Findings (1)');
  });

  it('goes from a finding to the map with its file selected', async () => {
    const harness = await open('/shop/findings');
    const link = [...document.querySelectorAll('a')].find(
      (a) => a.textContent?.trim() === 'Show in the map',
    )!;
    link.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe(`/shop?node=${encodeURIComponent(AUTH)}`);
    expect(FakeRenderer.instances.at(-1)!.focused.at(-1)).toBe(AUTH);
  });

  it('links the inspector to its finding, which opens with its evidence', async () => {
    const harness = await open(`/shop?node=${encodeURIComponent(AUTH)}`);
    const link = inspector()!.querySelector<HTMLAnchorElement>('a[href*="findings"]')!;
    expect(link.textContent).toContain('AuthService is used directly by 10 files');
    link.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toMatch(/^\/shop\/findings\?node=.*#high-fan-in/);
    const card = document.querySelector<HTMLElement>('[data-testid="finding"]')!;
    expect(card.querySelector('details')!.open).toBe(true);
  });

  it('shows an overview of the project while nothing is selected, and can hide it', async () => {
    localStorage.removeItem('orrery.overview');
    const harness = await open('/shop');
    const overview = () => document.querySelector('[aria-label="Overview"]');
    const said = overview()!.textContent!.replace(/\s+/g, ' ');
    expect(said).toContain('Demo: an open-source app');
    expect(said).toMatch(/lazy-loaded: /);
    expect(said).toContain('Worth a look (1)');
    expect(said).toContain('AuthService is used directly by 10 files');

    const mostUsed = [...overview()!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'AuthService',
    )!;
    mostUsed.click();
    await harness.fixture.whenStable();
    expect(inspector()).not.toBeNull();
    expect(overview()).toBeNull();

    await harness.navigateByUrl('/shop');
    const hide = [...overview()!.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Hide',
    )!;
    hide.click();
    await harness.fixture.whenStable();
    expect(overview()).toBeNull();
    expect(localStorage.getItem('orrery.overview')).toBe('hidden');
    localStorage.removeItem('orrery.overview');
  });
});
