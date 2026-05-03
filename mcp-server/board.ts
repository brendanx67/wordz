// ─── Shared types ────────────────────────────────────────────────────────────

export interface TileOnBoard {
  row: number;
  col: number;
  letter: string;
  value: number;
  isBlank: boolean;
}

export interface RackTile {
  letter: string;
  value: number;
  isBlank: boolean;
  id: string;
}

export interface GameState {
  game_id: string;
  status: string;
  is_your_turn: boolean;
  current_turn: string;
  your_rack: RackTile[];
  your_score: number;
  tiles_on_board: TileOnBoard[];
  tiles_remaining: number;
  players: {
    id: string;
    user_id?: string;
    name: string;
    score: number;
    type?: string;
    description?: string;
    strategy?: string;
    strength?: number;
    strategy_level?: string;
  }[];
  recent_moves: { player: string; type: string; words: string[]; score: number }[];
  winner: string | null;
  suggested_move?: {
    tiles: { cell: string; row: number; col: number; letter: string; is_blank: boolean }[];
  };
  // Whether the calling seat has find_words access. Per-seat since #9; the
  // previous game-wide `word_finder_enabled` field was replaced.
  find_words_enabled?: boolean;
}

// ─── Bonus squares ───────────────────────────────────────────────────────────

const TW = new Set(["0,0", "0,7", "0,14", "7,0", "7,14", "14,0", "14,7", "14,14"]);
const DW = new Set([
  "1,1", "2,2", "3,3", "4,4", "10,10", "11,11", "12,12", "13,13",
  "1,13", "2,12", "3,11", "4,10", "10,4", "11,3", "12,2", "13,1",
]);
const TL = new Set([
  "1,5", "1,9", "5,1", "5,5", "5,9", "5,13",
  "9,1", "9,5", "9,9", "9,13", "13,5", "13,9",
]);
const DL = new Set([
  "0,3", "0,11", "2,6", "2,8", "3,0", "3,7", "3,14",
  "6,2", "6,6", "6,8", "6,12", "7,3", "7,11",
  "8,2", "8,6", "8,8", "8,12", "11,0", "11,7", "11,14",
  "12,6", "12,8", "14,3", "14,11",
]);

// ─── Board rendering ─────────────────────────────────────────────────────────

export function renderBoard(tiles: TileOnBoard[]): string {
  const grid: string[][] = Array.from({ length: 15 }, () =>
    Array.from({ length: 15 }, () => ".")
  );

  for (const t of tiles) {
    grid[t.row][t.col] = t.letter;
  }

  const header = "    " + Array.from({ length: 15 }, (_, i) =>
    String.fromCharCode(65 + i).padStart(2)
  ).join(" ");

  const lines = [header];
  for (let r = 0; r < 15; r++) {
    const rowLabel = String(r + 1).padStart(2);
    const cells = grid[r].map((cell, c) => {
      if (cell !== ".") return ` ${cell} `;
      const key = `${r},${c}`;
      if (r === 7 && c === 7) return " * ";
      if (TW.has(key)) return "3W ";
      if (DW.has(key)) return "2W ";
      if (TL.has(key)) return "3L ";
      if (DL.has(key)) return "2L ";
      return " . ";
    });
    lines.push(`${rowLabel} ${cells.join("")}`);
  }

  return lines.join("\n");
}

// ─── Cell notation parser (e.g. "H8" → { row: 7, col: 7 }) ──────────────────

export function parseCell(cell: string): { row: number; col: number } {
  const match = cell.toUpperCase().match(/^([A-O])(\d{1,2})$/);
  if (!match) {
    throw new Error(`Invalid cell "${cell}" — use format like H8 (column A-O, row 1-15)`);
  }
  const col = match[1].charCodeAt(0) - 65;
  const row = parseInt(match[2]) - 1;
  if (row < 0 || row > 14) throw new Error(`Invalid row in "${cell}" — must be 1-15`);
  return { row, col };
}
