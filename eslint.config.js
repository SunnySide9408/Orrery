// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/** Imports the framework-free packages must never use. */
const frameworkImports = {
  patterns: [
    {
      group: ['@angular/*', 'three', 'three/*', 'rxjs', 'rxjs/*'],
      message:
        'Packages stay framework-free: no Angular, Three.js or RxJS. See docs/decisions/0001.',
    },
  ],
};

export default defineConfig([
  { ignores: ['dist/', 'out-tsc/', 'coverage/', '.angular/'] },
  {
    files: ['**/*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended, tseslint.configs.stylistic],
  },
  {
    files: ['apps/web/**/*.ts'],
    extends: [angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['apps/web/**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
  {
    files: ['packages/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', frameworkImports] },
  },
]);
