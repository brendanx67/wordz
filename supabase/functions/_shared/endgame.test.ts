import { describe, test, expect } from "bun:test";
import {
  applyEndgameScoring,
  type EndgameInput,
} from "./endgame.ts";

// Helper: build a minimal rack from bare values
function rack(...values: Array<number | { value: number; isBlank: boolean }>) {
  return values.map((v) => (typeof v === "number" ? { value: v } : v));
}

describe("applyEndgameScoring", () => {
  test("regression: human out-player, computer holding Q — swing is +20", () => {
    // Live-game regression case from issue #2:
    // Human emptied rack; computer held a Q (value 10).
    // Expected: human +10, computer -10, net +20 swing vs. pre-endgame scores.
    const input: EndgameInput = {
      outPlayerId: "human-1",
      outPlayerScoreBeforeBonus: 100,
      computers: [{ id: "cpu-1", score: 80, rack: rack(10) }], // Q
      humans: [{ id: "human-1", score: 100, rack: [] }],
    };

    const result = applyEndgameScoring(input);

    expect(result.totalBonusToOutPlayer).toBe(10);
    expect(result.outPlayerNewScore).toBe(110);
    expect(result.humans.find((p) => p.id === "human-1")!.score).toBe(110);
    expect(result.computers.find((p) => p.id === "cpu-1")!.score).toBe(70);
    // Score swing: human went from 100 → 110, computer 80 → 70 → +20 net.
    const swing =
      (result.humans[0].score - 100) - (result.computers[0].score - 80);
    expect(swing).toBe(20);
  });

  test("symmetric: computer out-player, human holding tiles — same logic applies", () => {
    const input: EndgameInput = {
      outPlayerId: "cpu-1",
      outPlayerScoreBeforeBonus: 80,
      computers: [{ id: "cpu-1", score: 80, rack: [] }],
      humans: [{ id: "human-1", score: 100, rack: rack(5) }], // K
    };

    const result = applyEndgameScoring(input);

    expect(result.totalBonusToOutPlayer).toBe(5);
    expect(result.outPlayerNewScore).toBe(85);
    expect(result.computers.find((p) => p.id === "cpu-1")!.score).toBe(85);
    expect(result.humans.find((p) => p.id === "human-1")!.score).toBe(95);
  });

  test("multiple mixed-type opponents — bonus sums across all, deductions stay per-opponent", () => {
    const input: EndgameInput = {
      outPlayerId: "human-1",
      outPlayerScoreBeforeBonus: 50,
      computers: [
        { id: "cpu-1", score: 60, rack: rack(8, 2) }, // 10
      ],
      humans: [
        { id: "human-1", score: 50, rack: [] },
        { id: "human-2", score: 40, rack: rack(3) }, // 3
        { id: "human-3", score: 30, rack: rack(1, 5) }, // 6
      ],
    };

    const result = applyEndgameScoring(input);

    expect(result.totalBonusToOutPlayer).toBe(19); // 10 + 3 + 6
    expect(result.outPlayerNewScore).toBe(69);
    expect(result.humans.find((p) => p.id === "human-1")!.score).toBe(69);
    expect(result.humans.find((p) => p.id === "human-2")!.score).toBe(37);
    expect(result.humans.find((p) => p.id === "human-3")!.score).toBe(24);
    expect(result.computers.find((p) => p.id === "cpu-1")!.score).toBe(50);
  });

  test("score floor: opponent capped at 0, out-player still receives full bonus", () => {
    // Computer has 5 points but holds 10 points of tiles.
    // After endgame: computer floors at 0, but out-player still receives the full 10.
    const input: EndgameInput = {
      outPlayerId: "human-1",
      outPlayerScoreBeforeBonus: 0,
      computers: [{ id: "cpu-1", score: 5, rack: rack(10) }],
      humans: [{ id: "human-1", score: 0, rack: [] }],
    };

    const result = applyEndgameScoring(input);

    expect(result.totalBonusToOutPlayer).toBe(10); // full value, not 5
    expect(result.outPlayerNewScore).toBe(10);
    expect(result.computers.find((p) => p.id === "cpu-1")!.score).toBe(0); // floored
  });

  test("all opponents with empty racks — no bonus, no deductions", () => {
    const input: EndgameInput = {
      outPlayerId: "human-1",
      outPlayerScoreBeforeBonus: 50,
      computers: [{ id: "cpu-1", score: 40, rack: [] }],
      humans: [
        { id: "human-1", score: 50, rack: [] },
        { id: "human-2", score: 60, rack: [] },
      ],
    };

    const result = applyEndgameScoring(input);

    expect(result.totalBonusToOutPlayer).toBe(0);
    expect(result.outPlayerNewScore).toBe(50);
    expect(result.humans.find((p) => p.id === "human-1")!.score).toBe(50);
    expect(result.humans.find((p) => p.id === "human-2")!.score).toBe(60);
    expect(result.computers.find((p) => p.id === "cpu-1")!.score).toBe(40);
  });

  test("blank tiles in opponent rack always count as 0", () => {
    // Even if a blank somehow has a non-zero value (defensive), isBlank wins.
    const input: EndgameInput = {
      outPlayerId: "human-1",
      outPlayerScoreBeforeBonus: 100,
      computers: [
        {
          id: "cpu-1",
          score: 80,
          rack: [
            { value: 1, isBlank: true }, // counts as 0
            { value: 5, isBlank: false }, // counts as 5
          ],
        },
      ],
      humans: [{ id: "human-1", score: 100, rack: [] }],
    };

    const result = applyEndgameScoring(input);

    expect(result.totalBonusToOutPlayer).toBe(5);
    expect(result.outPlayerNewScore).toBe(105);
    expect(result.computers.find((p) => p.id === "cpu-1")!.score).toBe(75);
  });

  test("does not mutate input objects", () => {
    // Guard against accidental mutation creeping in.
    const computers = [{ id: "cpu-1", score: 80, rack: rack(10) }];
    const humans = [{ id: "human-1", score: 100, rack: [] }];
    const cpuBefore = { ...computers[0], rack: [...computers[0].rack] };
    const humanBefore = { ...humans[0], rack: [...humans[0].rack] };

    applyEndgameScoring({
      outPlayerId: "human-1",
      outPlayerScoreBeforeBonus: 100,
      computers,
      humans,
    });

    expect(computers[0]).toEqual(cpuBefore);
    expect(humans[0]).toEqual(humanBefore);
  });
});
