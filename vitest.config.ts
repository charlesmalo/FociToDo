import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '@foci/shared': fromRoot('./packages/shared/src/index.ts') },
  },
  test: {
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      exclude: [
        'apps/api/src/server.ts',
        'apps/web/src/main.tsx',
        'packages/diagrams/src/bin.ts',
        '**/*.d.ts',
      ],
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: process.env.COVERAGE_DIR ?? 'reports/coverage',
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'shared',
          environment: 'node',
          include: ['packages/shared/tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'diagrams',
          environment: 'node',
          include: ['packages/diagrams/tests/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'api-unit',
          environment: 'node',
          include: ['apps/api/tests/**/*.test.ts'],
          exclude: ['apps/api/tests/**/*.int.test.ts', 'apps/api/tests/**/*.concurrency.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'api-db',
          environment: 'node',
          include: ['apps/api/tests/**/*.int.test.ts', 'apps/api/tests/**/*.concurrency.test.ts'],
          globalSetup: ['apps/api/tests/support/globalSetup.ts'],
          // Files share one database: run them one after another; tests inside a file may still
          // issue concurrent requests on purpose.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['apps/web/tests/**/*.test.{ts,tsx}'],
          setupFiles: ['apps/web/tests/setup.ts'],
        },
      },
    ],
  },
});
