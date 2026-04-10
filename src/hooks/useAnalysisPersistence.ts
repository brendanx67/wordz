import { useEffect, useRef, useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  BOARD_SIZE,
  type Tile,
  type BoardCell,
} from '@/lib/gameConstants'

const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/game-api/analysis-board`
const SAVE_DEBOUNCE_MS = 2000

interface SavedTile {
  row: number
  col: number
  letter: string
  is_blank: boolean
}

/** Serialize the current board into the compact saved format. */
function serializeBoard(board: BoardCell[][]): SavedTile[] {
  const tiles: SavedTile[] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const t = board[r][c].tile
      if (t) {
        tiles.push({ row: r, col: c, letter: t.letter, is_blank: t.isBlank })
      }
    }
  }
  return tiles
}

/** Serialize the rack into a compact string. */
function serializeRack(rack: Tile[]): string {
  return rack.map(t => t.isBlank ? '?' : t.letter).join('')
}

/** Compute a stable signature so we know when state actually changed. */
function stateSignature(board: BoardCell[][], rack: Tile[]): string {
  const boardParts = serializeBoard(board).map(t => `${t.row},${t.col}:${t.letter}${t.is_blank ? '*' : ''}`)
  return `${boardParts.join('|')}||${serializeRack(rack)}`
}

export interface LoadedAnalysisBoard {
  boardTiles: SavedTile[]
  rack: string
}

export function useAnalysisPersistence(
  board: BoardCell[][],
  rack: Tile[],
  applyLoadedState: (data: LoadedAnalysisBoard) => void,
) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoaded, setHasLoaded] = useState(false)
  const lastSavedSig = useRef<string>('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load saved board on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return

        const res = await fetch(API_URL, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return

        const data = await res.json() as { board: SavedTile[]; rack: string; updated_at: string | null }
        if (cancelled) return

        if (data.updated_at && (data.board.length > 0 || data.rack.length > 0)) {
          applyLoadedState({ boardTiles: data.board, rack: data.rack })
          // Record the initial signature so we don't immediately re-save
          // We'll compute this after the state settles
          lastSavedSig.current = '__loading__'
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
          setHasLoaded(true)
        }
      }
    }
    load()
    return () => { cancelled = true }
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save on changes (debounced)
  const save = useCallback(async (boardData: BoardCell[][], rackData: Tile[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      await fetch(API_URL, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          board: serializeBoard(boardData),
          rack: serializeRack(rackData),
        }),
      })
    } catch {
      // Silent fail — user won't lose local state
    }
  }, [])

  useEffect(() => {
    if (!hasLoaded) return

    const sig = stateSignature(board, rack)

    // On first run after load, just record the signature
    if (lastSavedSig.current === '__loading__') {
      lastSavedSig.current = sig
      return
    }

    if (sig === lastSavedSig.current) return

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      lastSavedSig.current = sig
      save(board, rack)
    }, SAVE_DEBOUNCE_MS)

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [board, rack, hasLoaded, save])

  return { isLoading }
}
