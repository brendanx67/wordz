import { useEffect, useRef, useState } from 'react'

interface MoveTile { row: number; col: number }
interface MoveEntry { type?: string; tiles?: MoveTile[] }

// Flash a gold highlight on the tiles of the most recent committed play, for
// the same window the move toast is up (sonner default ≈ 4 s). Driven off the
// last entry of move_history rather than games.last_move so it works with
// useMoveMutations's optimistic cache update, which writes move_history but
// not last_move.
//
// First observation on mount is silent — we record the current move count
// without flashing, so reopening a tab or re-entering the page doesn't
// re-highlight an old play.
export function useLastMoveHighlight(
  moveHistory: MoveEntry[] | undefined,
  durationMs = 4000,
): { row: number; col: number }[] | undefined {
  const [highlight, setHighlight] = useState<{ row: number; col: number }[] | undefined>()
  const seenCountRef = useRef<number | null>(null)

  const count = moveHistory?.length ?? 0

  useEffect(() => {
    if (seenCountRef.current === null) {
      seenCountRef.current = count
      return
    }
    if (count <= seenCountRef.current) return
    seenCountRef.current = count

    const last = moveHistory?.[count - 1]
    if (last?.type !== 'play' || !last.tiles?.length) return

    setHighlight(last.tiles.map(t => ({ row: t.row, col: t.col })))
    const timer = setTimeout(() => setHighlight(undefined), durationMs)
    return () => clearTimeout(timer)
  }, [count, moveHistory, durationMs])

  return highlight
}
