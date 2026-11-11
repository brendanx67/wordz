import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { ALL_TIME, buildPlayerStats, type PlayerStatsData, type StatsGameRow, type StatsWindow } from '@/lib/playerStats'

// Player statistics, grouped by *game type* (the composition of seats at the
// board). Within each type we keep one score series per distinct participant so
// the page can render a head-to-head box plot — e.g. "me" vs "Computer (P97)".
// Each group also retains the list of underlying games so the page can let the
// user drill into them (#23). The aggregation itself is in src/lib/playerStats.ts.

export type { ParticipantKind, SeatSpec } from '@/lib/gameType'
export type { GameSummary, GameTypeGroup, ParticipantSeries, PlayerStatsData, StatsWindow } from '@/lib/playerStats'

const PAGE_SIZE = 1000

/**
 * Every finished game, newest first. The API returns at most a page of rows per
 * request, so read page after page until the reported total is reached;
 * otherwise the statistics would silently stop at the first page.
 */
async function fetchFinishedGames(): Promise<StatsGameRow[]> {
  const rows: StatsGameRow[] = []
  for (;;) {
    const { data, error, count } = await supabase
      .from('games')
      .select('id, updated_at, winner, computer_players, game_players(player_id, score, profiles(display_name))', { count: 'exact' })
      .eq('status', 'finished')
      .order('updated_at', { ascending: false })
      .order('id')
      .range(rows.length, rows.length + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data?.length || rows.length >= (count ?? 0)) return rows
  }
}

/** Statistics for the games inside `window` (all time when omitted). */
export function usePlayerStats(window: StatsWindow = ALL_TIME): { data: PlayerStatsData | undefined; isLoading: boolean } {
  // One fetch serves every window: switching windows re-aggregates in memory.
  const { data: games, isLoading } = useQuery({
    queryKey: ['player-stats'],
    queryFn: fetchFinishedGames,
    staleTime: 30_000,
  })
  const data = useMemo(() => (games ? buildPlayerStats(games, window) : undefined), [games, window])
  return { data, isLoading }
}
