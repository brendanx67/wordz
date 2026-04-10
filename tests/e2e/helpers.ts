import { type Page, expect } from '@playwright/test';

/**
 * Sign in to the Wordz app using email/password credentials.
 * Credentials are read from environment variables.
 */
export async function signIn(page: Page) {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_USER_EMAIL and TEST_USER_PASSWORD must be set. ' +
      'Copy .env.test.example to .env.test and fill in test credentials.'
    );
  }

  await page.goto('/');

  // Fill the login form
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait for the lobby to load (indicates successful auth)
  await expect(page.getByText(/lobby/i).or(page.getByText(/create.*game/i)).first())
    .toBeVisible({ timeout: 15_000 });
}

/**
 * Wait for the game page to be fully loaded after navigation.
 */
export async function waitForGamePage(page: Page) {
  // The board is a grid of cells — wait for the board container
  await expect(page.locator('[class*="grid"]').first())
    .toBeVisible({ timeout: 10_000 });
}
