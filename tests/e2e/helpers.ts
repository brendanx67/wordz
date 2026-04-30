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

  // Fill the login form. AuthPage's <Label> is a sibling of <Input>, not
  // associated via htmlFor, so getByLabel can't find the input — match
  // by placeholder instead (same approach as game-lifecycle.spec.ts).
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
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

/**
 * Delete the currently signed-in test account via Account Settings.
 * Navigates to Account Settings, opens the delete dialog, and confirms.
 * After this, the user is signed out and the auth page is shown.
 * Use in test teardown (afterAll/afterEach) to clean up disposable accounts.
 */
export async function deleteTestAccount(page: Page) {
  // Navigate to account settings — click the user name in the header
  const accountLink = page.getByRole('button', { name: /account|settings/i })
    .or(page.locator('text=Account Settings'))
    .first();

  // If we're not on the lobby, go there first
  const lobbyVisible = await page.getByText(/lobby/i).or(page.getByText(/create.*game/i)).first().isVisible().catch(() => false);
  if (!lobbyVisible) {
    await page.goto('/');
    await expect(page.getByText(/lobby/i).or(page.getByText(/sign in/i)).first())
      .toBeVisible({ timeout: 10_000 });
  }

  // Click the display name to navigate to account settings
  await accountLink.click();
  await expect(page.getByText(/danger zone/i)).toBeVisible({ timeout: 5_000 });

  // Click "Delete Account" to open the alert dialog
  await page.getByRole('button', { name: /delete account/i }).click();

  // Confirm deletion
  await page.getByRole('button', { name: /yes, delete my account/i }).click();

  // Wait for sign-out (auth page appears)
  await expect(page.getByLabel(/email/i)).toBeVisible({ timeout: 10_000 });
}
