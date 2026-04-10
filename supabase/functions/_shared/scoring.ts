import type { BoardCell, Tile } from "./gameConstants.ts";
import { BOARD_SIZE, RACK_SIZE, getBonusType } from "./gameConstants.ts";

/**
 * A tile placed on the board as part of a pending move.
 * Shared between the frontend (useMoveMutations) and the backend
 * (play-move, validate-move handlers).
 */
export interface PlacedTile {
  row: number;
  col: number;
  tile: Tile;
}

export interface ScoredWord {
  word: string;
  score: number;
  cells: { row: number; col: number }[];
}

export interface ScoreResult {
  totalScore: number;
  words: ScoredWord[];
  isBingo: boolean;
}

/**
 * Validate that a set of placed tiles forms a legal Scrabble move.
 * Returns an error message if invalid, or `null` if valid.
 *
 * Checks, in order: non-empty, in-bounds, squares not already occupied,
 * single row or column, contiguous (new tiles plus any existing tiles
 * between them form an unbroken run), covers the center on the first
 * move, and connects to an existing tile otherwise.
 *
 * This is a pure function — no mutation, no side effects.
 */
export function validateMove(
  placedTiles: PlacedTile[],
  board: BoardCell[][],
  isFirstMove: boolean,
): string | null {
  if (placedTiles.length === 0) return "No tiles placed";

  // Bounds + occupancy
  for (const pt of placedTiles) {
    if (
      pt.row < 0 || pt.row >= BOARD_SIZE ||
      pt.col < 0 || pt.col >= BOARD_SIZE
    ) {
      return `Position (${pt.row},${pt.col}) out of bounds`;
    }
    if (board[pt.row]?.[pt.col]?.tile) {
      return `Square (${pt.row},${pt.col}) already occupied`;
    }
  }

  // Single row or column
  const rows = new Set(placedTiles.map((t) => t.row));
  const cols = new Set(placedTiles.map((t) => t.col));
  const isHorizontal = rows.size === 1;
  const isVertical = cols.size === 1;
  if (!isHorizontal && !isVertical) {
    return "Tiles must be placed in a single row or column";
  }

  // First-move constraints
  if (isFirstMove) {
    if (!placedTiles.some((t) => t.row === 7 && t.col === 7)) {
      return "First word must cover the center square";
    }
    if (placedTiles.length < 2) {
      return "First word must be at least 2 letters";
    }
  }

  // Contiguous along the line of play (gaps are OK if bridged by an
  // existing tile, which lets the player extend an existing word).
  const newPositions = new Set(placedTiles.map((t) => `${t.row},${t.col}`));
  if (isHorizontal) {
    const row = placedTiles[0].row;
    const minCol = Math.min(...placedTiles.map((t) => t.col));
    const maxCol = Math.max(...placedTiles.map((t) => t.col));
    for (let c = minCol; c <= maxCol; c++) {
      const hasExisting = board[row][c].tile !== null;
      const hasNew = newPositions.has(`${row},${c}`);
      if (!hasExisting && !hasNew) {
        return "Tiles must be contiguous (no gaps)";
      }
    }
  } else {
    const col = placedTiles[0].col;
    const minRow = Math.min(...placedTiles.map((t) => t.row));
    const maxRow = Math.max(...placedTiles.map((t) => t.row));
    for (let r = minRow; r <= maxRow; r++) {
      const hasExisting = board[r][col].tile !== null;
      const hasNew = newPositions.has(`${r},${col}`);
      if (!hasExisting && !hasNew) {
        return "Tiles must be contiguous (no gaps)";
      }
    }
  }

  // Connection rule — every move after the first must touch an
  // existing tile orthogonally. (The first move covers the center,
  // which is implicitly the "existing" anchor.)
  if (!isFirstMove) {
    const connects = placedTiles.some((pt) => {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const r = pt.row + dr, c = pt.col + dc;
        if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) continue;
        if (board[r][c].tile !== null) return true;
      }
      return false;
    });
    if (!connects) {
      return "Word must connect to existing tiles";
    }
  }

  return null;
}

