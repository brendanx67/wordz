import { useQuery } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { BoardCell, Tile } from '@/lib/gameConstants'
import type { FindWordsResponse } from '@/hooks/useFindWords'

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api/analyze`
const DEBOUNCE_MS = 1200

/** Compute a stable signature from the board + rack so we know when to refetch. */
function boardRackSignature(board: BoardCell[][], rack: Tile[]): string {
  const boardParts: string[] = []
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const t = board[r][c].tile
      if (t) boardParts.push(`${r},${c}:${t.letter}${t.isBlank ? '*' : ''}`)
    }
  }
  const rackPart = rack.map(t => `${t.letter}${t.isBlank ? '*' : ''}`).sort().join(',')
  return `${boardParts.join('|')}||${rackPart}`
}

export function useAnalyzeBoard(board: BoardCell[][], rack: Tile[], enabled: boolean) {
  const signature = useMemo(() => boardRackSignature(board, rack), [board, rack])
  const [debouncedSig, setDebouncedSig] = useState(signature)

  // Debounce: only update the query key after the user pauses typing.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSig(signature), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [signature])

  // The query is keyed on the debounced signature so it only fires
  // after the user stops placing tiles for a moment.
  return useQuery<FindWordsResponse>({
    queryKey: ['analyze-board', debouncedSig],
    enabled: enabled && rack.length > 0,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Not authenticated')

      const res = await fetch(ANALYZE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          board,
          rack,
          sort_by: 'score',
          limit: 50,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
      return json as FindWordsResponse
    },
    staleTime: Infinity, // same board+rack = same results, no need to refetch
    refetchOnWindowFocus: false,
  })
}
