import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build, served like a static
 * host, so the service worker and real sample loading are covered.
 * Run `npm run build` first; CI does.
 */
export default defineConfig({
  testDir: 'e2e',
  // The fixture project's own spec files are analysed by the tests, not run.
  testIgnore: 'fixtures/**',
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Headless CI machines have no GPU; SwiftShader renders WebGL in software.
          args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
          // Lets a machine with a preinstalled Chromium skip the download.
          executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] || undefined,
        },
      },
    },
  ],
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://localhost:4300',
    reuseExistingServer: !process.env['CI'],
  },
});
