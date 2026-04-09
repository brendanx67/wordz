import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FindWordsMove } from './useFindWords'

// #11 review-mode: fetch all legal plays at a historical move position.
// Same shape as useFindWords but driven by (game_id, move_index) instead
// of the live rack. The endpoint also returns the actually-played move
// so the panel can mark it.

const FIND_WORDS_AT_MOVE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api/find-words-at-move`

export interface PlayedMoveInfo {
  words: { word: string; score: number }[]
  total_score: number
  tiles: { cell: string; letter: string; value: number; is_blank: boolean }[]
}

export interface FindWordsAtMoveResponse {
  move_index: number
  player_name: string
  move_type: 'play' | 'pass' | 'exchange'
  played: PlayedMoveInfo | null
  total_alternatives: number
  showing: number
  alternatives: FindWordsMove[]
  rack_available: boolean
}

interface UseFindWordsAtMoveArgs {
  gameId: string | undefined
  moveIndex: number
  enabled: boolean
}

export function useFindWordsAtMove({ gameId, moveIndex, enabled }: UseFindWordsAtMoveArgs) {
  return useQuery<FindWordsAtMoveResponse>({
    queryKey: ['find_words_at_move', gameId, moveIndex],
    enabled: enabled && !!gameId && moveIndex >= 0,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(FIND_WORDS_AT_MOVE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ game_id: gameId, move_index: moveIndex }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      return json as FindWordsAtMoveResponse
    },
    staleTime: Infinity, // historical data never changes
    refetchOnWindowFocus: false,
  })
}
