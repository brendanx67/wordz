import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export function useGameHistory(userId: string | undefined) {
  return useQuery({
    queryKey: ['game_history', userId],
    enabled: !!userId,
    queryFn: async () => {
      // Get games where user is a player
      const { data: playerRows, error: pErr } = await supabase
        .from('game_players')
        .select('game_id')
        .eq('player_id', userId!)
      if (pErr) throw pErr

      // Also get games where user is the creator (spectator games)
      const { data: createdRows, error: cErr } = await supabase
        .from('games')
        .select('id')
        .eq('created_by', userId!)
        .eq('status', 'finished')
      if (cErr) throw cErr

      const gameIds = [...new Set([
        ...playerRows.map(r => r.game_id),
        ...(createdRows || []).map(r => r.id),
      ])]
      if (gameIds.length === 0) return []

      const { data, error } = await supabase
        .from('games')
        .select(`
          id, status, winner, created_at, updated_at, computer_players,
          game_players(player_id, score, profiles(display_name))
        `)
        .in('id', gameIds)
        .eq('status', 'finished')
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data
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
