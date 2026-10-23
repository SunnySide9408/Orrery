import { expect, test, type Page } from '@playwright/test';

/**
 * Runs after the other tests (its own Playwright project): rendering the
 * 500-node map in software keeps every CPU core busy, which would slow the
 * tests running next to it.
 */

/** The `?fps` readout carries the renderer's numbers as data attributes. */
const readout = (page: Page) => page.locator('[data-frame-rate]');

/** Client-side navigation, so the app (and its WebGL context) stays the same between samples. */
async function goTo(page: Page, url: string, nodes: number): Promise<void> {
  await page.evaluate((target) => {
    history.pushState(null, '', target);
    dispatchEvent(new PopStateEvent('popstate'));
  }, url);
  await expect(readout(page)).toHaveAttribute('data-nodes', String(nodes), { timeout: 30_000 });
}

test('no memory growth after 10 sample swaps', async ({ page }) => {
  test.setTimeout(240_000);
  // Small, because the test browser renders the 500-node map in software.
  await page.setViewportSize({ width: 640, height: 400 });
  await page.goto('./realworld?fps=1');
  await expect(readout(page)).toHaveAttribute('data-nodes', '48', { timeout: 30_000 });

  const snapshot = async () => {
    // Let the readout catch up with the swap before reading it.
    await page.waitForTimeout(1200);
    return {
      geometries: await readout(page).getAttribute('data-geometries'),
      textures: await readout(page).getAttribute('data-textures'),
      elements: await page.evaluate(() => document.getElementsByTagName('*').length),
    };
  };

  await goTo(page, './perf?fps=1', 500);
  await goTo(page, './realworld?fps=1', 48);
  const first = await snapshot();
  for (let swap = 0; swap < 4; swap++) {
    await goTo(page, './perf?fps=1', 500);
    await goTo(page, './realworld?fps=1', 48);
  }
  expect(await snapshot()).toEqual(first);
});
