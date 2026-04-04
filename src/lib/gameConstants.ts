// Standard Scrabble tile distribution and values
export const TILE_VALUES: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10, '': 0, // blank tile
}

export const TILE_DISTRIBUTION: Record<string, number> = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9,
  J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6,
  S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1, '': 2, // 2 blanks
}

export const RACK_SIZE = 7
export const BOARD_SIZE = 15

// Board bonus square types
export type BonusType = 'TW' | 'DW' | 'TL' | 'DL' | 'CENTER' | null

// Standard Scrabble board layout (0-indexed row, col)
const TW_POSITIONS = [
  [0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]
]
const DW_POSITIONS = [
  [1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
  [1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1]
]
const TL_POSITIONS = [
  [1,5],[1,9],[5,1],[5,5],[5,9],[5,13],
  [9,1],[9,5],[9,9],[9,13],[13,5],[13,9]
]
const DL_POSITIONS = [
  [0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],
  [6,2],[6,6],[6,8],[6,12],[7,3],[7,11],
  [8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],
  [12,6],[12,8],[14,3],[14,11]
]

const bonusMap = new Map<string, BonusType>()
TW_POSITIONS.forEach(([r,c]) => bonusMap.set(`${r},${c}`, 'TW'))
DW_POSITIONS.forEach(([r,c]) => bonusMap.set(`${r},${c}`, 'DW'))
TL_POSITIONS.forEach(([r,c]) => bonusMap.set(`${r},${c}`, 'TL'))
DL_POSITIONS.forEach(([r,c]) => bonusMap.set(`${r},${c}`, 'DL'))
bonusMap.set('7,7', 'CENTER')

export function getBonusType(row: number, col: number): BonusType {
  return bonusMap.get(`${row},${col}`) ?? null
}

export interface Tile {
  letter: string
  value: number
  isBlank: boolean
  id: string // unique id for drag-and-drop
}

export interface BoardCell {
  tile: Tile | null
  bonus: BonusType
  isNew: boolean // placed this turn, not yet committed
}

export interface PlacedTile {
  row: number
  col: number
  tile: Tile
}

export function createTileBag(): Tile[] {
  const bag: Tile[] = []
  let id = 0
  for (const [letter, count] of Object.entries(TILE_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) {
      bag.push({
        letter: letter === '' ? '' : letter,
        value: TILE_VALUES[letter],
        isBlank: letter === '',
        id: `tile-${id++}`,
      })
    }
  }
  // Shuffle using Fisher-Yates
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

export function createEmptyBoard(): BoardCell[][] {
  const board: BoardCell[][] = []
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: BoardCell[] = []
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push({ tile: null, bonus: getBonusType(r, c), isNew: false })
    }
    board.push(row)
  }
  return board
}

export function drawTiles(bag: Tile[], count: number): { drawn: Tile[]; remaining: Tile[] } {
  const drawn = bag.slice(0, count)
  const remaining = bag.slice(count)
  return { drawn, remaining }
}
