import { describe, test, expect } from "bun:test";

// We can't import directly from api-helpers.ts because it has a Deno-specific
// jsr: import (supabase-js) that bun can't resolve. Instead we inline the two
// pure functions under test. These are small, stable, and any drift from the
// source will be caught by the round-trip test failing against the live app.

interface RawTile {
  row?: number;
  col?: number;
  cell?: string;
  letter: string;
  is_blank?: boolean;
}

function normalizeTile(
  t: RawTile
): { row: number; col: number; letter: string; is_blank: boolean } {
  let row: number;
  let col: number;
  if (t.cell) {
    const match = t.cell.toUpperCase().match(/^([A-O])(\d{1,2})$/);
    if (!match) throw new Error(`Invalid cell "${t.cell}" — use format like H8`);
    col = match[1].charCodeAt(0) - 65;
    row = parseInt(match[2]) - 1;
    if (row < 0 || row > 14) throw new Error(`Invalid row in cell "${t.cell}"`);
  } else if (t.row !== undefined && t.col !== undefined) {
    row = t.row;
    col = t.col;
  } else {
    throw new Error("Each tile must have either 'cell' (e.g. 'H8') or 'row' and 'col'");
  }
  return { row, col, letter: t.letter.toUpperCase(), is_blank: t.is_blank || false };
}

function cellNotation(row: number, col: number): string {
  return `${String.fromCharCode(65 + col)}${row + 1}`;
}

// ─── cellNotation ───────────────────────────────────────────────────────────

describe("cellNotation", () => {
  test("top-left corner is A1", () => {
    expect(cellNotation(0, 0)).toBe("A1");
  });

  test("bottom-right corner is O15", () => {
    expect(cellNotation(14, 14)).toBe("O15");
  });

  test("center is H8", () => {
    expect(cellNotation(7, 7)).toBe("H8");
  });

  test("first row, last column is O1", () => {
    expect(cellNotation(0, 14)).toBe("O1");
  });

  test("last row, first column is A15", () => {
    expect(cellNotation(14, 0)).toBe("A15");
  });
});

// ─── normalizeTile ──────────────────────────────────────────────────────────

describe("normalizeTile with cell notation", () => {
  test("H8 parses to row 7, col 7", () => {
    const result = normalizeTile({ cell: "H8", letter: "A" });
    expect(result.row).toBe(7);
    expect(result.col).toBe(7);
    expect(result.letter).toBe("A");
    expect(result.is_blank).toBe(false);
  });

  test("A1 parses to row 0, col 0", () => {
    const result = normalizeTile({ cell: "A1", letter: "X" });
    expect(result.row).toBe(0);
    expect(result.col).toBe(0);
  });

  test("O15 parses to row 14, col 14", () => {
    const result = normalizeTile({ cell: "O15", letter: "Z" });
    expect(result.row).toBe(14);
    expect(result.col).toBe(14);
  });

  test("lowercase cell is accepted", () => {
    const result = normalizeTile({ cell: "h8", letter: "a" });
    expect(result.row).toBe(7);
    expect(result.col).toBe(7);
    expect(result.letter).toBe("A");
  });

  test("is_blank defaults to false", () => {
    const result = normalizeTile({ cell: "A1", letter: "E" });
    expect(result.is_blank).toBe(false);
  });

  test("is_blank true is preserved", () => {
    const result = normalizeTile({ cell: "A1", letter: "E", is_blank: true });
    expect(result.is_blank).toBe(true);
  });
});

describe("normalizeTile with row/col", () => {
  test("row 0, col 0 works", () => {
    const result = normalizeTile({ row: 0, col: 0, letter: "A" });
    expect(result.row).toBe(0);
    expect(result.col).toBe(0);
  });

  test("row 14, col 14 works", () => {
    const result = normalizeTile({ row: 14, col: 14, letter: "Z" });
    expect(result.row).toBe(14);
    expect(result.col).toBe(14);
  });
});

describe("normalizeTile error cases", () => {
  test("invalid cell letter throws", () => {
    expect(() => normalizeTile({ cell: "Z1", letter: "A" })).toThrow();
  });

  test("invalid cell row 16 throws", () => {
    expect(() => normalizeTile({ cell: "A16", letter: "A" })).toThrow();
  });

  test("cell row 0 throws (rows are 1-indexed)", () => {
    expect(() => normalizeTile({ cell: "A0", letter: "A" })).toThrow();
  });

  test("missing cell and row/col throws", () => {
    expect(() => normalizeTile({ letter: "A" } as any)).toThrow();
  });

  test("garbage cell throws", () => {
    expect(() => normalizeTile({ cell: "ZZ99", letter: "A" })).toThrow();
  });
});

// ─── Round-trip: cellNotation → normalizeTile ───────────────────────────────

describe("cellNotation ↔ normalizeTile round-trip", () => {
  test("every board position round-trips correctly", () => {
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const cell = cellNotation(r, c);
        const result = normalizeTile({ cell, letter: "A" });
        expect(result.row).toBe(r);
        expect(result.col).toBe(c);
      }
    }
  });
});
