import { useMemo, useState } from 'react'
import type { BoardCell } from '@/lib/gameConstants'
import { createEmptyBoard } from '@/lib/gameConstants'

export interface MoveHistoryEntry {
  player_id: string
  player_name: string
  type: 'play' | 'pass' | 'exchange'
  words?: { word: string; score: number }[]
  score?: number
  board_snapshot: BoardCell[][]
  tiles?: { row: number; col: number; letter: string }[]
  timestamp: string
}

export function useReviewMode(moveHistory: MoveHistoryEntry[], liveBoard: BoardCell[][]) {
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewMoveIndex, setReviewMoveIndex] = useState(-1)

  const reviewBoard = useMemo(() => {
    if (!reviewMode || !moveHistory.length) return liveBoard
    if (reviewMoveIndex < 0) return createEmptyBoard()
    const entry = moveHistory[Math.min(reviewMoveIndex, moveHistory.length - 1)]
    return entry.board_snapshot || liveBoard
  }, [reviewMode, reviewMoveIndex, moveHistory, liveBoard])

  const reviewHighlightTiles = useMemo(() => {
    if (!reviewMode || reviewMoveIndex < 0 || !moveHistory.length) return undefined
    const entry = moveHistory[Math.min(reviewMoveIndex, moveHistory.length - 1)]
    if (entry.type !== 'play') return undefined

    if (entry.tiles && entry.tiles.length > 0) {
      return entry.tiles.map(t => ({ row: t.row, col: t.col }))
    }

    const currentSnapshot = entry.board_snapshot
    if (!currentSnapshot) return undefined
    const prevSnapshot = reviewMoveIndex > 0
      ? moveHistory[reviewMoveIndex - 1].board_snapshot
      : null

    const highlights: { row: number; col: number }[] = []
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const hasTileNow = currentSnapshot[r]?.[c]?.tile
        const hadTileBefore = prevSnapshot ? prevSnapshot[r]?.[c]?.tile : null
        if (hasTileNow && !hadTileBefore) {
          highlights.push({ row: r, col: c })
        }
      }
    }
    return highlights.length > 0 ? highlights : undefined
  }, [reviewMode, reviewMoveIndex, moveHistory])

  const reviewCurrentMove = reviewMode && reviewMoveIndex >= 0 && reviewMoveIndex < moveHistory.length
    ? moveHistory[reviewMoveIndex]
    : null

  const reviewTiming = useMemo(() => {
    if (!reviewMode || moveHistory.length < 2) return null
    const times = moveHistory.map(m => new Date(m.timestamp).getTime())
    const elapsed = times.map((t, i) => i === 0 ? 0 : (t - times[i - 1]) / 1000)
    return { elapsed }
  }, [reviewMode, moveHistory])

  const reviewScores = useMemo(() => {
    if (!reviewMode || !moveHistory.length) return null
    const scores: Record<string, number> = {}
    const idx = Math.min(reviewMoveIndex, moveHistory.length - 1)
    for (let i = 0; i <= idx; i++) {
      const m = moveHistory[i]
      if (m.score && m.score > 0) {
        scores[m.player_id] = (scores[m.player_id] ?? 0) + m.score
      }
    }
    return scores
  }, [reviewMode, reviewMoveIndex, moveHistory])

  const reviewTilesRemaining = useMemo(() => {
    if (!reviewMode) return null
    if (reviewMoveIndex < 0) return 100
    const entry = moveHistory[Math.min(reviewMoveIndex, moveHistory.length - 1)]
    if (!entry?.board_snapshot) return null
    let onBoard = 0
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (entry.board_snapshot[r]?.[c]?.tile) onBoard++
      }
    }
    return 100 - onBoard
  }, [reviewMode, reviewMoveIndex, moveHistory])

  return {
    reviewMode,
    setReviewMode,
    reviewMoveIndex,
    setReviewMoveIndex,
    reviewBoard,
    reviewHighlightTiles,
    reviewCurrentMove,
    reviewTiming,
    reviewScores,
    reviewTilesRemaining,
  }
}
