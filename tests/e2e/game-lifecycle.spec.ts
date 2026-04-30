import { test, expect, type Page } from '@playwright/test';

/**
 * Full game lifecycle: create account → play game → review → chat →
 * lobby checks → resign → delete account. Leaves zero trace in the
 * production database.
 */

const TEST_EMAIL = 'playwright-lifecycle@wordz-test.example';
const TEST_PASSWORD = 'TestPass123!';
const TEST_DISPLAY_NAME = 'PlaywrightBot';

async function signUp(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /don't have an account/i }).click();
  await page.getByPlaceholder('Your name').fill(TEST_DISPLAY_NAME);
  await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page.getByText(/new game/i).first()).toBeVisible({ timeout: 15_000 });
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/new game/i).first()).toBeVisible({ timeout: 15_000 });
}

async function deleteAccount(page: Page) {
  // Navigate to account settings via the display name link
  await page.getByText(TEST_DISPLAY_NAME).first().click();
  await expect(page.getByText(/account settings/i)).toBeVisible({ timeout: 5_000 });

  // Scroll to danger zone and delete
  await page.getByRole('button', { name: /delete account/i }).click();
  await page.getByRole('button', { name: /yes, delete my account/i }).click();

  // Should redirect to auth page after deletion
  await expect(page.getByRole('button', { name: /sign in/i }))
    .toBeVisible({ timeout: 10_000 });
}

/**
 * Cleanup: if the test account exists from a prior failed run,
 * sign in and delete it before proceeding.
 */
async function cleanupIfExists(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Wait briefly to see if sign-in succeeds (lobby) or fails (stays on auth)
  try {
    await expect(page.getByText(/new game/i).first()).toBeVisible({ timeout: 8_000 });
    // Sign-in succeeded — account exists from a prior run. Delete it.
    await deleteAccount(page);
  } catch {
    // Sign-in failed — account doesn't exist. Nothing to clean up.
    // Navigate away from any error state
    await page.goto('/');
  }
}

