import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Wordz end-to-end tests.
 *
 * Run against the deployed Vercel preview by default. Override with:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
 *
 * Test credentials are loaded from .env.test (gitignored).
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://wordz-five.vercel.app',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 15'] },
    },
  ],
});
