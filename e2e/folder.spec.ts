import { expect, test, type Page } from '@playwright/test';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('fixtures/tiny-app', import.meta.url));
const folders: string[] = [];

/** A fresh folder named `name` in a temporary directory, removed after the test. */
function tempFolder(name: string): string {
  const parent = mkdtempSync(join(tmpdir(), 'orrery-e2e-'));
  folders.push(parent);
  const folder = join(parent, name);
  mkdirSync(folder);
  return folder;
}

test.afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

async function pickFolder(page: Page, folder: string) {
  await page.goto('./open');
  await page.getByTestId('folder-input').setInputFiles(folder);
}

test('a picked folder becomes a graph, and nothing is sent anywhere', async ({ page }) => {
  const folder = tempFolder('tiny-app');
  cpSync(FIXTURE, folder, { recursive: true });
  // Folders the analysis must skip: dependencies and git data.
  mkdirSync(join(folder, 'node_modules', 'some-lib'), { recursive: true });
  writeFileSync(join(folder, 'node_modules', 'some-lib', 'index.ts'), 'export const x = 1;\n');
  mkdirSync(join(folder, '.git'));
  writeFileSync(join(folder, '.git', 'HEAD'), 'ref: refs/heads/main\n');

  await page.goto('./open');
  const requests: { method: string; url: string; body: string | null }[] = [];
  page.on('request', (request) =>
    requests.push({ method: request.method(), url: request.url(), body: request.postData() }),
  );
  await page.getByTestId('folder-input').setInputFiles(folder);

  await expect(page.getByRole('heading', { name: 'tiny-app is ready' })).toBeVisible();
  // 11 sources (spec included) plus tsconfig.json; html, css, angular.json and README counted only.
  await expect(page.getByText(/11 source files read/)).toBeVisible();
  await expect(page.getByText('1 unresolved import')).toBeVisible();
  await expect(page.getByText(/4 other files/)).toBeVisible();
  await page.getByText('2 skipped folders, not opened').click();
  const skipped = page.getByRole('group');
  await expect(skipped.getByText('node_modules', { exact: true })).toBeVisible();
  await expect(skipped.getByText('.git', { exact: true })).toBeVisible();

  // The only requests during analysis load the app's own worker script. No uploads.
  expect(requests.every((request) => request.method === 'GET' && request.body === null)).toBe(true);
  expect(requests.every((request) => new URL(request.url).origin === 'http://localhost:4300')).toBe(
    true,
  );

  await page.getByRole('link', { name: 'Open the 3D map' }).click();
  await expect(page).toHaveURL(/\/local$/);
  // The overview keeps a visitor's own project apart from the demo.
  await expect(page.getByRole('region', { name: 'Overview' })).toContainText(
    'Your folder, analysed in this browser. Nothing was uploaded.',
  );
  await expect(page.locator('canvas')).toBeVisible();

  await page.keyboard.press('/');
  await page.keyboard.type('AuthServ');
  await page.keyboard.press('Enter');
  const inspector = page.getByRole('complementary', { name: 'Inspector' });
  await expect(inspector.getByRole('heading', { name: 'AuthService' })).toBeVisible();
  // Guard, spec, header, orders page, admin page: the alias `@core/*` resolved.
  await expect(inspector).toContainText('Used directly by 5 files');
  await expect(inspector).toContainText('across 2 lazy routes');

  await page.getByRole('link', { name: 'List' }).click();
  await expect(page.getByText('../../missing/thing')).toBeVisible();
  // Lazy features became regions.
  await expect(page.getByRole('heading', { name: /orders/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /admin/ })).toBeVisible();
});

test('a folder with too many source files is refused with the count', async ({ page }) => {
  const folder = tempFolder('big-app');
  for (let i = 0; i <= 5_000; i++) writeFileSync(join(folder, `f${i}.ts`), '');
  await pickFolder(page, folder);
  await expect(page.getByRole('alert')).toContainText(
    'big-app has 5,001 source files; the limit is 5,000.',
  );
  await expect(page.getByRole('alert')).toContainText('Nothing was analysed.');
});

test('a file over 1 MB is skipped and listed', async ({ page }) => {
  const folder = tempFolder('generated');
  writeFileSync(join(folder, 'small.ts'), 'export const a = 1;\n');
  writeFileSync(join(folder, 'huge.ts'), `export const data = "${'x'.repeat(1_100_000)}";\n`);
  await pickFolder(page, folder);
  await expect(page.getByRole('heading', { name: 'generated is ready' })).toBeVisible();
  await expect(page.getByText(/1 source file read/)).toBeVisible();
  await expect(page.getByText('1 file over 1 MB skipped:')).toBeVisible();
  await expect(page.getByText('huge.ts')).toBeVisible();
});

test('reloading the local view goes back to the picker', async ({ page }) => {
  await page.goto('./local');
  await expect(page).toHaveURL(/\/open$/);
  await expect(
    page.getByRole('heading', { name: 'Analyse a folder on this computer' }),
  ).toBeVisible();
});
