import { defineConfig } from 'vitest/config';

// Unit tests for the framework-free packages. The Angular app runs its own
// tests through `ng test`, which uses Angular's Vitest integration.
export default defineConfig({
  test: {
    include: [
      'packages/*/src/**/*.spec.ts',
      'tools/*/src/**/*.spec.ts',
      'fixtures/*/src/**/*.spec.ts',
    ],
    passWithNoTests: true,
  },
});
