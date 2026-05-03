import { describe, test, expect } from "bun:test";
import {
  generateAllMoves,
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

  test("multi-letter prefix: CATER found when ER exists on the board and CAT placed from rack", () => {
    // Regression: buildPrefix used to reverse prefix letter positions,
    // placing "AC" on the board instead of "CA". recordMove then saw
    // "ACTER" instead of "CATER" and silently dropped the move.
    const trie = buildSmallTrie("CATER", "CARET", "ER");
    const board = makeBoard();
    // Place E and R vertically so the anchor is the square above E.
    // Word goes DOWN: C(r4,c10) A(r5,c10) T(r6,c10) E(r7,c10) R(r8,c10)
    placeStatic(board, 7, 10, "E"); // K8
    placeStatic(board, 8, 10, "R"); // K9

    const rack: Tile[] = [makeTile("C"), makeTile("A"), makeTile("T")];
    const moves = generateAllMoves(board, rack, trie);

    const caterMove = moves.find((m) => m.words.some((w) => w.word === "CATER"));
    expect(caterMove).toBeDefined();
    // All three rack tiles should be placed.
    expect(caterMove!.tiles).toHaveLength(3);
    // Verify correct board positions: C farthest from anchor, T closest.
    const sorted = [...caterMove!.tiles].sort((a, b) => a.row - b.row);
    expect(sorted[0]).toMatchObject({ row: 4, col: 10, tile: expect.objectContaining({ letter: "C" }) });
    expect(sorted[1]).toMatchObject({ row: 5, col: 10, tile: expect.objectContaining({ letter: "A" }) });
    expect(sorted[2]).toMatchObject({ row: 6, col: 10, tile: expect.objectContaining({ letter: "T" }) });
  });

  test("multi-letter prefix horizontal: PREFIX found when IX on the board and PREF placed from rack", () => {
    // Same reversal bug but for horizontal plays with a 4-letter prefix.
    const trie = buildSmallTrie("PREFIX", "IF", "PI");
    const board = makeBoard();
    // Place I and X horizontally: word = P(r7,c5) R(r7,c6) E(r7,c7) F(r7,c8) I(r7,c9) X(r7,c10)
    placeStatic(board, 7, 9, "I");
    placeStatic(board, 7, 10, "X");

    const rack: Tile[] = [makeTile("P"), makeTile("R"), makeTile("E"), makeTile("F")];
    const moves = generateAllMoves(board, rack, trie);

    const prefixMove = moves.find((m) => m.words.some((w) => w.word === "PREFIX"));
    expect(prefixMove).toBeDefined();
    expect(prefixMove!.tiles).toHaveLength(4);
    const sorted = [...prefixMove!.tiles].sort((a, b) => a.col - b.col);
    expect(sorted[0]).toMatchObject({ row: 7, col: 5, tile: expect.objectContaining({ letter: "P" }) });
    expect(sorted[1]).toMatchObject({ row: 7, col: 6, tile: expect.objectContaining({ letter: "R" }) });
    expect(sorted[2]).toMatchObject({ row: 7, col: 7, tile: expect.objectContaining({ letter: "E" }) });
    expect(sorted[3]).toMatchObject({ row: 7, col: 8, tile: expect.objectContaining({ letter: "F" }) });
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

  test("blank tiles: moves are generated with blanks acting as wildcards", () => {
    const trie = buildSmallTrie("CAT", "AT");
    const board = makeBoard();
    const blankTile: Tile = { letter: "", value: 0, isBlank: true, id: `t-${tileIdCounter++}` };
    const rack: Tile[] = [makeTile("C"), blankTile, makeTile("T")];

    const moves = generateAllMoves(board, rack, trie);
    expect(moves.length).toBeGreaterThan(0);

    const usesBlank = moves.some((m) =>
      m.tiles.some((t) => t.tile.isBlank)
    );
    expect(usesBlank).toBe(true);
  });

  test("single tile in rack: only single-tile plays at valid positions", () => {
    const trie = buildSmallTrie("AS", "AT", "AH", "HA", "HI");
    const board = makeBoard();
    placeStatic(board, 7, 7, "A");

    const rack: Tile[] = [makeTile("H")];
    const moves = generateAllMoves(board, rack, trie);

    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.tiles).toHaveLength(1);
    }
  });

  test("no valid moves returns empty array", () => {
    const trie = buildSmallTrie("CAT", "DOG");
    const board = makeBoard();
    placeStatic(board, 7, 7, "X");

    const rack: Tile[] = [makeTile("Q")];
    const moves = generateAllMoves(board, rack, trie);

    expect(moves).toHaveLength(0);
  });

  test("cross-word validation: placed tile must form valid words in both directions", () => {
    const trie = buildSmallTrie("HI", "HIS", "IS", "SI");
    const board = makeBoard();
    placeStatic(board, 7, 7, "H");
    placeStatic(board, 7, 8, "I");

    const rack: Tile[] = [makeTile("S")];
    const moves = generateAllMoves(board, rack, trie);

    const hisMove = moves.find((m) =>
      m.tiles.length === 1 && m.tiles[0].row === 7 && m.tiles[0].col === 9
    );
    expect(hisMove).toBeDefined();
    expect(hisMove!.words.some((w) => w.word === "HIS")).toBe(true);
  });

  test("duplicate letters in rack: correct number of plays, no double-counting", () => {
    const trie = buildSmallTrie("AA", "AB", "BA");
    const board = makeBoard();

    const rack: Tile[] = [makeTile("A"), makeTile("A"), makeTile("B")];
    const moves = generateAllMoves(board, rack, trie);

    expect(moves.length).toBeGreaterThan(0);

    const moveKeys = moves.map((m) =>
      m.tiles.map((t) => `${t.row},${t.col}:${t.tile.letter}`).sort().join("|")
    );
    const uniqueKeys = new Set(moveKeys);
    expect(uniqueKeys.size).toBe(moveKeys.length);
  });

// Move-selection logic now lives in computerStrategy.ts (see
// computerStrategy.test.ts). Difficulty choices are decoupled from move
// generation, so the move-generator tests above stay focused on legality.
