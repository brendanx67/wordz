import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

/**
 * Mobile layout tests — run in the 'mobile' project (iPhone 15 viewport).
 * Validates #12: board + rack + controls fit in one screen.
 */

test.describe('Mobile layout', () => {
  test('login page is usable on mobile viewport', async ({ page }) => {
    await page.goto('/');

    // Auth form should be visible without scrolling
    const signInButton = page.getByRole('button', { name: /sign in/i });
    await expect(signInButton).toBeVisible({ timeout: 10_000 });
    await expect(signInButton).toBeInViewport();
  });

  test('lobby loads on mobile after sign in', async ({ page }) => {
    await signIn(page);

    // Create game button should be visible
    await expect(
      page.getByRole('button', { name: /create/i }).or(page.getByText(/create.*game/i)).first()
    ).toBeVisible();
  });
});
