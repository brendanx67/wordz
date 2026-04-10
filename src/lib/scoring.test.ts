import { describe, test, expect } from "bun:test";
import {
  validateMove,
  scoreMove,
  type PlacedTile,
} from "./_shared/scoring.ts";
import {
  createEmptyBoard,
  TILE_VALUES,
  type BoardCell,
  type Tile,
} from "./gameConstants";

// ─── Test helpers ────────────────────────────────────────────────────────────

let idCounter = 0;

function tile(letter: string, opts?: { isBlank?: boolean }): Tile {
  const isBlank = opts?.isBlank ?? false;
  return {
    letter,
    value: isBlank ? 0 : TILE_VALUES[letter],
    isBlank,
    id: `t-${idCounter++}`,
  };
}

function placedTile(
  row: number,
  col: number,
  letter: string,
  opts?: { isBlank?: boolean }
): PlacedTile {
  return { row, col, tile: tile(letter, opts) };
}

/**
 * Test wrapper that combines validateMove + scoreMove into the flat
 * result shape the tests were originally written against. This keeps
 * the assertions concise while still exercising both halves of the
 * consolidated scoring module.
 */
function validateAndScore(
  board: BoardCell[][],
  placedTiles: PlacedTile[],
  isFirstMove: boolean,
): {
  valid: boolean;
  words: { word: string; score: number }[];
  totalScore: number;
  error?: string;
} {
  const err = validateMove(placedTiles, board, isFirstMove);
  if (err) return { valid: false, words: [], totalScore: 0, error: err };
  const { words, totalScore } = scoreMove(placedTiles, board);
  if (words.length === 0) {
    return {
      valid: false,
      words: [],
      totalScore: 0,
      error: "Must form at least one word of 2+ letters",
    };
  }
  return { valid: true, words, totalScore };
}

/** Place `word` onto the board as pre-existing (isNew=false) tiles. Mutates `board`. */
function placeOnBoard(
  board: BoardCell[][],
  row: number,
  col: number,
  word: string,
  horizontal: boolean
) {
  for (let i = 0; i < word.length; i++) {
    const r = horizontal ? row : row + i;
    const c = horizontal ? col + i : col;
    board[r][c] = {
      tile: tile(word[i]),
      bonus: board[r][c].bonus,
      isNew: false,
    };
  }
}

