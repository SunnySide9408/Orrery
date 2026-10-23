import { expect, test, type Page } from '@playwright/test';

/** The `?fps` readout carries the renderer's numbers as data attributes. */
const readout = (page: Page) => page.locator('[data-frame-rate]');

/** Records every value the readout ever shows, so a short animation cannot slip past. */
async function recordAnimating(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { animatingSeen: string[] }).animatingSeen = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        const value = (record.target as Element).getAttribute?.('data-animating');
        if (value) seen.push(value);
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-animating'] });
  });
  return () =>
    page.evaluate(() => (window as unknown as { animatingSeen: string[] }).animatingSeen);
}

test('reduced motion: nothing moves on its own, from the first frame', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const seen = await recordAnimating(page);

  await page.goto('./realworld?fps=1');
  await expect(readout(page)).toHaveAttribute('data-animating', 'false', { timeout: 30_000 });
  // Selecting glides the camera and full impact reveals waves, unless motion is reduced.
  await page.getByRole('button', { name: 'UserService', exact: true }).click();
  await page.getByRole('button', { name: 'Show full impact' }).click();
  await expect(page).toHaveURL(/impact=1/);
  await page.waitForTimeout(1500);
  expect(await seen()).not.toContain('true');
  expect((await seen()).length).toBeGreaterThan(1);
});

test('without reduced motion, the map opens with a reveal', async ({ page }) => {
  const seen = await recordAnimating(page);
  await page.goto('./realworld?fps=1');
  await expect.poll(seen, { timeout: 30_000 }).toContain('true');
  await expect(readout(page)).toHaveAttribute('data-animating', 'false', { timeout: 30_000 });
});

test('the graphics switch turns glow off and is remembered', async ({ page }) => {
  await page.goto('./realworld');
  const toggle = page.getByRole('button', { name: /Lite graphics/ });
  // The test browser renders in software, so the map starts in lite by itself.
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('Turned on to keep the map smooth')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.reload();
  await expect(page.getByRole('button', { name: /Lite graphics/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
