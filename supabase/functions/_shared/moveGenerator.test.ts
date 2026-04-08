import { describe, test, expect } from "bun:test";
import {
  generateAllMoves,
  selectMove,
  type GeneratedMove,
} from "./moveGenerator.ts";
import {
  createTrieNode,
  insertWord,
  isWord,
  type TrieNode,
} from "./trie.ts";
import {
  BOARD_SIZE,
  TILE_VALUES,
  getBonusType,
  type BoardCell,
  type Tile,
} from "./gameConstants.ts";

// ─── Test helpers ────────────────────────────────────────────────────────────

function makeBoard(): BoardCell[][] {
  const board: BoardCell[][] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: BoardCell[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) {
      row.push({ tile: null, bonus: getBonusType(r, c), isNew: false });
    }
    board.push(row);
  }
  return board;
}

let tileIdCounter = 0;
function makeTile(letter: string): Tile {
  return {
    letter,
    value: TILE_VALUES[letter] ?? 0,
    isBlank: false,
    id: `t-${tileIdCounter++}`,
  };
}

function placeStatic(board: BoardCell[][], row: number, col: number, letter: string): void {
  board[row][col] = {
    tile: makeTile(letter),
    bonus: board[row][col].bonus,
    isNew: false,
  };
}

/**
 * Build a trie from a bare word list — avoids buildTrie() which caches globally.
 */
function buildSmallTrie(...words: string[]): TrieNode {
  const root = createTrieNode();
  for (const w of words) insertWord(root, w.toUpperCase());
  return root;
}

// ─── generateAllMoves ────────────────────────────────────────────────────────

describe("generateAllMoves", () => {
  test("empty board: every generated move includes the center square (7,7)", () => {
    const trie = buildSmallTrie("CAT", "CATS", "AT", "IT", "HI", "HAS", "HIT", "IS", "AH", "HA");
    const rack: Tile[] = [
      makeTile("C"), makeTile("A"), makeTile("T"), makeTile("S"),
      makeTile("I"), makeTile("H"), makeTile("B"),
    ];
    const moves = generateAllMoves(makeBoard(), rack, trie);

    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      const coversCenter = move.tiles.some((t) => t.row === 7 && t.col === 7);
      expect(coversCenter).toBe(true);
    }
  });

  test("anchor extension: pre-placed CAT + rack [S] → generator finds the CATS play", () => {
    const trie = buildSmallTrie("CAT", "CATS", "AT", "AS");
    const board = makeBoard();
    placeStatic(board, 7, 7, "C");
    placeStatic(board, 7, 8, "A");
    placeStatic(board, 7, 9, "T");
    const rack: Tile[] = [makeTile("S")];

    const moves = generateAllMoves(board, rack, trie);

    const catsMove = moves.find((m) => m.words.some((w) => w.word === "CATS"));
    expect(catsMove).toBeDefined();
    // CATS must have been formed by placing a single new S directly after the T.
    expect(catsMove!.tiles).toHaveLength(1);
    expect(catsMove!.tiles[0].row).toBe(7);
    expect(catsMove!.tiles[0].col).toBe(10);
    expect(catsMove!.tiles[0].tile.letter).toBe("S");
  });

  test("invariant: every word in every generated move exists in the trie", () => {
    // Load enough words that a 5-tile rack produces a non-trivial move set.
    const trie = buildSmallTrie(
      "CAT", "CATS", "AT", "SAT", "AS", "TA", "TAS",
      "HIS", "HI", "IT", "HIT", "IS", "SI", "TI",
      "AH", "HA", "HAS", "ITS", "SIT", "AIT", "AI", "TIS"
    );
    const rack: Tile[] = [
      makeTile("C"), makeTile("A"), makeTile("T"), makeTile("S"), makeTile("I"),
    ];
    const moves = generateAllMoves(makeBoard(), rack, trie);

    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.words.length).toBeGreaterThan(0);
      for (const w of move.words) {
        expect(isWord(trie, w.word)).toBe(true);
      }
    }
  });

  test("generated moves can be sorted descending by totalScore, and every score is a positive integer", () => {
    const trie = buildSmallTrie("QI", "HI", "IS", "SI", "SH", "HIS", "HI");
    const rack: Tile[] = [makeTile("Q"), makeTile("I"), makeTile("S"), makeTile("H")];
    const moves = generateAllMoves(makeBoard(), rack, trie);

    expect(moves.length).toBeGreaterThan(0);
    const sorted = [...moves].sort((a, b) => b.totalScore - a.totalScore);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].totalScore).toBeLessThanOrEqual(sorted[i - 1].totalScore);
    }
    expect(sorted[0].totalScore).toBeGreaterThan(0);
    for (const m of moves) {
      expect(Number.isInteger(m.totalScore)).toBe(true);
      expect(m.totalScore).toBeGreaterThan(0);
    }
  });
});

// ─── selectMove ──────────────────────────────────────────────────────────────

describe("selectMove", () => {
  const mockMoves: GeneratedMove[] = [10, 20, 30, 40, 50].map((s, i) => ({
    tiles: [],
    words: [{ word: `W${i}`, score: s }],
    totalScore: s,
  }));

  test("null handling, hard mode picks the max-score move, easy mode stays in the lower portion", () => {
    // Empty input returns null for every difficulty.
    expect(selectMove([], "hard")).toBeNull();
    expect(selectMove([], "medium")).toBeNull();
    expect(selectMove([], "easy")).toBeNull();

    // Hard mode is deterministic: top of the sorted list.
    const hard = selectMove(mockMoves, "hard");
    expect(hard).not.toBeNull();
    expect(hard!.totalScore).toBe(50);

    // Easy mode samples from sorted.slice(floor(len * 0.4)) = indices 2..4
    // of [50,40,30,20,10] → possible scores {30, 20, 10}.
    // Sample many times to confirm the result is never a top-tier score.
    const easyPossible = new Set([30, 20, 10]);
    for (let i = 0; i < 60; i++) {
      const picked = selectMove(mockMoves, "easy");
      expect(picked).not.toBeNull();
      expect(easyPossible.has(picked!.totalScore)).toBe(true);
    }
  });
});
