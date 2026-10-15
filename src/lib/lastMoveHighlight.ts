export interface MoveTile { row: number; col: number }
export interface MoveEntry { type?: string; tiles?: MoveTile[] }

// Tiles to flash for the entries appended since the last observation: the
// most recent play among them. Searches all new entries, not just the last,
// because a game-ending play arrives in the same update as the endgame
// penalty/bonus entries that follow it. Returns undefined when the new
// entries hold no play (pass, exchange), which clears any older highlight.
export function newestPlayTiles(
  moveHistory: MoveEntry[] | undefined,
  previousCount: number,
): MoveTile[] | undefined {
  if (!moveHistory) return undefined
  for (let i = moveHistory.length - 1; i >= Math.max(0, previousCount); i--) {
    const entry = moveHistory[i]
    if (entry.type === 'play' && entry.tiles?.length) {
      return entry.tiles.map(t => ({ row: t.row, col: t.col }))
    }
  }
  return undefined
}
