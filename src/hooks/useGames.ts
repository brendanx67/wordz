import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { createTileBag, drawTiles, createEmptyBoard, RACK_SIZE } from '@/lib/gameConstants'
import type { Tile, BoardCell } from '@/lib/gameConstants'
import type { GameConfig } from '@/components/CreateGameForm'

export interface ComputerPlayer {
  id: string
  name: string
  difficulty: 'easy' | 'medium' | 'hard' | 'competitive'
  rack: Tile[]
  score: number
  owner_id?: string
  strategyLevel?: string
}

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
  has_computer: boolean
  computer_difficulty: 'easy' | 'medium' | 'hard' | null
  computer_rack: Tile[]
  computer_score: number
  computer_players: ComputerPlayer[]
  computer_delay: number
  move_history: unknown[]
  winner: string | null
  created_at: string
  updated_at: string
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
      // Get games where user is a player
      const { data: playerRows, error: pErr } = await supabase
        .from('game_players')
        .select('game_id')
        .eq('player_id', userId!)
      if (pErr) throw pErr

      // Also get games where user is the creator (for spectator games)
      const { data: createdRows, error: cErr } = await supabase
        .from('games')
        .select('id')
        .eq('created_by', userId!)
        .in('status', ['active', 'waiting'])
      if (cErr) throw cErr

      const gameIds = [...new Set([
        ...playerRows.map(r => r.game_id),
        ...(createdRows || []).map(r => r.id),
      ])]
      if (gameIds.length === 0) return []

      const { data, error } = await supabase
        .from('games')
        .select(`
          id, created_by, status, current_turn, created_at, has_computer, computer_players,
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

export function useCreateConfiguredGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, config, displayName }: { userId: string; config: GameConfig; displayName: string }) => {
      const activePlayers = config.players.filter(s => s.type !== 'none')
      const computerSlots = activePlayers.filter(s => s.type.startsWith('computer-'))
      const apiSlots = activePlayers.filter(s => s.type === 'api-player')
      const hasMe = activePlayers.some(s => s.type === 'me')
      const hasHuman = activePlayers.some(s => s.type === 'human')

      // Build the bag and draw tiles for all players
      let bag = createTileBag()

      // Create computer players
      const computerPlayers: ComputerPlayer[] = computerSlots.map((slot, i) => {
        const diff = slot.type.replace('computer-', '') as 'easy' | 'medium' | 'hard' | 'competitive'
        const { drawn, remaining } = drawTiles(bag, RACK_SIZE)
        bag = remaining
        return {
          id: `computer-${i + 1}`,
          name: `Computer ${i + 1} (${diff.charAt(0).toUpperCase() + diff.slice(1)})`,
          difficulty: diff,
          rack: drawn,
          score: 0,
        }
      })

      // Create API players (stored alongside computer players in the same
      // JSONB array). The per-seat find_words_enabled flag lives here — the
      // game-wide word_finder_enabled column on games was removed in #9.
      // The CreateGameForm toggle is still game-wide in v1; it fans out to
      // every API seat on create. A future change can make it per-seat.
      const apiPlayers: {
        id: string
        name: string
        rack: Tile[]
        score: number
        strategyLevel?: string
        owner_id: string
        find_words_enabled: boolean
      }[] = apiSlots.map((slot, i) => {
        const { drawn, remaining } = drawTiles(bag, RACK_SIZE)
        bag = remaining
        const name = slot.apiPlayerName || 'Claude'
        return {
          id: `api-${i + 1}`,
          name: `${name} (on behalf of ${displayName})`,
          rack: drawn,
          score: 0,
          strategyLevel: slot.strategyLevel || 'master',
          owner_id: userId,
          find_words_enabled: config.wordFinderEnabled ?? false,
        }
      })

      // Combine computer and API players
      const allNonHumanPlayers = [...computerPlayers, ...apiPlayers]

      // Build turn order based on slot positions
      const turnOrder: string[] = []
      let cpuIdx = 0
      let apiIdx = 0

      for (const slot of activePlayers) {
        if (slot.type === 'me') {
          turnOrder.push(userId)
        } else if (slot.type === 'human') {
          turnOrder.push('__human_pending__')
        } else if (slot.type.startsWith('computer-')) {
          turnOrder.push(computerPlayers[cpuIdx].id)
          cpuIdx++
        } else if (slot.type === 'api-player') {
          turnOrder.push(apiPlayers[apiIdx].id)
          apiIdx++
        }
      }

      // Draw tiles for "me" player
      let myTiles: Tile[] = []
      if (hasMe) {
        const { drawn, remaining } = drawTiles(bag, RACK_SIZE)
        bag = remaining
        myTiles = drawn
      }

      // Determine if game starts immediately (no human slots to fill)
      const needsMoreHumans = hasHuman
      const canStartImmediately = !needsMoreHumans

      // Randomize first player
      const firstIdx = Math.floor(Math.random() * turnOrder.length)

      const { data: game, error: gameErr } = await supabase
        .from('games')
        .insert({
          created_by: userId,
          status: canStartImmediately ? 'active' : 'waiting',
          board: createEmptyBoard(),
          tile_bag: bag,
          turn_order: canStartImmediately
            ? turnOrder
            : turnOrder.filter(id => id !== '__human_pending__'),
          turn_index: canStartImmediately ? firstIdx : 0,
          current_turn: canStartImmediately ? turnOrder[firstIdx] : null,
          has_computer: computerPlayers.length > 0 || apiPlayers.length > 0,
          computer_players: allNonHumanPlayers,
          computer_delay: config.computerDelay,
          // Legacy single-computer fields (for backward compat)
          computer_difficulty: computerPlayers[0]?.difficulty ?? null,
          computer_rack: computerPlayers[0]?.rack ?? [],
          computer_score: 0,
        })
        .select('id')
        .single()
      if (gameErr) throw gameErr

      // Insert "me" as a game_player
      if (hasMe) {
        const { error: playerErr } = await supabase
          .from('game_players')
          .insert({
            game_id: game.id,
            player_id: userId,
            rack: myTiles,
          })
        if (playerErr) throw playerErr
      }

      return { gameId: game.id }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

// Keep legacy mutations for backward compat
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
      const [gameRes, playersRes] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId!).single(),
        supabase.from('game_players_safe').select('player_id, score, rack, profiles:player_id(display_name)').eq('game_id', gameId!),
      ])
      if (gameRes.error) throw gameRes.error
      if (playersRes.error) throw playersRes.error

      return {
        ...gameRes.data,
        game_players: playersRes.data.map(p => ({
          ...p,
          profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles,
        })),
      } as unknown as GameRow
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

// Helper to check if a player ID is a computer
export function isComputerPlayerId(playerId: string): boolean {
  return playerId.startsWith('computer-')
}

// Helper to check if a player ID is an API player
export function isApiPlayerId(playerId: string): boolean {
  return playerId.startsWith('api-')
}

// ─── API Key Management ──────────────────────────────────────────────────────

export function useApiKeys(userId: string) {
  return useQuery({
    queryKey: ['api_keys', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, name, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, name }: { userId: string; name: string }) => {
      const { data, error } = await supabase
        .from('api_keys')
        .insert({ user_id: userId, name })
        .select('id, api_key, name, created_at')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api_keys'] })
    },
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api_keys'] })
    },
  })
}

export function useCancelGame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ gameId, userId }: { gameId: string; userId: string }) => {
      // Fetch game details
      const { data: game, error: gErr } = await supabase
        .from('games')
        .select('id, created_by, status, computer_players, game_players(player_id)')
        .eq('id', gameId)
        .single()
      if (gErr) throw gErr

      const players = game.game_players ?? []
      const otherPlayers = players.filter((p: { player_id: string }) => p.player_id !== userId)

      // Only attempt delete for waiting games with no other human players
      // (no game_moves rows exist yet, so FK won't block)
      if (game.status === 'waiting' && otherPlayers.length === 0) {
        const { error: gpErr } = await supabase.from('game_players').delete().eq('game_id', gameId)
        if (gpErr) throw gpErr
        const { error } = await supabase.from('games').delete().eq('id', gameId)
        if (error) throw error
        return { deleted: true }
      }

      // Everything else: mark as finished (resign)
      const computerPlayers = (game.computer_players ?? []) as ComputerPlayer[]
      const otherHuman = otherPlayers[0]?.player_id
      const firstComputer = computerPlayers[0]?.id
      const winner = otherHuman ?? firstComputer ?? null

      const { error } = await supabase
        .from('games')
        .update({
          status: 'finished',
          winner,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId)
      if (error) throw error
      return { deleted: false }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['games'] })
      queryClient.invalidateQueries({ queryKey: ['game_history'] })
      queryClient.invalidateQueries({ queryKey: ['game'] })
    },
  })
}
