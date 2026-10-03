import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: process.env.REPORT_DIR ?? 'playwright-report', open: 'never' }],
  ],
  outputDir: process.env.RESULTS_DIR ?? 'test-results',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:8080',
    // Expected strings must not depend on the runner's locale or timezone.
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
