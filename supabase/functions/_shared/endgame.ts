// Pure endgame scoring.
//
// When a player empties their rack while the bag is empty, Scrabble awards them
// the sum of every other player's remaining rack value and deducts that value
// from each opponent's score (floored at 0). The out-player receives the FULL
// pre-floor bonus even if an opponent's deduction was capped at zero.
//
// This module is the single source of truth for that math. It has no IO, no
// async, no input mutation — the callers in play-move.ts and computer-turn
// (and eventually GamePage.tsx) do the persistence; this does the arithmetic.

export interface EndgamePlayerRackTile {
  value: number;
  isBlank?: boolean;
}

export interface EndgamePlayer {
  id: string;
  score: number;
  rack: EndgamePlayerRackTile[];
}

export interface EndgameInput {
  /** id of the player who just emptied their rack */
  outPlayerId: string;
  /** the out-player's score BEFORE the endgame bonus is added */
  outPlayerScoreBeforeBonus: number;
  /** all computer/API players in the game (including the out-player if they're a computer) */
  computers: EndgamePlayer[];
  /** all human players in the game (including the out-player if they're a human) */
  humans: EndgamePlayer[];
}

export interface EndgameResult {
  /** the out-player's final score after bonus */
  outPlayerNewScore: number;
  /** total bonus awarded to the out-player (sum of opponent rack values, pre-floor) */
  totalBonusToOutPlayer: number;
  /** updated computers array — ready to persist verbatim */
  computers: EndgamePlayer[];
  /** updated humans array — ready to persist verbatim */
  humans: EndgamePlayer[];
}

function rackValue(rack: EndgamePlayerRackTile[]): number {
  // Blank tiles always count as 0, regardless of whatever value they carry.
  let total = 0;
  for (const t of rack) {
    if (t.isBlank) continue;
    total += t.value ?? 0;
  }
  return total;
}

/**
 * Compute end-game score adjustments. Pure: no IO, no async, no mutation.
 *
 * The out-player (identified by `outPlayerId`) may appear in either the
 * `computers` or `humans` list. All opponents in both lists have their rack
 * value deducted from their score (floored at 0), and the sum of those rack
 * values (pre-floor) is added to the out-player's score.
 */
export function applyEndgameScoring(input: EndgameInput): EndgameResult {
  const { outPlayerId, outPlayerScoreBeforeBonus, computers, humans } = input;

  let totalBonusToOutPlayer = 0;

  const deductOpponent = (p: EndgamePlayer): EndgamePlayer => {
    if (p.id === outPlayerId) return p;
    const rv = rackValue(p.rack);
    totalBonusToOutPlayer += rv;
    return { ...p, score: Math.max(0, p.score - rv) };
  };

  const computersAfterDeduction = computers.map(deductOpponent);
  const humansAfterDeduction = humans.map(deductOpponent);

  const outPlayerNewScore = outPlayerScoreBeforeBonus + totalBonusToOutPlayer;

  const applyBonus = (p: EndgamePlayer): EndgamePlayer =>
    p.id === outPlayerId ? { ...p, score: outPlayerNewScore } : p;

  return {
    outPlayerNewScore,
    totalBonusToOutPlayer,
    computers: computersAfterDeduction.map(applyBonus),
    humans: humansAfterDeduction.map(applyBonus),
  };
}
