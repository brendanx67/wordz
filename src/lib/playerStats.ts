// Pure aggregation behind the player-statistics page: finished games in,
// per-game-type score distributions out. Kept free of React/Supabase so the
// windowing rules ("last 50 games", "last 30 days") are unit-testable; the
// fetching lives in src/hooks/usePlayerStats.ts.

import { computeBoxStats, type BoxStats } from '@/lib/boxStats'
import { classifyGame, seatToSpec, type ClassifiableGame, type GameSeat, type ParticipantKind, type SeatSpec } from '@/lib/gameType'

export interface ParticipantSeries {
  /** Stable identity within the group (player_id, strategy:strength, or name). */
  key: string
  label: string
  kind: ParticipantKind
  /** Games of this type the participant appeared in. */
  games: number
  /** Games of this type the participant won. */
  wins: number
  stats: BoxStats
}

/** One finished game within a group, for the drill-down list. */
export interface GameSummary {
  gameId: string
  finishedAt: string | null
  scores: { label: string; kind: ParticipantKind; score: number; isWinner: boolean }[]
}

export interface GameTypeGroup {
  key: string
  /** Human-readable composition, e.g. "Human + Computer (P97)" or "3 Humans". */
  label: string
  gameCount: number
  participants: ParticipantSeries[]
  /** The individual games behind this group, newest first. */
  games: GameSummary[]
  /** Seat specs for the type, enough to recreate it as a new game (#23). */
  composition: SeatSpec[]
  /** Mean of the combined (all-seat) score across this type's games. */
  meanTotalScore: number
  /** Highest combined (all-seat) score across this type's games. */
  maxTotalScore: number
}

export interface PlayerStatsData {
  groups: GameTypeGroup[]
  /** Games counted in `groups`, after the window is applied. */
  finishedGames: number
  /** Every finished game on record, whatever the window. */
  totalFinishedGames: number
}

/** The subset of a finished `games` row the statistics read. */
export interface StatsGameRow extends ClassifiableGame {
  id: string
  /** When the game finished (the last update of the row). */
  updated_at: string | null
}

/**
 * Which finished games the statistics cover. `games` keeps the most recent N
 * games *of each game type*, so a batch of simulated all-computer games never
 * pushes the human games out of the window. `days` keeps games finished within
 * the last N days. With neither set, every game counts.
 */
export interface StatsWindow {
  id: string
  label: string
  games?: number
  days?: number
}

export const STATS_WINDOWS: readonly StatsWindow[] = [
  { id: 'all', label: 'All time' },
  { id: 'g50', label: 'Last 50', games: 50 },
  { id: 'g100', label: 'Last 100', games: 100 },
  { id: 'd30', label: '30 days', days: 30 },
  { id: 'd60', label: '60 days', days: 60 },
  { id: 'd90', label: '90 days', days: 90 },
]

export const ALL_TIME: StatsWindow = STATS_WINDOWS[0]

const KIND_RANK: Record<ParticipantKind, number> = { human: 0, computer: 1, api: 2 }
const DAY_MS = 24 * 60 * 60 * 1000

interface ClassifiedGame {
  gameId: string
  finishedAt: string | null
  /** `finishedAt` as epoch milliseconds; 0 when the row has no timestamp. */
  finishedMs: number
  seats: GameSeat[]
}

/**
 * Group finished games by game type and summarize the scores of each
 * participant, limited to the games inside `window`. `now` is injectable for
 * tests.
 */
export function buildPlayerStats(
  games: StatsGameRow[],
  window: StatsWindow = ALL_TIME,
  now: number = Date.now(),
): PlayerStatsData {
  // Classify every game into its type. All games of a type share the same seat
  // composition by definition of the group key.
  const byType = new Map<string, { label: string; games: ClassifiedGame[] }>()
  for (const game of games) {
    const classified = classifyGame(game)
    if (!classified) continue // skip degenerate/abandoned rows
    let bucket = byType.get(classified.groupKey)
    if (!bucket) {
      bucket = { label: classified.groupLabel, games: [] }
      byType.set(classified.groupKey, bucket)
    }
    const finishedMs = game.updated_at ? Date.parse(game.updated_at) : NaN
    bucket.games.push({
      gameId: game.id,
      finishedAt: game.updated_at,
      finishedMs: Number.isNaN(finishedMs) ? 0 : finishedMs,
      seats: classified.seats,
    })
  }

  const cutoff = window.days != null ? now - window.days * DAY_MS : null
  const groups: GameTypeGroup[] = []
  let finishedGames = 0

  for (const [key, bucket] of byType) {
    // Newest first, both for the window and for the drill-down list.
    let inWindow = bucket.games.sort((a, b) => b.finishedMs - a.finishedMs)
    if (cutoff != null) inWindow = inWindow.filter(g => g.finishedMs >= cutoff)
    if (window.games != null) inWindow = inWindow.slice(0, window.games)
    if (inWindow.length === 0) continue
    finishedGames += inWindow.length

    const parts = new Map<string, { label: string; kind: ParticipantKind; scores: number[]; wins: number }>()
    for (const game of inWindow) {
      for (const s of game.seats) {
        let part = parts.get(s.partKey)
        if (!part) {
          part = { label: s.partLabel, kind: s.kind, scores: [], wins: 0 }
          parts.set(s.partKey, part)
        }
        part.scores.push(s.score)
        if (s.isWinner) part.wins++
      }
    }

    // Combined (all-seat) score per game → mean and max for this type.
    const totals = inWindow.map(g => g.seats.reduce((sum, s) => sum + s.score, 0))

    groups.push({
      key,
      label: bucket.label,
      gameCount: inWindow.length,
      participants: [...parts.entries()]
        .map(([pk, p]) => ({
          key: pk,
          label: p.label,
          kind: p.kind,
          games: p.scores.length,
          wins: p.wins,
          stats: computeBoxStats(p.scores),
        }))
        .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.games - a.games || b.stats.mean - a.stats.mean),
      games: inWindow.map(g => ({
        gameId: g.gameId,
        finishedAt: g.finishedAt,
        scores: g.seats.map(s => ({ label: s.partLabel, kind: s.kind, score: s.score, isWinner: s.isWinner })),
      })),
      composition: inWindow[0].seats.map(seatToSpec),
      meanTotalScore: totals.reduce((a, b) => a + b, 0) / totals.length,
      maxTotalScore: Math.max(...totals),
    })
  }

  // Most-played game types first — that is where the data is richest.
  groups.sort((a, b) => b.gameCount - a.gameCount || a.label.localeCompare(b.label))

  return { groups, finishedGames, totalFinishedGames: games.length }
}

const STORAGE_KEY = 'wordz-stats-window'

/** The window the user last chose on the stats page (all time by default). */
export function loadStatsWindow(): StatsWindow {
  try {
    const id = localStorage.getItem(STORAGE_KEY)
    return STATS_WINDOWS.find(w => w.id === id) ?? ALL_TIME
  } catch {
    return ALL_TIME
  }
}

export function saveStatsWindow(window: StatsWindow): void {
  try {
    localStorage.setItem(STORAGE_KEY, window.id)
  } catch {
    // Storage unavailable (private mode, quota) — non-fatal, just skip.
  }
}
