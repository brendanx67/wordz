import { useState, useCallback, useEffect } from 'react'
import type { Tile, BoardCell } from '@/lib/gameConstants'
import type { FindWordsMove } from '@/hooks/useFindWords'
import { moveKey as instructionalMoveKey } from '@/components/InstructionalModePanel'
import { toast } from 'sonner'

// Extracted from GamePage.tsx (#16 refactor). All board-level
// interaction callbacks: square clicks, tile placement/pickup,
// drag-drop, keyboard typing, rack clicks, and find-words staging.

interface UseBoardInteractionsArgs {
  board: BoardCell[][]
  isMyTurn: boolean
  isActive: boolean
  isSpectatingApi: boolean
  moveCount: number
  fullRack: Tile[]
  rackTiles: Tile[]
  placedTiles: Map<string, Tile>
  setPlacedTiles: React.Dispatch<React.SetStateAction<Map<string, Tile>>>
  selectedSquare: { row: number; col: number } | null
  setSelectedSquare: React.Dispatch<React.SetStateAction<{ row: number; col: number } | null>>
  direction: 'across' | 'down'
  setDirection: React.Dispatch<React.SetStateAction<'across' | 'down'>>
  stagedFindWordsKey: string | null
  setStagedFindWordsKey: React.Dispatch<React.SetStateAction<string | null>>
  hidePlayHint: boolean
  dismissPlayHint: () => void
  isExchangeMode: boolean
  setExchangeSelection: React.Dispatch<React.SetStateAction<Set<string>>>
  rackOrder: string[] | null
  setRackOrder: React.Dispatch<React.SetStateAction<string[] | null>>
  // Suggestion mode state & callbacks
  suggestionSquare: { row: number; col: number } | null
  setSuggestionSquare: (v: { row: number; col: number } | null) => void
  suggestionDirection: 'across' | 'down'
  setSuggestionDirection: (v: 'across' | 'down') => void
  suggestionTiles: Map<string, Tile>
  setSuggestionTiles: React.Dispatch<React.SetStateAction<Map<string, Tile>>>
  suggestionBlankTarget: { row: number; col: number; tile: Tile } | null
  setSuggestionBlankTarget: (v: { row: number; col: number; tile: Tile } | null) => void
  handleSuggestionTileClick: (tile: Tile) => void
  handleSuggestionBlankChoice: (letter: string) => void
  suggestionRack: Tile[]
  handleSubmitMove: () => void
}

