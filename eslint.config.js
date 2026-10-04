import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import { importX } from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const api = (layer) => `./apps/api/src/${layer}`;

export default defineConfig(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'reports/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    plugins: { 'import-x': importX },
    languageOptions: {
      globals: { ...globals.node },
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          project: [
            'packages/*/tsconfig.json',
            'apps/*/tsconfig.json',
            'e2e/tsconfig.json',
            'screenshots/tsconfig.json',
          ],
          conditionNames: ['@foci/source', 'types', 'import', 'default'],
        }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // Express recognises error handlers by their 4-argument signature (`_next` stays unused).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Architecture: dependencies point inward (spec §4.4).
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: api('domain'),
              from: [api('service'), api('repository'), api('http')],
              message: 'domain must not depend on outer layers',
            },
            {
              target: api('service'),
              from: [api('repository/postgres'), api('repository/in-memory'), api('http')],
              message: 'service may depend on repository ports only',
            },
            {
              target: api('repository'),
              from: [api('service'), api('http')],
              message: 'repository adapters must not depend on service or http',
            },
            {
              target: api('http'),
              from: [api('repository/postgres'), api('repository/in-memory')],
              message: 'http must not depend on repository adapters',
            },
            {
              target: './apps/web/src',
              from: ['./apps/api'],
              message: 'web must not import the api package',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/api/src/domain/**', 'apps/api/src/service/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: ['pg', 'express'], patterns: ['pino', 'pino-http'] },
      ],
    },
  },
  {
    files: ['apps/api/src/http/**'],
    rules: {
      'no-restricted-imports': ['error', { paths: ['pg'] }],
    },
  },
  {
    ...reactHooks.configs.flat['recommended-latest'],
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
);
