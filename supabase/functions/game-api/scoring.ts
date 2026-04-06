import type { Tile, BoardCell } from "./_shared/gameConstants.ts";
import { BOARD_SIZE, RACK_SIZE, getBonusType } from "./_shared/gameConstants.ts";

export interface WordFound {
  word: string;
  score: number;
  cells: { row: number; col: number }[];
}

export function scoreMove(
  board: BoardCell[][],
  placedTiles: { row: number; col: number; tile: Tile }[],
  isFirstMove: boolean
): { valid: boolean; words: WordFound[]; totalScore: number; error?: string } {
  if (placedTiles.length === 0) {
    return { valid: false, words: [], totalScore: 0, error: "No tiles placed" };
  }

  const rows = new Set(placedTiles.map((t) => t.row));
  const cols = new Set(placedTiles.map((t) => t.col));
  const isHorizontal = rows.size === 1;
  const isVertical = cols.size === 1;

  if (!isHorizontal && !isVertical) {
    return { valid: false, words: [], totalScore: 0, error: "Tiles must be in a single row or column" };
  }

  if (isFirstMove) {
    if (!placedTiles.some((t) => t.row === 7 && t.col === 7)) {
      return { valid: false, words: [], totalScore: 0, error: "First word must cover center square" };
    }
    if (placedTiles.length < 2) {
      return { valid: false, words: [], totalScore: 0, error: "First word must be at least 2 letters" };
    }
  }

  for (const pt of placedTiles) {
    if (board[pt.row]?.[pt.col]?.tile) {
      return { valid: false, words: [], totalScore: 0, error: `Square (${pt.row},${pt.col}) already occupied` };
    }
    if (pt.row < 0 || pt.row >= BOARD_SIZE || pt.col < 0 || pt.col >= BOARD_SIZE) {
      return { valid: false, words: [], totalScore: 0, error: `Position (${pt.row},${pt.col}) out of bounds` };
    }
  }

  const tempBoard: BoardCell[][] = board.map((row) => row.map((cell) => ({ ...cell })));
  for (const pt of placedTiles) {
    tempBoard[pt.row][pt.col] = { tile: pt.tile, bonus: getBonusType(pt.row, pt.col), isNew: true };
  }

  if (isHorizontal) {
    const row = placedTiles[0].row;
    const minCol = Math.min(...placedTiles.map((t) => t.col));
    const maxCol = Math.max(...placedTiles.map((t) => t.col));
    for (let c = minCol; c <= maxCol; c++) {
      if (!tempBoard[row][c].tile) {
        return { valid: false, words: [], totalScore: 0, error: "Tiles must be contiguous" };
      }
    }
  } else {
    const col = placedTiles[0].col;
    const minRow = Math.min(...placedTiles.map((t) => t.row));
    const maxRow = Math.max(...placedTiles.map((t) => t.row));
    for (let r = minRow; r <= maxRow; r++) {
      if (!tempBoard[r][col].tile) {
        return { valid: false, words: [], totalScore: 0, error: "Tiles must be contiguous" };
      }
    }
  }

  if (!isFirstMove) {
    const connects = placedTiles.some((pt) => {
      return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dr, dc]) => {
        const r = pt.row + dr, c = pt.col + dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
        return board[r][c].tile !== null;
      });
    });
    if (!connects) {
      return { valid: false, words: [], totalScore: 0, error: "Must connect to existing tiles" };
    }
  }

  const newPositions = new Set(placedTiles.map((t) => `${t.row},${t.col}`));
  const words: WordFound[] = [];

  const mainWord = getWordAt(tempBoard, placedTiles[0].row, placedTiles[0].col, isHorizontal, newPositions);
  if (mainWord && mainWord.word.length >= 2) words.push(mainWord);

  for (const pt of placedTiles) {
    const cross = getWordAt(tempBoard, pt.row, pt.col, !isHorizontal, newPositions);
    if (cross && cross.word.length >= 2) words.push(cross);
  }

  if (words.length === 0) {
    return { valid: false, words: [], totalScore: 0, error: "Must form at least one word" };
  }

  let totalScore = words.reduce((sum, w) => sum + w.score, 0);
  if (placedTiles.length === RACK_SIZE) totalScore += 50;

  return { valid: true, words, totalScore };
}

function getWordAt(
  board: BoardCell[][], row: number, col: number,
  horizontal: boolean, newPositions: Set<string>
): WordFound | null {
  let r = row, c = col;
  if (horizontal) { while (c > 0 && board[r][c - 1].tile) c--; }
  else { while (r > 0 && board[r - 1][c].tile) r--; }

  let word = "";
  let rawScore = 0;
  let wordMult = 1;
  const cells: { row: number; col: number }[] = [];

  while (r < BOARD_SIZE && c < BOARD_SIZE && board[r][c].tile) {
    const cell = board[r][c];
    const tile = cell.tile!;
    let ls = tile.value;
    if (newPositions.has(`${r},${c}`) && cell.bonus) {
      switch (cell.bonus) {
        case "DL": ls *= 2; break;
        case "TL": ls *= 3; break;
        case "DW": case "CENTER": wordMult *= 2; break;
        case "TW": wordMult *= 3; break;
      }
    }
    rawScore += ls;
    word += tile.letter;
    cells.push({ row: r, col: c });
    if (horizontal) c++; else r++;
  }

  if (word.length < 2) return null;
  return { word, score: rawScore * wordMult, cells };
}
