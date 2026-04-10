import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verify the app loads and core pages are reachable.
 * These run without authentication to validate the deployment itself.
 */

test.describe('App smoke tests', () => {
  test('landing page loads and shows login form', async ({ page }) => {
    await page.goto('/');

    // The app should show the auth page or redirect to it
    // Look for sign-in related elements
    await expect(
      page.getByRole('button', { name: /sign in/i })
        .or(page.getByRole('button', { name: /log in/i }))
        .or(page.getByText(/sign in/i).first())
    ).toBeVisible({ timeout: 10_000 });
  });

  test('page title contains Wordz', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/wordz/i);
  });
});
