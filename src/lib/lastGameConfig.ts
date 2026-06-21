// Remembers the most recent game configuration the user started so the
// create-game form can suggest it again as the default. Persisted in
// localStorage (client-only preference, no need to round-trip the server),
// following the same try/catch + JSON pattern as `wordz-ignored-games`.
import type { GameConfig } from '@/components/CreateGameForm'

const STORAGE_KEY = 'wordz-last-game-config'

/** Load the last-used game configuration, or null if none/invalid. */
export function loadLastGameConfig(): GameConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<GameConfig>
    // Shape guard: the form always has exactly 4 slots with "me" first.
    // Anything else is stale/corrupt — fall back to the built-in defaults.
    if (!parsed || !Array.isArray(parsed.players) || parsed.players.length !== 4) return null
    if (parsed.players[0]?.type !== 'me') return null
    return {
      players: parsed.players,
      computerDelay: typeof parsed.computerDelay === 'number' ? parsed.computerDelay : 0,
      wordFinderEnabled: !!parsed.wordFinderEnabled,
    }
  } catch {
    return null
  }
}

/** Persist a game configuration as the new default for next time. */
export function saveLastGameConfig(config: GameConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Storage unavailable (private mode, quota) — non-fatal, just skip.
  }
}
