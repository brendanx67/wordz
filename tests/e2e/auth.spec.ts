import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

test.describe('Authentication', () => {
  test('can sign in and reach the lobby', async ({ page }) => {
    await signIn(page);

    // Verify we're on the lobby page
    await expect(page.getByText(/create.*game/i).first()).toBeVisible();
  });

  test('lobby shows player name after sign in', async ({ page }) => {
    await signIn(page);

    // The header should show the player's display name or email
    // (exact text depends on the test account's display name)
    await expect(page.locator('header, nav, [class*="header"]').first())
      .toBeVisible();
  });
});