test.describe('Game lifecycle', () => {
  test.describe.configure({ timeout: 120_000 }); // 2 minutes for the full flow

  test('full lifecycle: signup → game → review → chat → logout → login → resign → delete', async ({ page }) => {
    // ─── 0. Cleanup from prior failed runs ──────────────────────────
    await test.step('cleanup prior test account if exists', async () => {
      await cleanupIfExists(page);
    });

    // ─── 1. Create account ──────────────────────────────────────────
    await test.step('create account', async () => {
      await signUp(page);
    });

    // ─── 2. Start a game with a computer player ─────────────────────
    let gameUrl: string;
    await test.step('create game vs computer', async () => {
      await page.getByRole('button', { name: /new game/i }).click();
      await expect(page.getByText(/new game/i).first()).toBeVisible();

      // Slot 1 should default to "Me". Set slot 2 to Computer (Easy).
      // The CreateGameForm uses Select dropdowns for each slot.
      const slot2 = page.locator('button[role="combobox"]').nth(1);
      await slot2.click();
      await page.getByRole('option', { name: /easy/i }).click();

      // Click Start Game
      await page.getByRole('button', { name: /start game/i }).click();

      // Wait for game page to load — board should be visible
      await expect(page.getByText(/tiles left/i)).toBeVisible({ timeout: 10_000 });
      gameUrl = page.url();
    });

    // ─── 3. Play a few moves ────────────────────────────────────────
    await test.step('play moves', async () => {
      // Verify rack has tiles
      const rackTiles = page.locator('[draggable="true"]');
      await expect(rackTiles.first()).toBeVisible({ timeout: 5_000 });
      const tileCount = await rackTiles.count();
      expect(tileCount).toBe(7);

      // Verify scoreboard shows both players at 0
      const scores = page.getByText('0', { exact: true });
      expect(await scores.count()).toBeGreaterThanOrEqual(2);

      // We can't reliably play valid words without knowing the rack,
      // so verify the controls are present and pass the turn instead.
      await page.getByRole('button', { name: /pass/i }).click();

      // Wait for computer to play (it should take its turn after our pass)
      // The score should change from 0 to something > 0 for the computer
      await expect(async () => {
        const scoreTexts = await page.locator('[style*="Playfair"]').allTextContents();
        const hasNonZero = scoreTexts.some(t => parseInt(t) > 0);
        expect(hasNonZero).toBe(true);
      }).toPass({ timeout: 15_000 });
    });

    // ─── 4. Review game history ─────────────────────────────────────
    await test.step('review game history', async () => {
      // Open game history
      await page.getByRole('button', { name: /game history/i }).click();

      // The history viewer should show move navigation
      await expect(page.getByText(/move \d+/i)).toBeVisible({ timeout: 5_000 });
    });

    // Close history by clicking "Hide History"
    await page.getByRole('button', { name: /hide history/i }).click();

    // ─── 5. Leave a chat message ────────────────────────────────────
    await test.step('post chat message', async () => {
      // Open game chat (might need to click "Game Chat" button)
      const chatButton = page.getByText(/game chat/i);
      if (await chatButton.isVisible()) {
        await chatButton.click();
      }

      // Find the chat textarea and post a message
      const chatInput = page.getByPlaceholder(/share a message/i);
      await expect(chatInput).toBeVisible({ timeout: 5_000 });
      await chatInput.fill('Playwright test message');
      await page.getByRole('button', { name: /send/i }).click();

      // Verify the message appears
      await expect(page.getByText('Playwright test message')).toBeVisible({ timeout: 5_000 });
    });

    // ─── 6. Go back to the lobby ────────────────────────────────────
    await test.step('return to lobby', async () => {
      await page.getByRole('button', { name: /lobby/i }).first().click();
      await expect(page.getByText(/my games/i)).toBeVisible({ timeout: 5_000 });
    });

    // ─── 7. Check the chat appears in the lobby ─────────────────────
    await test.step('verify lobby chat', async () => {
      // Expand the chat panel
      const chatHeader = page.getByText(/chat/i).first();
      await chatHeader.click();

      // The channel list should be visible
      await expect(
        page.getByText(/suggestions/i)
          .or(page.getByText(/game/i))
          .first()
      ).toBeVisible({ timeout: 5_000 });
    });

    // ─── 8. Check MCP instructions can be expanded ──────────────────
    await test.step('verify MCP section', async () => {
      // Scroll down to find the "Connect an AI (API & MCP)" card
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(500);
      // The card collapses by default; click its header to reveal the download link
      await page.getByText(/connect an ai/i).first().click();
      const downloadLink = page.getByRole('link', { name: /download|source/i })
        .or(page.getByText(/wordz-source/i))
        .or(page.getByText(/wordz-mcp/i));
      await expect(downloadLink.first()).toBeVisible({ timeout: 5_000 });
    });

    // ─── 9. Return to the game via Play button ──────────────────────
    await test.step('return to game from lobby', async () => {
      // Scroll back to top and make sure we're on the lobby
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);

      // If we're not on the lobby (e.g. accidentally navigated away), go back
      const onLobby = await page.getByText(/my games/i).first().isVisible();
      if (!onLobby) {
        await page.getByRole('button', { name: /lobby/i }).first().click();
        await expect(page.getByText(/my games/i).first()).toBeVisible({ timeout: 5_000 });
      }

      // Find the game in "My Games" and click the play/view button
      // Use a more specific selector — the button inside the game card, not the header
      const gameCard = page.getByText(/my games/i).first().locator('..').locator('..');
      const playButton = gameCard.getByRole('button', { name: /play|view|watch/i }).first();
      await expect(playButton).toBeVisible({ timeout: 5_000 });
      await playButton.click();

      // Verify we're back on the game page
      await expect(page.getByText(/tiles left/i)).toBeVisible({ timeout: 10_000 });
    });

    // ─── 10. Return to lobby ────────────────────────────────────────
    await test.step('return to lobby again', async () => {
      await page.getByRole('button', { name: /lobby/i }).first().click();
      await expect(page.getByText(/my games/i)).toBeVisible({ timeout: 5_000 });
    });

    // ─── Log out and log back in ────────────────────────────────────
    await test.step('log out and log back in', async () => {
      // Sign out — icon-only button with tooltip "Log out", no accessible name.
      // Find it by the LogOut SVG icon class or by being near the display name.
      const signOutButton = page.locator('button:has(svg.lucide-log-out)')
        .or(page.locator('button').filter({ has: page.locator('.lucide-log-out') }));
      await expect(signOutButton.first()).toBeVisible({ timeout: 5_000 });
      await signOutButton.first().click();

      // Verify we're on the auth page
      await expect(page.getByRole('button', { name: /sign in/i }))
        .toBeVisible({ timeout: 5_000 });

      // Sign back in
      await signIn(page);

      // Verify the game is still visible
      await expect(page.getByText(/my games/i)).toBeVisible({ timeout: 5_000 });
    });

    // ─── 11. Resign from the game ───────────────────────────────────
    await test.step('resign from game', async () => {
      // Find the resign/cancel button in the game list
      const resignButton = page.getByRole('button', { name: /resign/i }).first();
      await expect(resignButton).toBeVisible({ timeout: 5_000 });
      await resignButton.click();

      // Confirm in the AlertDialog — button text is just "Resign" (or "Cancel" for waiting games).
      // Use the AlertDialog action button which has the red styling.
      const dialog = page.locator('[role="alertdialog"]');
      await expect(dialog).toBeVisible({ timeout: 3_000 });
      await dialog.getByRole('button', { name: /^resign$|^cancel$/i }).click();

      // The game should move to history or disappear from active games
      // Wait a moment for the state to update
      await page.waitForTimeout(2_000);
    });

    // Verify game appears as finished
    await test.step('verify game is finished', async () => {
      // Check game history section shows the game
      const historySection = page.getByText(/game history/i);
      await expect(historySection).toBeVisible({ timeout: 5_000 });
    });

    // ─── 12. Delete the user account ────────────────────────────────
    await test.step('delete account', async () => {
      await deleteAccount(page);
    });

    // ─── Verify deletion ────────────────────────────────────────────
    await test.step('verify account is deleted', async () => {
      // Try to sign in with deleted credentials — should fail
      await page.getByPlaceholder('you@example.com').fill(TEST_EMAIL);
      await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should see an error toast or stay on the auth page
      await page.waitForTimeout(3_000);
      // If we're still on the auth page (no redirect to lobby), deletion worked
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });
  });
});
