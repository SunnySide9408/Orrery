import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** The same JSON the app ships, so expectations follow the analysis instead of hard-coded numbers. */
const sample = JSON.parse(
  readFileSync(new URL('../apps/web/public/samples/realworld.json', import.meta.url), 'utf8'),
) as {
  graph: {
    nodes: { id: string; name: string; path: string; kind: string }[];
    edges: { sourceId: string; targetId: string }[];
  };
};
const userService = sample.graph.nodes.find((node) => node.name === 'UserService')!;
const dependants = new Set(
  sample.graph.edges
    .filter((edge) => edge.targetId === userService.id)
    .map((edge) => edge.sourceId),
).size;

test('open the sample, search, select, and the inspector shows the right facts', async ({
  page,
}) => {
  await page.goto('./');
  await expect(page).toHaveURL(/\/realworld$/);
  await expect(page.getByText(`${sample.graph.nodes.length} files ·`)).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();

  await page.keyboard.press('/');
  await page.keyboard.type('UserServ');
  await expect(page.getByRole('option', { name: /UserService/ })).toBeVisible();
  await page.keyboard.press('Enter');

  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('heading', { name: 'UserService' })).toBeVisible();
  await expect(inspector).toContainText('Service');
  await expect(inspector).toContainText(userService.path);
  await expect(inspector).toContainText(`Used directly by ${dependants} files`);
  await expect(page).toHaveURL(new RegExp(`node=${encodeURIComponent(userService.id)}`));

  // The list view says the same about the same node.
  await page.getByRole('link', { name: 'List' }).click();
  const row = page.getByRole('row', { name: /UserService/ });
  await expect(row.getByRole('button', { name: 'UserService' })).toHaveAttribute(
    'aria-current',
    'true',
  );
  await expect(row.locator('[data-column="used-by"]')).toHaveText(String(dependants));
  await expect(inspector).toContainText(`Dependants (${dependants})`);

  // Escape goes back to the overview.
  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
});

test('UserService: who uses it, the full impact, and the finding with its evidence', async ({
  page,
}) => {
  await page.goto('./realworld');
  // One click from the overview answers "who uses UserService?".
  await page.getByRole('button', { name: 'UserService', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector).toContainText(`Dependants (${dependants})`);
  await expect(inspector).toContainText('Provided');
  await expect(inspector).toContainText('root');
  await expect(inspector).toContainText('according to static relationships');

  await inspector.getByRole('button', { name: 'Show full impact' }).click();
  await expect(page).toHaveURL(/impact=1/);
  await expect(inspector.getByRole('button', { name: 'Show direct links only' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(inspector.getByRole('heading', { name: /^Step 2/ })).toBeVisible();

  await inspector.getByRole('link', { name: /High fan-in/ }).click();
  await expect(page).toHaveURL(/\/realworld\/findings/);
  const finding = page.getByTestId('finding').filter({ hasText: 'High fan-in' });
  await expect(finding).toContainText('95th percentile');
  await expect(finding).toContainText('Limits');
  await expect(finding).toContainText(/line \d+/);
});

test('works offline once loaded', async ({ page, context }) => {
  await page.goto('./realworld');
  await expect(page.getByText(`${sample.graph.nodes.length} files ·`)).toBeVisible();
  // Wait until the service worker controls the page and has cached every file it lists.
  await page.waitForFunction(
    async () => {
      if (!navigator.serviceWorker.controller) return false;
      const manifest = (await (await fetch('ngsw.json')).json()) as {
        assetGroups: { urls: string[] }[];
      };
      const urls = manifest.assetGroups.flatMap((group) => group.urls);
      const cached = await Promise.all(
        urls.map((url) => caches.match(new URL(url, location.origin).href)),
      );
      return cached.every(Boolean);
    },
    undefined,
    { polling: 250, timeout: 30_000 },
  );

  await context.setOffline(true);
  // Open the link again, as a visitor would. (A reload may bypass the worker.)
  await page.goto('./realworld');
  await expect(page.getByText(`${sample.graph.nodes.length} files ·`)).toBeVisible();
  await page.getByRole('link', { name: 'List' }).click();
  await expect(page.getByRole('button', { name: 'UserService' })).toBeVisible();
});
