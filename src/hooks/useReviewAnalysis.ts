import { useState, useMemo, useEffect, useCallback } from 'react'
import { useFindWordsAtMove } from '@/hooks/useFindWordsAtMove'
import { moveKey as instructionalMoveKey } from '@/components/InstructionalModePanel'
import { createEmptyBoard } from '@/lib/gameConstants'
import type { Tile } from '@/lib/gameConstants'
import type { FindWordsMove, FindWordsResponse } from '@/hooks/useFindWords'
import type { MoveHistoryEntry } from '@/hooks/useReviewMode'

// Extracted from GamePage.tsx (#16 refactor). All review-mode analysis
// state: the find-words-at-move query, panel data transformation,
// played-move key, board-before, staged alternative, and preview tiles.

interface UseReviewAnalysisArgs {
  gameId: string | undefined
  reviewMode: boolean
  reviewMoveIndex: number
  gameStatus: string | undefined
  moveHistory: MoveHistoryEntry[]
}

export function useReviewAnalysis({
  gameId,
  reviewMode,
  reviewMoveIndex,
  gameStatus,
  moveHistory,
}: UseReviewAnalysisArgs) {
  const reviewWordsQuery = useFindWordsAtMove({
    gameId,
    moveIndex: reviewMoveIndex,
    enabled: reviewMode && gameStatus === 'finished',
  })

  // Transform the review response into the shape InstructionalModePanel expects.
  const reviewPanelData = useMemo((): FindWordsResponse | undefined => {
    if (!reviewWordsQuery.data) return undefined
    return {
      total_moves_found: reviewWordsQuery.data.total_alternatives,
      filtered_count: reviewWordsQuery.data.showing,
      showing: reviewWordsQuery.data.showing,
      sort_by: 'score',
      moves: reviewWordsQuery.data.alternatives,
    }
  }, [reviewWordsQuery.data])

  // Key of the actually-played move so the panel can mark it.
  const reviewPlayedKey = useMemo(() => {
    const played = reviewWordsQuery.data?.played
    if (!played?.tiles?.length) return null
    return played.tiles.map(t => `${t.cell}:${t.letter}${t.is_blank ? '*' : ''}`).join('|')
  }, [reviewWordsQuery.data?.played])

  // Board state BEFORE the current review move (for alternative preview).
  const reviewBoardBefore = useMemo(() => {
    if (reviewMoveIndex <= 0) return createEmptyBoard()
    return moveHistory[reviewMoveIndex - 1]?.board_snapshot ?? createEmptyBoard()
  }, [reviewMoveIndex, moveHistory])

  // When user clicks an alternative in review panel, stage it for preview.
  const [reviewStagedKey, setReviewStagedKey] = useState<string | null>(null)
  const reviewStagedMove = useMemo(() => {
    if (!reviewStagedKey || !reviewPanelData) return null
    return reviewPanelData.moves.find(m => instructionalMoveKey(m) === reviewStagedKey) ?? null
  }, [reviewStagedKey, reviewPanelData])

  // Compute placed tiles for the review preview
  const reviewPreviewTiles = useMemo((): Map<string, Tile> => {
    if (!reviewStagedMove) return new Map()
    const map = new Map<string, Tile>()
    for (const t of reviewStagedMove.tiles) {
      const m = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/)
      if (!m) continue
      const col = m[1].charCodeAt(0) - 65
      const row = parseInt(m[2]) - 1
      map.set(`${row},${col}`, {
        letter: t.letter, value: t.value, isBlank: t.is_blank,
        id: `review-${t.cell}`,
      })
    }
    return map
  }, [reviewStagedMove])

  // Clear staged alternative when stepping to a different move.
  useEffect(() => { setReviewStagedKey(null) }, [reviewMoveIndex])

  const stageReviewMove = useCallback((move: FindWordsMove) => {
    const key = instructionalMoveKey(move)
    setReviewStagedKey(prev => prev === key ? null : key)
  }, [])

  return {
    reviewWordsQuery,
    reviewPanelData,
    reviewPlayedKey,
    reviewBoardBefore,
    reviewStagedKey,
    reviewStagedMove,
    reviewPreviewTiles,
    stageReviewMove,
  }
}
