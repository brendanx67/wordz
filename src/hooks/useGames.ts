import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createTileBag, drawTiles, createEmptyBoard, RACK_SIZE } from '@/lib/gameConstants'
import type { Tile, BoardCell } from '@/lib/gameConstants'

export interface GameRow {
  id: string
  created_by: string
  status: string
  board: BoardCell[][]
  tile_bag: Tile[]
  current_turn: string | null
  turn_order: string[]
  turn_index: number
  last_move: unknown
  consecutive_passes: number
  winner: string | null
  created_at: string
  game_players: {
    player_id: string
    score: number
    rack: Tile[]
    profiles: { display_name: string }
  }[]
}

export function useOpenGames() {
  return useQuery({
    queryKey: ['games', 'open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select(`
          id, created_by, status, created_at,
          game_players(player_id, profiles(display_name))
        `)
        .eq('status', 'waiting')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 5000,
  })
}

export function useMyGames(userId: string | undefined) {
  return useQuery({
    queryKey: ['games', 'mine', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data: playerRows, error: pErr } = await supabase
        .from('game_players')
        .select('game_id')
        .eq('player_id', userId!)
      if (pErr) throw pErr

      const gameIds = playerRows.map(r => r.game_id)
      if (gameIds.length === 0) return []

      const { data, error } = await supabase
        .from('games')
        .select(`
          id, created_by, status, current_turn, created_at,
          game_players(player_id, score, profiles(display_name))
        `)
        .in('id', gameIds)
        .in('status', ['active', 'waiting'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    refetchInterval: 5000,
  })
}

export function useCreateGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (userId: string) => {
      const bag = createTileBag()
      const { drawn, remaining } = drawTiles(bag, RACK_SIZE)

      const { data: game, error: gameErr } = await supabase
        .from('games')
        .insert({
          created_by: userId,
          board: createEmptyBoard(),
          tile_bag: remaining,
          turn_order: [userId],
        })
        .select('id')
        .single()
      if (gameErr) throw gameErr

      const { error: playerErr } = await supabase
        .from('game_players')
        .insert({
          game_id: game.id,
          player_id: userId,
          rack: drawn,
        })
      if (playerErr) throw playerErr

      return game.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export function useJoinGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ gameId, userId }: { gameId: string; userId: string }) => {
      // Get current game state to draw tiles
      const { data: game, error: gErr } = await supabase
        .from('games')
        .select('tile_bag, turn_order')
        .eq('id', gameId)
        .single()
      if (gErr) throw gErr

      const bag = game.tile_bag as Tile[]
      const { drawn, remaining } = drawTiles(bag, RACK_SIZE)
      const newTurnOrder = [...(game.turn_order as string[]), userId]

      const { error: playerErr } = await supabase
        .from('game_players')
        .insert({
          game_id: gameId,
          player_id: userId,
          rack: drawn,
        })
      if (playerErr) throw playerErr

      const { error: updateErr } = await supabase
        .from('games')
        .update({
          tile_bag: remaining,
          turn_order: newTurnOrder,
        })
        .eq('id', gameId)
      if (updateErr) throw updateErr

      return gameId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export function useStartGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (gameId: string) => {
      const { data: game, error: gErr } = await supabase
        .from('games')
        .select('turn_order')
        .eq('id', gameId)
        .single()
      if (gErr) throw gErr

      const turnOrder = game.turn_order as string[]
      // Random first player
      const firstIdx = Math.floor(Math.random() * turnOrder.length)

      const { error } = await supabase
        .from('games')
        .update({
          status: 'active',
          current_turn: turnOrder[firstIdx],
          turn_index: firstIdx,
        })
        .eq('id', gameId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export function useGame(gameId: string | undefined) {
  return useQuery({
    queryKey: ['game', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('games')
        .select(`
          *,
          game_players(player_id, score, rack, profiles(display_name))
        `)
        .eq('id', gameId!)
        .single()
      if (error) throw error
      return data as unknown as GameRow
    },
    refetchInterval: 3000,
  })
}

export function useGameMoves(gameId: string | undefined) {
  return useQuery({
    queryKey: ['game_moves', gameId],
    enabled: !!gameId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_moves')
        .select('*, profiles:player_id(display_name)')
        .eq('game_id', gameId!)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data
    },
    refetchInterval: 3000,
  })
}
