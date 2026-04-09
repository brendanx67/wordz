import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Issue #10: instructional mode for human players. Calls the find-words Edge
// Function (the same handler the LLM/MCP path uses post-#9) over the user's
// Supabase session JWT. The handler resolves the caller's game_players row,
// checks the per-seat find_words_enabled flag, and returns the same shape it
// returns to API players. The query key is keyed on (gameId, moveCount) so
// every committed move on the game refetches automatically — that's how the
// "I had a place for my Q but the other player just blocked it" moment lands.
//
// We use raw fetch instead of supabase.functions.invoke for the same reason
// the chat hook does: the game-api function dispatches by URL path, and the
// supabase-js invoke wrapper doesn't compose subpaths cleanly.

const FIND_WORDS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api/find-words`

export interface FindWordsTile {
  cell: string
  letter: string
  value: number
  is_blank: boolean
}

export interface FindWordsMove {
  tiles: FindWordsTile[]
  words: { word: string; score: number }[]
  total_score: number
  tiles_used: number
  is_bingo: boolean
  rack_leave: string
}

export interface FindWordsResponse {
  total_moves_found: number
  filtered_count: number
  showing: number
  sort_by: string
  moves: FindWordsMove[]
}

interface UseFindWordsArgs {
  gameId: string | undefined
  moveCount: number
  // Length of the caller's rack — included in the query key so an exchange
  // (which doesn't bump moveCount but does swap the rack out) still triggers
  // a refetch when the new rack lands.
  rackSignature: string
  enabled: boolean
}

export function useFindWords({ gameId, moveCount, rackSignature, enabled }: UseFindWordsArgs) {
  return useQuery<FindWordsResponse>({
    queryKey: ['find_words', gameId, moveCount, rackSignature],
    enabled: enabled && !!gameId,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(FIND_WORDS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ game_id: gameId, sort_by: 'score', limit: 50 }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      return json as FindWordsResponse
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}
