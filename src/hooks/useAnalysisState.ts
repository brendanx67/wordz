import { useState, useCallback, useMemo } from 'react'
import {
  createEmptyBoard,
  TILE_DISTRIBUTION,
  TILE_VALUES,
  BOARD_SIZE,
  type Tile,
  type BoardCell,
} from '@/lib/gameConstants'

/** Creates the full 100-tile set (unshuffled — order doesn't matter here). */
function createFullTileSet(): Tile[] {
  const tiles: Tile[] = []
  let id = 0
  for (const [letter, count] of Object.entries(TILE_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      tiles.push({
        letter: letter === '' ? '' : letter,
        value: TILE_VALUES[letter],
        isBlank: letter === '',
        id: `analysis-${id++}`,
      })
    }
  }
  return tiles
}

export interface AnalysisState {
  board: BoardCell[][]
  rack: Tile[]
  bag: Tile[]
  /** Tiles currently placed on the board (all are "new"/editable). */
  boardTiles: Map<string, Tile>
  tilesLeft: number
}

export interface BoardValidationError {
  type: 'disconnected' | 'no_center' | 'not_a_line' | 'gaps' | 'single_tile' | 'empty_board'
  message: string
  cells?: { row: number; col: number }[]
}

/** Validate that the board forms a single connected group of tiles,
 *  starting from the center square. Returns errors or empty array. */
export function validateBoard(board: BoardCell[][]): BoardValidationError[] {
  const errors: BoardValidationError[] = []
  const allTiles: { row: number; col: number }[] = []

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c].tile) allTiles.push({ row: r, col: c })
    }
  }

  if (allTiles.length === 0) {
    errors.push({ type: 'empty_board', message: 'The board is empty. Place some tiles first.' })
    return errors
  }

  // Center tile check
  if (!board[7][7].tile) {
    errors.push({
      type: 'no_center',
      message: 'The center square (H8) must have a tile. In Scrabble, the first word must cross the center.',
      cells: [{ row: 7, col: 7 }],
    })
  }

  // Connectivity check via BFS from the center (or first tile if center empty)
  const start = board[7][7].tile ? { row: 7, col: 7 } : allTiles[0]
  const visited = new Set<string>()
  const queue = [start]
  visited.add(`${start.row},${start.col}`)

  while (queue.length > 0) {
    const { row, col } = queue.shift()!
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nr = row + dr
      const nc = col + dc
      const key = `${nr},${nc}`
      if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE &&
          board[nr][nc].tile && !visited.has(key)) {
        visited.add(key)
        queue.push({ row: nr, col: nc })
      }
    }
  }

  if (visited.size < allTiles.length) {
    const disconnected = allTiles.filter(t => !visited.has(`${t.row},${t.col}`))
    errors.push({
      type: 'disconnected',
      message: `${disconnected.length} tile(s) are not connected to the main group. All tiles must form one connected cluster.`,
      cells: disconnected,
    })
  }

  return errors
}

