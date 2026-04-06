import { useCallback, useEffect, useRef, useState } from 'react'
import type { BoardCell, Tile } from '@/lib/gameConstants'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

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
  const [suggestionSent, setSuggestionSent] = useState(false)

  // Clear local suggestion tiles when a new move is played
  const prevMoveCountRef = useRef(moveCount)
  useEffect(() => {
    if (moveCount > prevMoveCountRef.current) {
      setSuggestionTiles(new Map())
      setSuggestionSquare(null)
      setSuggestionSent(false)
    }
    prevMoveCountRef.current = moveCount
  }, [moveCount])

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

    setSuggestionTiles(prev => {
      const next = new Map(prev)
      next.set(key, tile)
      return next
    })

    const dr = suggestionDirection === 'down' ? 1 : 0
    const dc = suggestionDirection === 'across' ? 1 : 0
    let nextRow = suggestionSquare.row + dr
    let nextCol = suggestionSquare.col + dc
    while (nextRow < 15 && nextCol < 15 && (board[nextRow]?.[nextCol]?.tile || suggestionTiles.has(`${nextRow},${nextCol}`))) {
      nextRow += dr
      nextCol += dc
    }
    if (nextRow < 15 && nextCol < 15) {
      setSuggestionSquare({ row: nextRow, col: nextCol })
    }
  }, [suggestionSquare, suggestionDirection, board, suggestionTiles])

  const saveSuggestion = useCallback(async () => {
    if (!gameId || suggestionTiles.size === 0) return
    const tiles = Array.from(suggestionTiles.entries()).map(([key, tile]) => {
      const [row, col] = key.split(',').map(Number)
      return {
        cell: `${String.fromCharCode(65 + col)}${row + 1}`,
        letter: tile.letter,
        is_blank: tile.isBlank,
      }
    })
    await supabase.from('games').update({
      suggested_move: {
        user_id: userId,
        tiles: tiles.map(t => {
          const match = t.cell.match(/^([A-O])(\d{1,2})$/)!
          return { ...t, row: parseInt(match[2]) - 1, col: match[1].charCodeAt(0) - 65 }
        }),
        timestamp: new Date().toISOString(),
      }
    }).eq('id', gameId)
    setSuggestionSent(true)
    toast.success('Suggestion sent to LLM')
  }, [gameId, suggestionTiles, userId])

  const clearSuggestion = useCallback(async () => {
    setSuggestionTiles(new Map())
    setSuggestionSquare(null)
    setSuggestionSent(false)
    if (gameId) {
      await supabase.from('games').update({ suggested_move: null }).eq('id', gameId)
    }
  }, [gameId])

  return {
    suggestionTiles,
    setSuggestionTiles,
    suggestionSquare,
    setSuggestionSquare,
    suggestionDirection,
    setSuggestionDirection,
    suggestionSent,
    handleSuggestionSquareClick,
    handleSuggestionTileClick,
    saveSuggestion,
    clearSuggestion,
  }
}
