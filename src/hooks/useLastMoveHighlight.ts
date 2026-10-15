import { useEffect, useRef, useState } from 'react'
import { newestPlayTiles, type MoveEntry, type MoveTile } from '@/lib/lastMoveHighlight'

// Flash a gold highlight on the tiles of the most recent committed play, for
// the same window the move toast is up (sonner default ≈ 4 s). Driven off
// move_history rather than games.last_move so it works with
// useMoveMutations's optimistic cache update, which writes move_history but
// not last_move.
//
// First observation on mount is silent — we record the current move count
// without flashing, so reopening a tab or re-entering the page doesn't
// re-highlight an old play.
export function useLastMoveHighlight(
  moveHistory: MoveEntry[] | undefined,
  durationMs = 4000,
): MoveTile[] | undefined {
  const [highlight, setHighlight] = useState<MoveTile[] | undefined>()
  const seenCountRef = useRef<number | null>(null)

  const count = moveHistory?.length ?? 0

  useEffect(() => {
    if (seenCountRef.current === null) {
      seenCountRef.current = count
      return
    }
    if (count <= seenCountRef.current) return
    const previousCount = seenCountRef.current
    seenCountRef.current = count
    setHighlight(newestPlayTiles(moveHistory, previousCount))
  }, [count, moveHistory])

  // The clear timer is keyed to the highlight itself, so a refetch that only
  // changes the moveHistory reference can't cancel it and strand the flash.
  useEffect(() => {
    if (!highlight) return
    const timer = setTimeout(() => setHighlight(undefined), durationMs)
    return () => clearTimeout(timer)
  }, [highlight, durationMs])

  return highlight
}