export function useAnalysisState() {
  const [board, setBoard] = useState<BoardCell[][]>(createEmptyBoard)
  const [rack, setRack] = useState<Tile[]>([])
  const [bag, setBag] = useState<Tile[]>(createFullTileSet)

  // Derive how many tiles remain
  const tilesLeft = bag.length

  // Place a tile from bag onto the board at (row, col).
  // In analysis mode, we create tiles on demand by letter.
  const placeTileOnBoard = useCallback((row: number, col: number, tile: Tile) => {
    setBoard(prev => {
      const next = prev.map(r => r.map(c => ({ ...c })))
      next[row][col] = { ...next[row][col], tile, isNew: true }
      return next
    })
  }, [])

  // Remove a tile from the board and return it to the bag.
  const removeTileFromBoard = useCallback((row: number, col: number) => {
    setBoard(prev => {
      const tile = prev[row][col].tile
      if (!tile) return prev
      const next = prev.map(r => r.map(c => ({ ...c })))
      next[row][col] = { ...next[row][col], tile: null, isNew: false }
      return next
    })
  }, [])

  // Take a tile from the bag by letter and place it on the board.
  // Combined operation to avoid React batching issues with return values.
  const placeTileFromBagToBoard = useCallback((letter: string, row: number, col: number): void => {
    setBag(prev => {
      const idx = prev.findIndex(t =>
        letter === '' ? t.isBlank : (t.letter === letter && !t.isBlank)
      )
      if (idx === -1) return prev
      const tile = prev[idx]
      setBoard(b => {
        const next = b.map(r => r.map(c => ({ ...c })))
        next[row][col] = { ...next[row][col], tile, isNew: true }
        return next
      })
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
  }, [])

  // Check if a letter is available in the bag.
  const hasInBag = useCallback((letter: string): boolean => {
    return bag.some(t =>
      letter === '' ? t.isBlank : (t.letter === letter && !t.isBlank)
    )
  }, [bag])

  // Return a tile to the bag.
  const returnTileToBag = useCallback((tile: Tile) => {
    // Reset blank tiles to their original state when returned
    const returned = tile.isBlank
      ? { ...tile, letter: '', value: 0 }
      : tile
    setBag(prev => [...prev, returned])
  }, [])

  // Add a tile to the rack from the bag.
  const addToRack = useCallback((letter: string): boolean => {
    let success = false
    setBag(prev => {
      const idx = prev.findIndex(t =>
        letter === '' ? t.isBlank : (t.letter === letter && !t.isBlank)
      )
      if (idx === -1) return prev
      const tile = prev[idx]
      setRack(r => [...r, tile])
      success = true
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
    return success
  }, [])

  // Add a blank tile to the rack with a chosen letter.
  const addBlankToRack = useCallback((letter: string): boolean => {
    let success = false
    setBag(prev => {
      const idx = prev.findIndex(t => t.isBlank)
      if (idx === -1) return prev
      const tile = prev[idx]
      const withLetter: Tile = { ...tile, letter: letter.toUpperCase(), value: 0 }
      setRack(r => [...r, withLetter])
      success = true
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
    return success
  }, [])

  // Remove a tile from the rack and return it to the bag.
  const removeFromRack = useCallback((tileId: string) => {
    setRack(prev => {
      const idx = prev.findIndex(t => t.id === tileId)
      if (idx === -1) return prev
      const tile = prev[idx]
      const returned = tile.isBlank
        ? { ...tile, letter: '', value: 0 }
        : tile
      setBag(b => [...b, returned])
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
  }, [])

  // Move a tile from the rack to the board.
  const rackToBoard = useCallback((tileId: string, row: number, col: number) => {
    setRack(prev => {
      const idx = prev.findIndex(t => t.id === tileId)
      if (idx === -1) return prev
      const tile = prev[idx]
      placeTileOnBoard(row, col, tile)
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)]
    })
  }, [placeTileOnBoard])

  // Move a tile from the board to the rack.
  const boardToRack = useCallback((row: number, col: number) => {
    setBoard(prev => {
      const tile = prev[row][col].tile
      if (!tile) return prev
      setRack(r => [...r, tile])
      const next = prev.map(r => r.map(c => ({ ...c })))
      next[row][col] = { ...next[row][col], tile: null, isNew: false }
      return next
    })
  }, [])

  // Move a tile from one board cell to another.
  const moveTileOnBoard = useCallback((fromRow: number, fromCol: number, toRow: number, toCol: number) => {
    setBoard(prev => {
      const tile = prev[fromRow][fromCol].tile
      if (!tile) return prev
      const next = prev.map(r => r.map(c => ({ ...c })))
      next[fromRow][fromCol] = { ...next[fromRow][fromCol], tile: null, isNew: false }
      next[toRow][toCol] = { ...next[toRow][toCol], tile, isNew: true }
      return next
    })
  }, [])

  // Clear the entire board, returning all tiles to bag.
  const clearBoard = useCallback(() => {
    setBoard(prev => {
      const tiles: Tile[] = []
      for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
          if (prev[r][c].tile) {
            const t = prev[r][c].tile!
            tiles.push(t.isBlank ? { ...t, letter: '', value: 0 } : t)
          }
        }
      }
      if (tiles.length > 0) {
        setBag(b => [...b, ...tiles])
      }
      return createEmptyBoard()
    })
  }, [])

  // Clear the rack, returning all tiles to bag.
  const clearRack = useCallback(() => {
    setRack(prev => {
      if (prev.length === 0) return prev
      const returned = prev.map(t => t.isBlank ? { ...t, letter: '', value: 0 } : t)
      setBag(b => [...b, ...returned])
      return []
    })
  }, [])

  // Clear everything.
  const clearAll = useCallback(() => {
    clearBoard()
    clearRack()
  }, [clearBoard, clearRack])

  // Reorder rack tiles (for drag-to-reorder).
  const reorderRack = useCallback((tiles: Tile[]) => {
    setRack(tiles)
  }, [])

  // Shuffle rack tiles.
  const shuffleRack = useCallback(() => {
    setRack(prev => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }, [])

  // Load a saved state: reconstruct board + rack from compact format,
  // removing consumed tiles from a fresh bag.
  const loadState = useCallback((
    boardTiles: { row: number; col: number; letter: string; is_blank: boolean }[],
    rackLetters: string,
  ) => {
    const freshBag = createFullTileSet()
    const newBoard = createEmptyBoard()
    const newRack: Tile[] = []
    const remaining = [...freshBag]

    // Place board tiles
    for (const t of boardTiles) {
      const upper = t.letter.toUpperCase()
      let idx: number
      if (t.is_blank) {
        idx = remaining.findIndex(b => b.isBlank)
      } else {
        idx = remaining.findIndex(b => b.letter === upper && !b.isBlank)
      }
      if (idx === -1) continue // tile unavailable, skip
      const tile = remaining.splice(idx, 1)[0]
      const placed = t.is_blank ? { ...tile, letter: upper, value: 0 } : tile
      newBoard[t.row][t.col] = { ...newBoard[t.row][t.col], tile: placed, isNew: true }
    }

    // Build rack
    for (const ch of rackLetters) {
      if (ch === '?' || ch === '_') {
        const idx = remaining.findIndex(b => b.isBlank)
        if (idx !== -1) newRack.push(remaining.splice(idx, 1)[0])
      } else {
        const upper = ch.toUpperCase()
        const idx = remaining.findIndex(b => b.letter === upper && !b.isBlank)
        if (idx !== -1) newRack.push(remaining.splice(idx, 1)[0])
      }
    }

    setBoard(newBoard)
    setRack(newRack)
    setBag(remaining)
  }, [])

  // Compute remaining tile counts by letter (for the tile counter display).
  const remainingCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of bag) {
      const key = t.isBlank ? 'blank' : t.letter
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }, [bag])

  // Build the board as it looks for the move generator: all tiles are "committed"
  // (isNew = false) so the generator treats them as existing board state.
  const committedBoard = useMemo(() => {
    return board.map(row =>
      row.map(cell => ({
        ...cell,
        isNew: false,
      }))
    )
  }, [board])

  return {
    board,
    rack,
    bag,
    tilesLeft,
    remainingCounts,
    committedBoard,

    placeTileOnBoard,
    removeTileFromBoard,
    placeTileFromBagToBoard,
    hasInBag,
    returnTileToBag,
    addToRack,
    addBlankToRack,
    removeFromRack,
    rackToBoard,
    boardToRack,
    moveTileOnBoard,
    clearBoard,
    clearRack,
    clearAll,
    reorderRack,
    shuffleRack,
    loadState,
  }
}
