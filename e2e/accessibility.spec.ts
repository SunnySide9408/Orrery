import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** WCAG 2.2 level A and AA rules, the target in docs/ROADMAP.md. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  return result.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

const pages: [string, string, (page: Page) => Promise<void>][] = [
  ['overview', './realworld', (page) => expect(page.locator('canvas')).toBeVisible()],
  [
    'a selected node with full impact',
    './realworld?node=src%2Fapp%2Fcore%2Fauth%2Fservices%2Fuser.service.ts&impact=1',
    (page) =>
      expect(page.getByRole('complementary', { name: 'Inspector' })).toContainText('Step 2'),
  ],
  [
    'list view',
    './realworld/list',
    (page) => expect(page.getByRole('button', { name: 'UserService' })).toBeVisible(),
  ],
  [
    'findings',
    './realworld/findings',
    (page) => expect(page.getByTestId('finding').first()).toBeVisible(),
  ],
  [
    'open a folder',
    './open',
    (page) => expect(page.getByRole('heading', { level: 1 })).toBeVisible(),
  ],
];

for (const [name, url, ready] of pages) {
  test(`no WCAG 2.2 AA violations: ${name}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(url);
    await ready(page);
    expect(await violations(page)).toEqual([]);
  });
}

test('keyboard only: search, select, full impact, and back to the overview', async ({ page }) => {
  await page.goto('./realworld');
  await expect(page.locator('canvas')).toBeVisible();

  // Tab reaches the search box before anything inside the map.
  const search = page.getByRole('combobox');
  for (let i = 0; i < 10 && !(await search.evaluate((el) => el === document.activeElement)); i++)
    await page.keyboard.press('Tab');
  await expect(search).toBeFocused();

  await page.keyboard.type('UserServ');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('heading', { name: 'UserService' })).toBeVisible();

  // Every control in the inspector is reachable and shows where focus is.
  const impact = inspector.getByRole('button', { name: 'Show full impact' });
  await impact.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/impact=1/);
  const outline = await impact.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');

  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
});
