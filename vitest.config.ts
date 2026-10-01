import { fileURLToPath } from 'node:url';
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
      exclude: ['apps/api/src/server.ts', 'apps/web/src/main.tsx', '**/*.d.ts'],
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
          name: 'api-unit',
          environment: 'node',
          include: ['apps/api/tests/**/*.test.ts'],
          exclude: ['apps/api/tests/**/*.int.test.ts', 'apps/api/tests/**/*.concurrency.test.ts'],
        },
      },
    ],
  },
});
