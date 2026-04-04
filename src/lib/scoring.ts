import type { BoardCell, PlacedTile } from './gameConstants'
import { BOARD_SIZE, RACK_SIZE } from './gameConstants'

interface WordFound {
  word: string
  score: number
  cells: { row: number; col: number }[]
}

export function validateAndScoreMove(
  board: BoardCell[][],
  placedTiles: PlacedTile[],
  isFirstMove: boolean
): { valid: boolean; words: WordFound[]; totalScore: number; error?: string } {
  if (placedTiles.length === 0) {
    return { valid: false, words: [], totalScore: 0, error: 'No tiles placed' }
  }

  // Check all tiles are in a single row or column
  const rows = new Set(placedTiles.map(t => t.row))
  const cols = new Set(placedTiles.map(t => t.col))
  const isHorizontal = rows.size === 1
  const isVertical = cols.size === 1

  if (!isHorizontal && !isVertical) {
    return { valid: false, words: [], totalScore: 0, error: 'Tiles must be placed in a single row or column' }
  }

  // For first move, must cover center square
  if (isFirstMove) {
    const coversCenter = placedTiles.some(t => t.row === 7 && t.col === 7)
    if (!coversCenter) {
      return { valid: false, words: [], totalScore: 0, error: 'First word must cover the center square' }
    }
    if (placedTiles.length < 2) {
      return { valid: false, words: [], totalScore: 0, error: 'First word must be at least 2 letters' }
    }
  }

  // Build a temporary board with placed tiles
  const tempBoard = board.map(row => row.map(cell => ({ ...cell })))
  for (const pt of placedTiles) {
    tempBoard[pt.row][pt.col] = {
      tile: pt.tile,
      bonus: board[pt.row][pt.col].bonus,
      isNew: true,
    }
  }

  // Check tiles are contiguous (no gaps in the line)
  if (isHorizontal) {
    const row = placedTiles[0].row
    const minCol = Math.min(...placedTiles.map(t => t.col))
    const maxCol = Math.max(...placedTiles.map(t => t.col))
    for (let c = minCol; c <= maxCol; c++) {
      if (!tempBoard[row][c].tile) {
        return { valid: false, words: [], totalScore: 0, error: 'Tiles must be contiguous (no gaps)' }
      }
    }
  } else {
    const col = placedTiles[0].col
    const minRow = Math.min(...placedTiles.map(t => t.row))
    const maxRow = Math.max(...placedTiles.map(t => t.row))
    for (let r = minRow; r <= maxRow; r++) {
      if (!tempBoard[r][col].tile) {
        return { valid: false, words: [], totalScore: 0, error: 'Tiles must be contiguous (no gaps)' }
      }
    }
  }

  // Must connect to existing tiles (unless first move)
  if (!isFirstMove) {
    const connectsToExisting = placedTiles.some(pt => {
      const neighbors = [
        [pt.row - 1, pt.col], [pt.row + 1, pt.col],
        [pt.row, pt.col - 1], [pt.row, pt.col + 1],
      ]
      return neighbors.some(([r, c]) => {
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false
        return board[r][c].tile !== null // existing tile (not newly placed)
      })
    })
    if (!connectsToExisting) {
      return { valid: false, words: [], totalScore: 0, error: 'Word must connect to existing tiles' }
    }
  }

  // Find all words formed
  const words: WordFound[] = []
  const newTilePositions = new Set(placedTiles.map(t => `${t.row},${t.col}`))

  // Get the main word
  const mainWord = getWordAt(tempBoard, placedTiles[0].row, placedTiles[0].col, isHorizontal, newTilePositions)
  if (mainWord && mainWord.word.length >= 2) {
    words.push(mainWord)
  }

  // Get cross words
  for (const pt of placedTiles) {
    const crossWord = getWordAt(tempBoard, pt.row, pt.col, !isHorizontal, newTilePositions)
    if (crossWord && crossWord.word.length >= 2) {
      words.push(crossWord)
    }
  }

  if (words.length === 0) {
    return { valid: false, words: [], totalScore: 0, error: 'Must form at least one word of 2+ letters' }
  }

  let totalScore = words.reduce((sum, w) => sum + w.score, 0)

  // Bonus for using all 7 tiles
  if (placedTiles.length === RACK_SIZE) {
    totalScore += 50
  }

  return { valid: true, words, totalScore }
}

function getWordAt(
  board: BoardCell[][],
  row: number,
  col: number,
  horizontal: boolean,
  newTilePositions: Set<string>
): WordFound | null {
  let startR = row, startC = col

  // Find the start of the word
  if (horizontal) {
    while (startC > 0 && board[startR][startC - 1].tile) startC--
  } else {
    while (startR > 0 && board[startR - 1][startC].tile) startR--
  }

  // Read the word
  let r = startR, c = startC
  let word = ''
  let rawScore = 0
  let wordMultiplier = 1
  const cells: { row: number; col: number }[] = []

  while (r < BOARD_SIZE && c < BOARD_SIZE && board[r][c].tile) {
    const cell = board[r][c]
    const tile = cell.tile!
    let letterScore = tile.value

    const isNewTile = newTilePositions.has(`${r},${c}`)

    if (isNewTile && cell.bonus) {
      switch (cell.bonus) {
        case 'DL': letterScore *= 2; break
        case 'TL': letterScore *= 3; break
        case 'DW': case 'CENTER': wordMultiplier *= 2; break
        case 'TW': wordMultiplier *= 3; break
      }
    }

    rawScore += letterScore
    word += tile.letter
    cells.push({ row: r, col: c })

    if (horizontal) c++
    else r++
  }

  if (word.length < 2) return null

  return { word, score: rawScore * wordMultiplier, cells }
}
