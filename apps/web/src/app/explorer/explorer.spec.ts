import { TestBed } from '@angular/core/testing';
import type { SystemRenderer, SystemRendererEvents } from '../renderer/system-renderer';
import { SYSTEM_RENDERER } from '../renderer/system-renderer';
import { Explorer } from './explorer';

const AUTH = 'src/app/core/auth.service.ts';

class FakeRenderer implements SystemRenderer {
  static instances: FakeRenderer[] = [];
  events?: SystemRendererEvents;
  initialized = 0;
  disposed = 0;
  focused: (string | null)[] = [];
  highlighted: ReadonlySet<string> = new Set();
  edges: ReadonlySet<string> = new Set();

  constructor() {
    FakeRenderer.instances.push(this);
  }
  initialize(_: HTMLElement, events: SystemRendererEvents) {
    this.initialized++;
    this.events = events;
  }
  setGraph() {
    /* not needed */
  }
  focusNode(id: string | null) {
    this.focused.push(id);
  }
  highlightNodes(ids: ReadonlySet<string>) {
    this.highlighted = ids;
  }
  showEdges(ids: ReadonlySet<string>) {
    this.edges = ids;
  }
  setReducedMotion() {
    /* not needed */
  }
  resize() {
    /* not needed */
  }
  dispose() {
    this.disposed++;
  }
}

async function mount() {
  const fixture = TestBed.createComponent(Explorer);
  await fixture.whenStable();
  return fixture;
}

describe('Explorer', () => {
  beforeEach(() => {
    FakeRenderer.instances = [];
    TestBed.configureTestingModule({
      imports: [Explorer],
      providers: [{ provide: SYSTEM_RENDERER, useValue: () => new FakeRenderer() }],
    });
  });

  it('creates one renderer per mount and disposes it on unmount', async () => {
    for (let i = 0; i < 3; i++) {
      const fixture = await mount();
      fixture.destroy();
    }
    expect(FakeRenderer.instances).toHaveLength(3);
    for (const renderer of FakeRenderer.instances) {
      expect(renderer.initialized).toBe(1);
      expect(renderer.disposed).toBe(1);
    }
  });

  it('shows the inspector when the scene reports a pick', async () => {
    const fixture = await mount();
    const renderer = FakeRenderer.instances[0];

    renderer.events!.nodePicked(AUTH);
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('AuthService');
    expect(text).toContain('Used directly by 12 files across 3 lazy routes');
    expect(renderer.focused.at(-1)).toBe(AUTH);
    expect(renderer.highlighted.has(AUTH)).toBe(true);
    expect(renderer.highlighted.has('src/app/features/account/login-page.ts')).toBe(true);
    expect(renderer.edges.size).toBeGreaterThan(0);
  });

  it('returns to the overview on Escape', async () => {
    const fixture = await mount();
    const renderer = FakeRenderer.instances[0];
    renderer.events!.nodePicked(AUTH);
    await fixture.whenStable();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[aria-label="Inspector"]')).toBeNull();
    expect(renderer.focused.at(-1)).toBeNull();
    expect(renderer.highlighted.size).toBe(0);
  });

  it('lets keyboard users jump to AuthService without the 3D scene', async () => {
    const fixture = await mount();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.trim() === 'AuthService',
    ) as HTMLButtonElement;

    button.click();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[aria-label="Inspector"]')).not.toBeNull();
  });
});
