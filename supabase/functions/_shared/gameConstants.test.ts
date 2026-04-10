import { describe, test, expect } from "bun:test";
import {
  TILE_VALUES,
  TILE_DISTRIBUTION,
  RACK_SIZE,
  BOARD_SIZE,
  getBonusType,
  drawTiles,
  type Tile,
} from "./gameConstants.ts";

// Also import the frontend copy so we can verify parity.
import {
  TILE_VALUES as FE_TILE_VALUES,
  TILE_DISTRIBUTION as FE_TILE_DISTRIBUTION,
  RACK_SIZE as FE_RACK_SIZE,
  BOARD_SIZE as FE_BOARD_SIZE,
  getBonusType as FE_getBonusType,
} from "../../../src/lib/gameConstants.ts";

// ─── Constants ──────────────────────────────────────────────────────────────

describe("TILE_VALUES", () => {
  test("has entries for all 26 letters plus blank", () => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    for (const l of letters) {
      expect(TILE_VALUES[l]).toBeDefined();
      expect(typeof TILE_VALUES[l]).toBe("number");
    }
    expect(TILE_VALUES[""]).toBe(0); // blank
  });

  test("high-value tiles are correct", () => {
    expect(TILE_VALUES["Q"]).toBe(10);
    expect(TILE_VALUES["Z"]).toBe(10);
    expect(TILE_VALUES["X"]).toBe(8);
    expect(TILE_VALUES["J"]).toBe(8);
  });

  test("common tiles are low value", () => {
    expect(TILE_VALUES["E"]).toBe(1);
    expect(TILE_VALUES["A"]).toBe(1);
    expect(TILE_VALUES["T"]).toBe(1);
    expect(TILE_VALUES["S"]).toBe(1);
  });
});

describe("TILE_DISTRIBUTION", () => {
  test("sums to 100 (standard Scrabble bag)", () => {
    const total = Object.values(TILE_DISTRIBUTION).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });

  test("has 2 blanks", () => {
    expect(TILE_DISTRIBUTION[""]).toBe(2);
  });

  test("has 12 E tiles (most common)", () => {
    expect(TILE_DISTRIBUTION["E"]).toBe(12);
  });

  test("has 1 each of Q, Z, X, J, K", () => {
    expect(TILE_DISTRIBUTION["Q"]).toBe(1);
    expect(TILE_DISTRIBUTION["Z"]).toBe(1);
    expect(TILE_DISTRIBUTION["X"]).toBe(1);
    expect(TILE_DISTRIBUTION["J"]).toBe(1);
    expect(TILE_DISTRIBUTION["K"]).toBe(1);
  });
});

describe("board and rack constants", () => {
  test("RACK_SIZE is 7", () => {
    expect(RACK_SIZE).toBe(7);
  });

  test("BOARD_SIZE is 15", () => {
    expect(BOARD_SIZE).toBe(15);
  });
});

// ─── getBonusType ───────────────────────────────────────────────────────────

describe("getBonusType", () => {
  test("center square is CENTER", () => {
    expect(getBonusType(7, 7)).toBe("CENTER");
  });

  test("all 8 triple-word squares", () => {
    const tw = [[0,0],[0,7],[0,14],[7,0],[7,14],[14,0],[14,7],[14,14]];
    for (const [r, c] of tw) {
      expect(getBonusType(r, c)).toBe("TW");
    }
  });

  test("all 16 double-word squares", () => {
    const dw = [
      [1,1],[2,2],[3,3],[4,4],[10,10],[11,11],[12,12],[13,13],
      [1,13],[2,12],[3,11],[4,10],[10,4],[11,3],[12,2],[13,1],
    ];
    for (const [r, c] of dw) {
      expect(getBonusType(r, c)).toBe("DW");
    }
  });

  test("all 12 triple-letter squares", () => {
    const tl = [
      [1,5],[1,9],[5,1],[5,5],[5,9],[5,13],
      [9,1],[9,5],[9,9],[9,13],[13,5],[13,9],
    ];
    for (const [r, c] of tl) {
      expect(getBonusType(r, c)).toBe("TL");
    }
  });

  test("all 24 double-letter squares", () => {
    const dl = [
      [0,3],[0,11],[2,6],[2,8],[3,0],[3,7],[3,14],
      [6,2],[6,6],[6,8],[6,12],[7,3],[7,11],
      [8,2],[8,6],[8,8],[8,12],[11,0],[11,7],[11,14],
      [12,6],[12,8],[14,3],[14,11],
    ];
    for (const [r, c] of dl) {
      expect(getBonusType(r, c)).toBe("DL");
    }
  });

  test("plain squares return null", () => {
    // A few known non-bonus squares
    expect(getBonusType(0, 1)).toBeNull();
    expect(getBonusType(1, 2)).toBeNull();
    expect(getBonusType(6, 7)).toBeNull();
    expect(getBonusType(7, 8)).toBeNull();
  });

  test("total premium squares is 61 (8 TW + 16 DW + 12 TL + 24 DL + 1 CENTER)", () => {
    let count = 0;
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        if (getBonusType(r, c) !== null) count++;
      }
    }
    expect(count).toBe(61);
  });
});

// ─── drawTiles ──────────────────────────────────────────────────────────────

describe("drawTiles", () => {
  const bag: Tile[] = [
    { letter: "A", value: 1, isBlank: false, id: "t1" },
    { letter: "B", value: 3, isBlank: false, id: "t2" },
    { letter: "C", value: 3, isBlank: false, id: "t3" },
  ];

  test("draws the requested number of tiles from the front", () => {
    const { drawn, remaining } = drawTiles(bag, 2);
    expect(drawn).toHaveLength(2);
    expect(drawn[0].letter).toBe("A");
    expect(drawn[1].letter).toBe("B");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].letter).toBe("C");
  });

  test("drawing 0 returns empty drawn and full remaining", () => {
    const { drawn, remaining } = drawTiles(bag, 0);
    expect(drawn).toHaveLength(0);
    expect(remaining).toHaveLength(3);
  });

  test("drawing more than available returns all tiles", () => {
    const { drawn, remaining } = drawTiles(bag, 10);
    expect(drawn).toHaveLength(3);
    expect(remaining).toHaveLength(0);
  });
});

// ─── Frontend/backend parity ────────────────────────────────────────────────

describe("frontend/backend parity", () => {
  test("TILE_VALUES match between frontend and backend", () => {
    expect(FE_TILE_VALUES).toEqual(TILE_VALUES);
  });

  test("TILE_DISTRIBUTION match between frontend and backend", () => {
    expect(FE_TILE_DISTRIBUTION).toEqual(TILE_DISTRIBUTION);
  });

  test("RACK_SIZE matches", () => {
    expect(FE_RACK_SIZE).toBe(RACK_SIZE);
  });

  test("BOARD_SIZE matches", () => {
    expect(FE_BOARD_SIZE).toBe(BOARD_SIZE);
  });

  test("getBonusType matches for all 225 squares", () => {
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        expect(FE_getBonusType(r, c)).toBe(getBonusType(r, c));
      }
    }
  });
});
