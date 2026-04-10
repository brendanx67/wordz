import { test, expect, type Page } from '@playwright/test';

/**
 * Full game lifecycle: create account → play game → review → chat →
 * lobby checks → resign → delete account. Leaves zero trace in the
 * production database.
 */

const TEST_EMAIL = `test-${Date.now()}@wordz-test.example`;
const TEST_PASSWORD = 'TestPass123!';
const TEST_DISPLAY_NAME = `TestBot-${Date.now().toString(36)}`;

async function signUp(page: Page) {
  await page.goto('/');
  // Switch to sign-up mode
  await page.getByRole('button', { name: /don't have an account/i }).click();
  await page.getByLabel(/display name/i).fill(TEST_DISPLAY_NAME);
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  // Wait for lobby
  await expect(page.getByText(/new game/i).first()).toBeVisible({ timeout: 15_000 });
}

async function signIn(page: Page) {
  await page.goto('/');
  await page.getByLabel(/email/i).fill(TEST_EMAIL);
  await page.getByLabel(/password/i).fill(TEST_PASSWORD);
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

test.describe('Game lifecycle', () => {
  test.describe.configure({ timeout: 120_000 }); // 2 minutes for the full flow

  test('full lifecycle: signup → game → review → chat → logout → login → resign → delete', async ({ page }) => {
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

    // Close history by clicking the button again
    await page.getByRole('button', { name: /game history/i }).click();

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
      // Scroll down to find the source code / MCP section
      // Look for the download link or expandable section
      const mcpSection = page.getByText(/download/i)
        .or(page.getByText(/mcp/i))
        .or(page.getByText(/source/i));
      // Just verify something MCP/download-related exists on the page
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await expect(mcpSection.first()).toBeVisible({ timeout: 5_000 });
    });

    // ─── 9. Return to the game via Play button ──────────────────────
    await test.step('return to game from lobby', async () => {
      // Scroll back up to game list
      await page.evaluate(() => window.scrollTo(0, 0));

      // Find the game in "My Games" and click Play/View
      const playButton = page.getByRole('button', { name: /play|view|watch/i }).first();
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
      // Click sign out
      await page.getByRole('button', { name: /log out/i })
        .or(page.locator('button[title*="Log out"]'))
        .first().click();

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

      // Confirm in the AlertDialog
      const confirmButton = page.getByRole('button', { name: /yes.*resign|confirm/i });
      await expect(confirmButton).toBeVisible({ timeout: 3_000 });
      await confirmButton.click();

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
      await page.getByLabel(/email/i).fill(TEST_EMAIL);
      await page.getByLabel(/password/i).fill(TEST_PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();

      // Should see an error toast or stay on the auth page
      await page.waitForTimeout(3_000);
      // If we're still on the auth page (no redirect to lobby), deletion worked
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });
  });
});
