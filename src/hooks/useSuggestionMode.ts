import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardCell, Tile } from '@/lib/gameConstants'
import { supabase } from '@/lib/supabase'

export function useSuggestionMode(
  gameId: string,
  userId: string,
  board: BoardCell[][],
  isSpectatingApi: boolean,
  moveCount: number,
) {
  const [suggestionTiles, setSuggestionTiles] = useState<Map<string, Tile>>(new Map())
  const [suggestionSquare, setSuggestionSquare] = useState<{ row: number; col: number } | null>(null)
  const [suggestionDirection, setSuggestionDirection] = useState<'across' | 'down'>('across')
  const [suggestionBlankTarget, setSuggestionBlankTarget] = useState<{ row: number; col: number; tile: Tile } | null>(null)

  // Clear local suggestion tiles when a new move is played
  const prevMoveCountRef = useRef(moveCount)
  useEffect(() => {
    if (moveCount > prevMoveCountRef.current) {
      setSuggestionTiles(new Map())
      setSuggestionSquare(null)
      setSuggestionBlankTarget(null)
    }
    prevMoveCountRef.current = moveCount
  }, [moveCount])

  // Auto-save suggestion to DB whenever it changes (debounced)
  const lastSavedRef = useRef<string>('')
  useEffect(() => {
    if (!isSpectatingApi || !gameId) return
    const payload = Array.from(suggestionTiles.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, tile]) => {
        const [row, col] = key.split(',').map(Number)
        return {
          cell: `${String.fromCharCode(65 + col)}${row + 1}`,
          row,
          col,
          letter: tile.letter,
          is_blank: tile.isBlank,
        }
      })
    const serialized = JSON.stringify(payload)
    if (serialized === lastSavedRef.current) return

    const timer = setTimeout(() => {
      lastSavedRef.current = serialized
      if (payload.length === 0) {
        supabase.from('games').update({ suggested_move: null }).eq('id', gameId)
      } else {
        supabase.from('games').update({
          suggested_move: {
            user_id: userId,
            tiles: payload,
            timestamp: new Date().toISOString(),
          },
        }).eq('id', gameId)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [suggestionTiles, gameId, userId, isSpectatingApi])

  // Advance suggestion cursor past occupied squares after a tile is placed
  const advanceCursor = useCallback((fromRow: number, fromCol: number, pendingKey: string) => {
    const dr = suggestionDirection === 'down' ? 1 : 0
    const dc = suggestionDirection === 'across' ? 1 : 0
    let nextRow = fromRow + dr
    let nextCol = fromCol + dc
    while (
      nextRow < 15 && nextCol < 15 &&
      (board[nextRow]?.[nextCol]?.tile || suggestionTiles.has(`${nextRow},${nextCol}`) || `${nextRow},${nextCol}` === pendingKey)
    ) {
      nextRow += dr
      nextCol += dc
    }
    if (nextRow < 15 && nextCol < 15) {
      setSuggestionSquare({ row: nextRow, col: nextCol })
    }
  }, [suggestionDirection, board, suggestionTiles])

  const handleSuggestionSquareClick = useCallback((row: number, col: number) => {
    if (!isSpectatingApi) return
    const key = `${row},${col}`

    if (suggestionTiles.has(key)) {
      setSuggestionTiles(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      return
    }

    if (board[row]?.[col]?.tile) return

    if (suggestionSquare?.row === row && suggestionSquare?.col === col) {
      setSuggestionDirection(d => d === 'across' ? 'down' : 'across')
    } else {
      setSuggestionSquare({ row, col })
    }
  }, [isSpectatingApi, suggestionTiles, board, suggestionSquare])

  const handleSuggestionTileClick = useCallback((tile: Tile) => {
    if (!suggestionSquare) return
    const key = `${suggestionSquare.row},${suggestionSquare.col}`
    if (board[suggestionSquare.row]?.[suggestionSquare.col]?.tile) return
    if (suggestionTiles.has(key)) return

    // Blank tile → prompt for letter assignment
    if (tile.isBlank) {
      setSuggestionBlankTarget({ row: suggestionSquare.row, col: suggestionSquare.col, tile })
      return
    }

    setSuggestionTiles(prev => {
      const next = new Map(prev)
      next.set(key, tile)
      return next
    })
    advanceCursor(suggestionSquare.row, suggestionSquare.col, key)
  }, [suggestionSquare, board, suggestionTiles, advanceCursor])

  const handleSuggestionBlankChoice = useCallback((letter: string) => {
    if (!suggestionBlankTarget) return
    const { row, col, tile } = suggestionBlankTarget
    const key = `${row},${col}`
    const blankAsLetter: Tile = { ...tile, letter: letter.toUpperCase(), value: 0 }
    setSuggestionTiles(prev => {
      const next = new Map(prev)
      next.set(key, blankAsLetter)
      return next
    })
    setSuggestionBlankTarget(null)
    advanceCursor(row, col, key)
  }, [suggestionBlankTarget, advanceCursor])

  const clearSuggestion = useCallback(() => {
    setSuggestionTiles(new Map())
    setSuggestionSquare(null)
    setSuggestionBlankTarget(null)
    // Auto-save effect will push null to DB
  }, [])

  return {
    suggestionTiles,
    setSuggestionTiles,
    suggestionSquare,
    setSuggestionSquare,
    suggestionDirection,
    setSuggestionDirection,
    suggestionBlankTarget,
    setSuggestionBlankTarget,
    handleSuggestionSquareClick,
    handleSuggestionTileClick,
    handleSuggestionBlankChoice,
    clearSuggestion,
  }
}