describe("validateMove + scoreMove (shared)", () => {
  // ─── Validation failures ──────────────────────────────────────────────────
  test("empty placedTiles → invalid", () => {
    const result = validateAndScore(createEmptyBoard(), [], true);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/no tiles/i);
  });

  test("tiles spanning two rows AND two cols → invalid (not a single line)", () => {
    const result = validateAndScore(
      createEmptyBoard(),
      [placedTile(7, 7, "H"), placedTile(8, 8, "I")],
      true
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/single row or column/i);
  });

  test("single row with a gap → invalid (not contiguous)", () => {
    const result = validateAndScore(
      createEmptyBoard(),
      [placedTile(7, 7, "A"), placedTile(7, 10, "B")],
      true
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/contiguous/i);
  });

  // ─── First-move rules ─────────────────────────────────────────────────────
  test("first move not on center → invalid", () => {
    const result = validateAndScore(
      createEmptyBoard(),
      [placedTile(5, 5, "A"), placedTile(5, 6, "T")],
      true
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/center/i);
  });

  test("first move is a single tile (even on center) → invalid", () => {
    const result = validateAndScore(
      createEmptyBoard(),
      [placedTile(7, 7, "A")],
      true
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 2/i);
  });

  test("first move across center → valid, CENTER square doubles the word", () => {
    // "HI" at (7,6)-(7,7). H=4, I=1, (7,7)=CENTER (×2 word).
    const result = validateAndScore(
      createEmptyBoard(),
      [placedTile(7, 6, "H"), placedTile(7, 7, "I")],
      true
    );
    expect(result.valid).toBe(true);
    expect(result.words).toHaveLength(1);
    expect(result.words[0].word).toBe("HI");
    expect(result.totalScore).toBe(10); // (4 + 1) × 2
  });

  // ─── Connection rule ──────────────────────────────────────────────────────
  test("subsequent move not touching any existing tile → invalid", () => {
    const board = createEmptyBoard();
    placeOnBoard(board, 7, 6, "HI", true); // existing HI in the middle
    const result = validateAndScore(
      board,
      [placedTile(0, 0, "C"), placedTile(0, 1, "A")],
      false
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/connect/i);
  });

  test("subsequent move touching an existing tile → valid", () => {
    const board = createEmptyBoard();
    placeOnBoard(board, 7, 6, "HI", true); // H at (7,6), I at (7,7)
    const result = validateAndScore(
      board,
      [placedTile(7, 8, "T")], // extends to HIT; (7,8) has no bonus
      false
    );
    expect(result.valid).toBe(true);
    expect(result.words[0].word).toBe("HIT");
    // H(4) + I(1) + T(1). Existing tiles carry no bonus, new T has no bonus.
    expect(result.totalScore).toBe(6);
  });

  // ─── Bonus squares ────────────────────────────────────────────────────────
  test("DL on new tile → that letter's score is doubled (no word multiplier)", () => {
    const board = createEmptyBoard();
    // Seed "DO" at (7,0)-(7,1). (7,0) is TW but seeded (non-new) tiles don't re-trigger.
    placeOnBoard(board, 7, 0, "DO", true);
    // Place "WN" at (7,2)-(7,3). (7,3) is DL — N(1)×2=2.
    const result = validateAndScore(
      board,
      [placedTile(7, 2, "W"), placedTile(7, 3, "N")],
      false
    );
    expect(result.valid).toBe(true);
    expect(result.words[0].word).toBe("DOWN");
    // D(2) + O(1) + W(4, no bonus at (7,2)) + N(1×2=2 at DL) = 9
    expect(result.totalScore).toBe(9);
  });

  test("DW on new tile → the whole word is doubled", () => {
    const board = createEmptyBoard();
    // Seed R at (10,3). Place A at (11,3) — (11,3) is DW.
    placeOnBoard(board, 10, 3, "R", false);
    const result = validateAndScore(
      board,
      [placedTile(11, 3, "A")],
      false
    );
    expect(result.valid).toBe(true);
    // Single-tile placement: main-word direction is length-1 (skipped).
    // Cross-word "RA" picks up the DW bonus at (11,3).
    expect(result.words[0].word).toBe("RA");
    expect(result.totalScore).toBe(4); // (1 + 1) × 2
  });

  test("TW on new tile → the whole word is tripled", () => {
    const board = createEmptyBoard();
    // Seed R at (7,13). Place E at (7,14) — (7,14) is TW.
    placeOnBoard(board, 7, 13, "R", true);
    const result = validateAndScore(
      board,
      [placedTile(7, 14, "E")],
      false
    );
    expect(result.valid).toBe(true);
    expect(result.words[0].word).toBe("RE");
    expect(result.totalScore).toBe(6); // (1 + 1) × 3
  });

  test("multiple new tiles on multiple bonuses — letter bonuses, then word multiplier", () => {
    const board = createEmptyBoard();
    // Seed "ABC" at (1,2)-(1,4). Place S at (1,1) (DW) and T at (1,5) (TL).
    placeOnBoard(board, 1, 2, "ABC", true);
    const result = validateAndScore(
      board,
      [placedTile(1, 1, "S"), placedTile(1, 5, "T")],
      false
    );
    expect(result.valid).toBe(true);
    expect(result.words[0].word).toBe("SABCT");
    // S(1) new on DW — adds 1 to raw, sets word ×2.
    // A(1), B(3), C(3) existing — adds 7 to raw, no bonus.
    // T(1) new on TL — adds 1×3=3 to raw.
    // Raw = 1 + 7 + 3 = 11. Word ×2 = 22.
    expect(result.totalScore).toBe(22);
  });

  // ─── Bingo bonus ──────────────────────────────────────────────────────────
  test("playing 7 tiles on one move → +50 bingo bonus", () => {
    // 7 one-point tiles across the center row — covers CENTER (×2 word).
    // Letters chosen for score simplicity, not real words.
    const word = "AEIOUNR"; // all TILE_VALUES of 1
    const tiles: PlacedTile[] = [];
    for (let i = 0; i < 7; i++) {
      tiles.push(placedTile(7, 4 + i, word[i]));
    }
    const result = validateAndScore(createEmptyBoard(), tiles, true);
    expect(result.valid).toBe(true);
    expect(result.words[0].word).toBe("AEIOUNR");
    // 7 × 1 = 7, CENTER ×2 = 14, +50 bingo = 64.
    expect(result.totalScore).toBe(64);
  });

  // ─── Blanks ───────────────────────────────────────────────────────────────
  test("blank on a DL still scores 0 for that letter", () => {
    const board = createEmptyBoard();
    // Seed Q at (7,2). Place a blank playing "A" at (7,3) — (7,3) is DL.
    placeOnBoard(board, 7, 2, "Q", true);
    const result = validateAndScore(
      board,
      [placedTile(7, 3, "A", { isBlank: true })],
      false
    );
    expect(result.valid).toBe(true);
    expect(result.words[0].word).toBe("QA");
    // Q(10) + blank(0 × 2 = 0) = 10. No word multiplier.
    expect(result.totalScore).toBe(10);
  });

  // ─── "Bonuses only count for new tiles" subtlety ──────────────────────────
  test("existing tile sitting on a bonus square does NOT re-trigger that bonus", () => {
    const board = createEmptyBoard();
    // Seed A at (1,1) — (1,1) IS a DW square, but it's pre-existing (isNew=false).
    placeOnBoard(board, 1, 1, "A", true);
    // Play T at (1,2) (no bonus) to form "AT".
    const result = validateAndScore(
      board,
      [placedTile(1, 2, "T")],
      false
    );
    expect(result.valid).toBe(true);
    expect(result.words[0].word).toBe("AT");
    // Existing A on DW must NOT trigger the ×2 word multiplier.
    // Raw: A(1) + T(1) = 2. Total: 2 (not 4).
    expect(result.totalScore).toBe(2);
  });

  // ─── Pure scoring (no validation) ─────────────────────────────────────────
  test("scoreMove is pure: called on valid placement without validateMove, produces same score", () => {
    const board = createEmptyBoard();
    placeOnBoard(board, 7, 6, "HI", true);
    const tiles = [placedTile(7, 8, "T")];
    // Skip validateMove — call scoreMove directly on a known-valid placement.
    const result = scoreMove(tiles, board);
    expect(result.words[0].word).toBe("HIT");
    expect(result.totalScore).toBe(6);
    expect(result.isBingo).toBe(false);
  });

  test("scoreMove on 7 tiles reports isBingo=true", () => {
    const word = "AEIOUNR";
    const tiles: PlacedTile[] = [];
    for (let i = 0; i < 7; i++) {
      tiles.push(placedTile(7, 4 + i, word[i]));
    }
    const result = scoreMove(tiles, createEmptyBoard());
    expect(result.isBingo).toBe(true);
    expect(result.totalScore).toBe(64); // 7 + CENTER ×2 + 50 bingo
  });
});
