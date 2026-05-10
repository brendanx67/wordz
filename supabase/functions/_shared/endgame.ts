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
  /** Displayed character — "" for an unassigned blank, the assigned letter
   *  for a played-then-recalled blank (always counts as 0). Optional to
   *  keep test fixtures compact; the snapshot in EndgameAdjustment.rackTiles
   *  always carries a string ("" if absent on input). */
  letter?: string;
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

/** Score adjustment applied to one non-out player at the end of the game.
 *  Carries the structured rack contents so callers can render history
 *  entries like "Brendan: Q, E = -11" without recomputing anything. */
export interface EndgameAdjustment {
  playerId: string;
  /** Verbatim snapshot of the player's rack at game end, blanks included. */
  rackTiles: EndgamePlayerRackTile[];
  /** Sum of non-blank rack values; what was subtracted (pre-floor). */
  rackValue: number;
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
  /** Per-non-out-player rack penalties, in `[...computers, ...humans]` order
   *  filtered to exclude the out-player. Empty racks are still included so
   *  callers can decide whether to show a 0-value entry or skip it. */
  penalties: EndgameAdjustment[];
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
  const penalties: EndgameAdjustment[] = [];

  const deductOpponent = (p: EndgamePlayer): EndgamePlayer => {
    if (p.id === outPlayerId) return p;
    const rv = rackValue(p.rack);
    totalBonusToOutPlayer += rv;
    penalties.push({
      playerId: p.id,
      rackTiles: p.rack.map((t) => ({
        letter: t.letter ?? '',
        value: t.value ?? 0,
        isBlank: !!t.isBlank,
      })),
      rackValue: rv,
    });
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
    penalties,
  };
}

// ─── Move-history entry shape (shared) ───────────────────────────────────────

/** Snapshot of a tile in the rack at game end. Blanks carry whatever letter
 *  they were assigned during play (or "" for unplayed), value always 0. */
export type EndgameHistoryRackTile = EndgamePlayerRackTile;

/** A move_history entry that records the score impact of going out. Two
 *  variants:
 *    'endgame_penalty' — opponent's rack value was deducted from their score.
 *    'endgame_bonus'   — out-player received the sum of opponents' rack values.
 */
export interface EndgameHistoryEntry {
  player_id: string;
  player_name: string;
  type: 'endgame_penalty' | 'endgame_bonus';
  /** For 'endgame_penalty': rack at game end. Omitted for 'endgame_bonus'. */
  rack_tiles?: EndgameHistoryRackTile[];
  /** Negative for penalty, positive for bonus. */
  score_adjustment: number;
  timestamp: string;
}

/** Build move_history entries from the structured EndgameResult.
 *
 *  - One 'endgame_penalty' entry per non-out player whose rack had any
 *    non-zero value (zero-rack entries skipped — they add nothing visually).
 *  - One 'endgame_bonus' entry for the out-player if `totalBonusToOutPlayer`
 *    is positive.
 *
 *  `getName` resolves a player_id to a display name. Pass an out-of-band
 *  lookup (a Map.get, profiles fetch, etc.); this module won't do IO. */
export function buildEndgameHistoryEntries(
  result: EndgameResult,
  outPlayerId: string,
  getName: (playerId: string) => string,
  timestamp: string,
): EndgameHistoryEntry[] {
  const entries: EndgameHistoryEntry[] = [];
  for (const p of result.penalties) {
    if (p.rackValue === 0) continue;
    entries.push({
      player_id: p.playerId,
      player_name: getName(p.playerId),
      type: 'endgame_penalty',
      rack_tiles: p.rackTiles,
      score_adjustment: -p.rackValue,
      timestamp,
    });
  }
  if (result.totalBonusToOutPlayer > 0) {
    entries.push({
      player_id: outPlayerId,
      player_name: getName(outPlayerId),
      type: 'endgame_bonus',
      score_adjustment: result.totalBonusToOutPlayer,
      timestamp,
    });
  }
  return entries;
}
