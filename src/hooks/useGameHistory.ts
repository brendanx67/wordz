import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/** How many finished games the lobby's history tile shows. */
const HISTORY_LIMIT = 50

export function useGameHistory(userId: string | undefined) {
  return useQuery({
    queryKey: ['game_history', userId],
    enabled: !!userId,
    queryFn: async () => {
      // The user's finished games are the ones they sat in plus the ones they
      // created (spectator games). Each is its own query, bounded to the newest
      // HISTORY_LIMIT rows, so the request stays the same size however many
      // games have been played. Listing game IDs in the URL instead stops
      // working after a few hundred games: the gateway rejects the request.
      const [seated, created] = await Promise.all([
        supabase
          .from('games')
          .select(`
            id, status, winner, created_at, updated_at, computer_players,
            game_players(player_id, score, profiles(display_name)),
            mine:game_players!inner(player_id)
          `)
          .eq('mine.player_id', userId!)
          .eq('status', 'finished')
          .order('updated_at', { ascending: false })
          .limit(HISTORY_LIMIT),
        supabase
          .from('games')
          .select(`
            id, status, winner, created_at, updated_at, computer_players,
            game_players(player_id, score, profiles(display_name))
          `)
          .eq('created_by', userId!)
          .eq('status', 'finished')
          .order('updated_at', { ascending: false })
          .limit(HISTORY_LIMIT),
      ])
      if (seated.error) throw seated.error
      if (created.error) throw created.error

      // The newest HISTORY_LIMIT of the union are always within the newest
      // HISTORY_LIMIT of each side, so merging the two pages loses nothing.
      const byId = new Map<string, (typeof created.data)[number]>()
      for (const game of [...seated.data, ...created.data]) byId.set(game.id, game)
      return [...byId.values()]
        .sort((a, b) => Date.parse(b.updated_at ?? '') - Date.parse(a.updated_at ?? ''))
        .slice(0, HISTORY_LIMIT)
    },
  })
}

export function useFullMoveHistory(gameId: string | undefined) {
  return useQuery({
    queryKey: ['full_move_history', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_moves')
        .select('*, profiles:player_id(display_name)')
        .eq('game_id', gameId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data
    },
  })
}