export function useBoardInteractions({
  board, isMyTurn, isActive, isSpectatingApi, moveCount, fullRack, rackTiles,
  placedTiles, setPlacedTiles, selectedSquare, setSelectedSquare,
  direction, setDirection, stagedFindWordsKey, setStagedFindWordsKey,
  hidePlayHint, dismissPlayHint, isExchangeMode, setExchangeSelection,
  rackOrder: _rackOrder, setRackOrder,
  suggestionSquare, setSuggestionSquare, suggestionDirection,
  setSuggestionDirection, suggestionTiles, setSuggestionTiles,
  suggestionBlankTarget, setSuggestionBlankTarget,
  handleSuggestionTileClick,
  handleSuggestionBlankChoice, suggestionRack, handleSubmitMove,
}: UseBoardInteractionsArgs) {
  const [blankTileTarget, setBlankTileTarget] = useState<{ row: number; col: number; tile: Tile } | null>(null)

  const handleSquareClick = useCallback((row: number, col: number) => {
    if (board[row]?.[col]?.tile) return
    if (selectedSquare?.row === row && selectedSquare?.col === col) {
      setDirection(d => d === 'across' ? 'down' : 'across')
      return
    }
    setSelectedSquare({ row, col })
  }, [selectedSquare, board, setDirection, setSelectedSquare])

  const placeTileOnBoard = useCallback((row: number, col: number, tile: Tile) => {
    if (board[row]?.[col]?.tile) return
    if (placedTiles.has(`${row},${col}`)) return
    if (tile.isBlank) {
      setBlankTileTarget({ row, col, tile })
      return
    }
    setPlacedTiles(prev => {
      const next = new Map(prev)
      next.set(`${row},${col}`, tile)
      return next
    })
    setStagedFindWordsKey(null)
    if (!hidePlayHint) dismissPlayHint()
  }, [board, placedTiles, hidePlayHint, dismissPlayHint, setPlacedTiles, setStagedFindWordsKey])

  const stageMoveFromFindWords = useCallback((move: FindWordsMove) => {
    if (!isMyTurn || !isActive) return
    const key = instructionalMoveKey(move)

    if (stagedFindWordsKey === key) {
      setPlacedTiles(new Map())
      setSelectedSquare(null)
      setStagedFindWordsKey(null)
      return
    }

    const rackPool = [...fullRack]
    const next = new Map<string, Tile>()
    for (const t of move.tiles) {
      const cellMatch = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/)
      if (!cellMatch) {
        toast.error(`Couldn't stage move (bad cell ${t.cell})`)
        return
      }
      const col = cellMatch[1].charCodeAt(0) - 65
      const row = parseInt(cellMatch[2]) - 1
      if (board[row]?.[col]?.tile) {
        toast.error("That play conflicts with the current board — refreshing")
        return
      }

      let pickIdx: number
      if (t.is_blank) {
        pickIdx = rackPool.findIndex(r => r.isBlank)
      } else {
        pickIdx = rackPool.findIndex(r => !r.isBlank && r.letter === t.letter)
        if (pickIdx === -1) pickIdx = rackPool.findIndex(r => r.isBlank)
      }
      if (pickIdx === -1) {
        toast.error(`Couldn't stage move — rack changed`)
        return
      }
      const rackTile = rackPool.splice(pickIdx, 1)[0]
      const placed: Tile = t.is_blank
        ? { ...rackTile, letter: t.letter.toUpperCase(), value: 0 }
        : rackTile
      next.set(`${row},${col}`, placed)
    }

    setPlacedTiles(next)
    setSelectedSquare(null)
    setStagedFindWordsKey(key)
  }, [isMyTurn, isActive, fullRack, board, stagedFindWordsKey, setPlacedTiles, setSelectedSquare, setStagedFindWordsKey])

  const handleBlankLetterChoice = useCallback((letter: string) => {
    if (!blankTileTarget) return
    const { row, col, tile } = blankTileTarget
    const blankAsLetter: Tile = { ...tile, letter: letter.toUpperCase(), value: 0 }
    setPlacedTiles(prev => {
      const next = new Map(prev)
      next.set(`${row},${col}`, blankAsLetter)
      return next
    })
    setBlankTileTarget(null)
  }, [blankTileTarget, setPlacedTiles])

  const handleDrop = useCallback((row: number, col: number, tile: Tile, source?: { row: number; col: number }) => {
    if (board[row]?.[col]?.tile) return
    if (source && source.row === row && source.col === col) return

    if (isSpectatingApi) {
      if (tile.isBlank && !source && !tile.letter) {
        setSuggestionBlankTarget({ row, col, tile })
        return
      }
      setSuggestionTiles(prev => {
        const next = new Map(prev)
        if (source) next.delete(`${source.row},${source.col}`)
        next.set(`${row},${col}`, tile)
        return next
      })
      return
    }

    if (!isMyTurn || !isActive) return

    if (tile.isBlank && !source && !tile.letter) {
      setBlankTileTarget({ row, col, tile })
      return
    }

    setPlacedTiles(prev => {
      const next = new Map(prev)
      if (source) next.delete(`${source.row},${source.col}`)
      next.set(`${row},${col}`, tile)
      return next
    })
    setStagedFindWordsKey(null)
  }, [isMyTurn, isActive, isSpectatingApi, board, setSuggestionTiles, setSuggestionBlankTarget, setPlacedTiles, setStagedFindWordsKey])

  // Keyboard support: type letters to place tiles
  useEffect(() => {
    const canType = (isMyTurn && isActive) || isSpectatingApi
    if (!canType) return

    const activeSquare = isSpectatingApi ? suggestionSquare : selectedSquare
    const activeDirection = isSpectatingApi ? suggestionDirection : direction
    const activeTiles = isSpectatingApi ? suggestionTiles : placedTiles
    const activeRack = isSpectatingApi ? suggestionRack : rackTiles

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isSpectatingApi && blankTileTarget) {
        if (/^[a-zA-Z]$/.test(e.key)) {
          handleBlankLetterChoice(e.key)
        } else if (e.key === 'Escape') {
          setBlankTileTarget(null)
        }
        return
      }
      if (isSpectatingApi && suggestionBlankTarget) {
        if (/^[a-zA-Z]$/.test(e.key)) {
          handleSuggestionBlankChoice(e.key)
        } else if (e.key === 'Escape') {
          setSuggestionBlankTarget(null)
        }
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (isSpectatingApi) {
          setSuggestionDirection(e.key === 'ArrowDown' ? 'down' : 'across')
        } else {
          setDirection(e.key === 'ArrowDown' ? 'down' : 'across')
        }
        return
      }

      if (e.key === 'Backspace') {
        e.preventDefault()
        const entries = Array.from(activeTiles.entries())
        if (entries.length > 0) {
          const lastKey = entries[entries.length - 1][0]
          if (isSpectatingApi) {
            setSuggestionTiles(prev => {
              const next = new Map(prev)
              next.delete(lastKey)
              return next
            })
            const [r, c] = lastKey.split(',').map(Number)
            setSuggestionSquare({ row: r, col: c })
          } else {
            setPlacedTiles(prev => {
              const next = new Map(prev)
              next.delete(lastKey)
              return next
            })
            const [r, c] = lastKey.split(',').map(Number)
            setSelectedSquare({ row: r, col: c })
          }
        }
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (!isSpectatingApi && placedTiles.size > 0) handleSubmitMove()
        return
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        if (isSpectatingApi) {
          setSuggestionTiles(new Map())
          setSuggestionSquare(null)
        } else {
          handleRecall()
        }
        return
      }

      if (!activeSquare) return

      const letter = e.key.toUpperCase()
      if (!/^[A-Z]$/.test(letter)) return
      e.preventDefault()

      const matchingTile = activeRack.find(t => t.letter === letter)
      const tileToPlace = matchingTile || activeRack.find(t => t.isBlank)
      if (!tileToPlace) return

      const key = `${activeSquare.row},${activeSquare.col}`
      if (board[activeSquare.row]?.[activeSquare.col]?.tile) return
      if (activeTiles.has(key)) return

      if (isSpectatingApi) {
        const placed = tileToPlace.isBlank ? { ...tileToPlace, letter, value: 0 } : tileToPlace
        setSuggestionTiles(prev => {
          const next = new Map(prev)
          next.set(key, placed)
          return next
        })
      } else {
        if (tileToPlace.isBlank) {
          const blankAsLetter: Tile = { ...tileToPlace, letter, value: 0 }
          setPlacedTiles(prev => {
            const next = new Map(prev)
            next.set(key, blankAsLetter)
            return next
          })
        } else {
          placeTileOnBoard(activeSquare.row, activeSquare.col, tileToPlace)
        }
      }

      // Advance cursor
      let nextRow = activeSquare.row
      let nextCol = activeSquare.col
      do {
        if (activeDirection === 'across') nextCol++
        else nextRow++
      } while (
        nextRow < 15 && nextCol < 15 &&
        (board[nextRow]?.[nextCol]?.tile || activeTiles.has(`${nextRow},${nextCol}`))
      )
      if (nextRow < 15 && nextCol < 15) {
        if (isSpectatingApi) {
          setSuggestionSquare({ row: nextRow, col: nextCol })
        } else {
          setSelectedSquare({ row: nextRow, col: nextCol })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, isActive, isSpectatingApi, selectedSquare, suggestionSquare, direction, suggestionDirection, rackTiles, suggestionRack, placedTiles, suggestionTiles, board, blankTileTarget])

  const handleRecall = useCallback(() => {
    setPlacedTiles(new Map())
    setSelectedSquare(null)
    setStagedFindWordsKey(null)
  }, [setPlacedTiles, setSelectedSquare, setStagedFindWordsKey])

  // Clear the instructional highlight on any committed move.
  useEffect(() => {
    setStagedFindWordsKey(null)
  }, [moveCount, setStagedFindWordsKey])

  const handlePickupTile = useCallback((row: number, col: number, insertIndex?: number) => {
    const key = `${row},${col}`
    if (isSpectatingApi && suggestionTiles.has(key)) {
      setSuggestionTiles(prev => {
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      return
    }
    const returningTile = placedTiles.get(key)
    if (!returningTile) return
    setPlacedTiles(prev => {
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    setStagedFindWordsKey(null)
    if (insertIndex !== undefined) {
      const baseIds = rackTiles.map(t => t.id)
      const at = Math.max(0, Math.min(insertIndex, baseIds.length))
      baseIds.splice(at, 0, returningTile.id)
      setRackOrder(baseIds)
    }
  }, [placedTiles, isSpectatingApi, suggestionTiles, rackTiles, setPlacedTiles, setStagedFindWordsKey, setSuggestionTiles, setRackOrder])

  const handleRackTileClick = useCallback((tile: Tile) => {
    if (isExchangeMode) {
      setExchangeSelection(prev => {
        const next = new Set(prev)
        if (next.has(tile.id)) next.delete(tile.id)
        else next.add(tile.id)
        return next
      })
      return
    }

    if (isSpectatingApi) {
      handleSuggestionTileClick(tile)
      return
    }

    if (selectedSquare && isMyTurn) {
      placeTileOnBoard(selectedSquare.row, selectedSquare.col, tile)
      let nextRow = selectedSquare.row
      let nextCol = selectedSquare.col
      do {
        if (direction === 'across') nextCol++
        else nextRow++
      } while (
        nextRow < 15 && nextCol < 15 &&
        (board[nextRow]?.[nextCol]?.tile || placedTiles.has(`${nextRow},${nextCol}`))
      )
      if (nextRow < 15 && nextCol < 15) {
        setSelectedSquare({ row: nextRow, col: nextCol })
      }
    }
  }, [isExchangeMode, isSpectatingApi, selectedSquare, isMyTurn, direction, board, placedTiles, setExchangeSelection, handleSuggestionTileClick, placeTileOnBoard, setSelectedSquare])

  return {
    blankTileTarget,
    handleSquareClick,
    placeTileOnBoard,
    stageMoveFromFindWords,
    handleBlankLetterChoice,
    handleDrop,
    handleRecall,
    handlePickupTile,
    handleRackTileClick,
  }
}
