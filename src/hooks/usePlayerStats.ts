import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { computeBoxStats, type BoxStats } from '@/lib/boxStats'
import { classifyGame, seatToSpec, type ParticipantKind, type SeatSpec } from '@/lib/gameType'

// Player statistics, grouped by *game type* (the composition of seats at the
// board). Within each type we keep one score series per distinct participant so
// the page can render a head-to-head box plot — e.g. "me" vs "Computer (P97)".
// Each group also retains the list of underlying games so the page can let the
// user drill into them (#23).

export type { ParticipantKind } from '@/lib/gameType'

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

export type { SeatSpec } from '@/lib/gameType'

export interface PlayerStatsData {
  groups: GameTypeGroup[]
  finishedGames: number
}

const KIND_RANK: Record<ParticipantKind, number> = { human: 0, computer: 1, api: 2 }

export function usePlayerStats() {
  return useQuery({
    queryKey: ['player-stats'],
    queryFn: async (): Promise<PlayerStatsData> => {
      const { data, error } = await supabase
        .from('games')
        .select('id, updated_at, winner, computer_players, game_players(player_id, score, profiles(display_name))')
        .eq('status', 'finished')
      if (error) throw error
      const games = data ?? []

      // Accumulator per game-type group.
      interface GroupAcc {
        label: string
        gameCount: number
        parts: Map<string, { label: string; kind: ParticipantKind; scores: number[]; wins: number }>
        games: GameSummary[]
        composition: SeatSpec[]
      }
      const groups = new Map<string, GroupAcc>()

      for (const game of games) {
        const classified = classifyGame(game)
        if (!classified) continue // skip degenerate/abandoned rows
        const { groupKey, groupLabel, seats } = classified

        let acc = groups.get(groupKey)
        if (!acc) {
          // All games of a type share the same seat composition by definition
          // of the group key, so capture it from the first one we see.
          acc = { label: groupLabel, gameCount: 0, parts: new Map(), games: [], composition: seats.map(seatToSpec) }
          groups.set(groupKey, acc)
        }
        acc.gameCount++
        acc.games.push({
          gameId: game.id,
          finishedAt: game.updated_at,
          scores: seats.map(s => ({ label: s.partLabel, kind: s.kind, score: s.score, isWinner: s.isWinner })),
        })

        for (const s of seats) {
          let part = acc.parts.get(s.partKey)
          if (!part) {
            part = { label: s.partLabel, kind: s.kind, scores: [], wins: 0 }
            acc.parts.set(s.partKey, part)
          }
          part.scores.push(s.score)
          if (s.isWinner) part.wins++
        }
      }

      const result: GameTypeGroup[] = [...groups.entries()].map(([key, acc]) => {
        // Combined (all-seat) score per game → mean and max for this type.
        const totals = acc.games.map(g => g.scores.reduce((s, x) => s + x.score, 0))
        const meanTotalScore = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0
        const maxTotalScore = totals.length ? Math.max(...totals) : 0
        return {
          key,
          label: acc.label,
          gameCount: acc.gameCount,
          participants: [...acc.parts.entries()]
            .map(([pk, p]) => ({
              key: pk,
              label: p.label,
              kind: p.kind,
              games: p.scores.length,
              wins: p.wins,
              stats: computeBoxStats(p.scores),
            }))
            .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.games - a.games || b.stats.mean - a.stats.mean),
          // Newest games first for the drill-down list.
          games: acc.games.sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? '')),
          composition: acc.composition,
          meanTotalScore,
          maxTotalScore,
        }
      })

      // Most-played game types first — that's where the data is richest.
      result.sort((a, b) => b.gameCount - a.gameCount || a.label.localeCompare(b.label))

      return { groups: result, finishedGames: games.length }
    },
    staleTime: 30_000,
  })
}