/**
 * Compute the score for a set of placed tiles on a board. Assumes the
 * placement is valid — call {@link validateMove} first. Builds a temporary
 * overlay board to read the main word and every cross-word, applies
 * letter and word multipliers for the newly-placed tiles only, and adds
 * the +50 bingo bonus when the whole rack is played.
 *
 * This is a pure function — no mutation of the passed board.
 */
export function scoreMove(
  placedTiles: PlacedTile[],
  board: BoardCell[][],
): ScoreResult {
  if (placedTiles.length === 0) {
    return { totalScore: 0, words: [], isBingo: false };
  }

  // Temp board: copy existing cells, overlay the new tiles.
  const tempBoard: BoardCell[][] = board.map((row) =>
    row.map((cell) => ({ ...cell }))
  );
  for (const pt of placedTiles) {
    tempBoard[pt.row][pt.col] = {
      tile: pt.tile,
      bonus: board[pt.row]?.[pt.col]?.bonus ?? getBonusType(pt.row, pt.col),
      isNew: true,
    };
  }

  const rows = new Set(placedTiles.map((t) => t.row));
  const isHorizontal = rows.size === 1;
  const newPositions = new Set(placedTiles.map((t) => `${t.row},${t.col}`));

  const words: ScoredWord[] = [];

  // Main word along the direction of play
  const anchor = placedTiles[0];
  const mainWord = readWordAt(
    tempBoard,
    anchor.row,
    anchor.col,
    isHorizontal,
    newPositions,
  );
  if (mainWord && mainWord.word.length >= 2) words.push(mainWord);

  // Cross words at each newly-placed tile
  for (const pt of placedTiles) {
    const cross = readWordAt(
      tempBoard,
      pt.row,
      pt.col,
      !isHorizontal,
      newPositions,
    );
    if (cross && cross.word.length >= 2) words.push(cross);
  }

  let totalScore = words.reduce((sum, w) => sum + w.score, 0);
  const isBingo = placedTiles.length === RACK_SIZE;
  if (isBingo) totalScore += 50;

  return { totalScore, words, isBingo };
}

/**
 * Walk a word on the board starting from (row, col) in the given direction.
 * Returns the word, its score, and the cells it occupies — or null if the
 * walk produces a single-letter "word" (which isn't a word at all).
 */
function readWordAt(
  board: BoardCell[][],
  row: number,
  col: number,
  horizontal: boolean,
  newPositions: Set<string>,
): ScoredWord | null {
  // Back up to the start of the word
  let r = row;
  let c = col;
  if (horizontal) {
    while (c > 0 && board[r][c - 1].tile) c--;
  } else {
    while (r > 0 && board[r - 1][c].tile) r--;
  }

  let word = "";
  let rawScore = 0;
  let wordMultiplier = 1;
  const cells: { row: number; col: number }[] = [];

  while (r < BOARD_SIZE && c < BOARD_SIZE && board[r][c].tile) {
    const cell = board[r][c];
    const tile = cell.tile!;
    let letterScore = tile.value;

    // Bonus squares only apply to newly-placed tiles.
    const isNew = newPositions.has(`${r},${c}`);
    if (isNew && cell.bonus) {
      switch (cell.bonus) {
        case "DL":
          letterScore *= 2;
          break;
        case "TL":
          letterScore *= 3;
          break;
        case "DW":
        case "CENTER":
          wordMultiplier *= 2;
          break;
        case "TW":
          wordMultiplier *= 3;
          break;
      }
    }

    rawScore += letterScore;
    word += tile.letter;
    cells.push({ row: r, col: c });

    if (horizontal) c++;
    else r++;
  }

  if (word.length < 2) return null;
  return { word, score: rawScore * wordMultiplier, cells };
}
