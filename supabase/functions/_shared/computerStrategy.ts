// Computer player move selection. The Appel & Jacobson move generator returns
// every legal play; this module decides which one to play.
//
// Two strategies, both controlled by a single `strength` integer:
//
// - percentile: deterministic. Plays the move at rank
//   floor((1 - strength/100) * (N - 1)) of the score-descending list.
//   strength=100 → top move (formerly "Hard"). strength=80 ≈ "Medium",
//   50 ≈ "Easy", below that is custom handicap territory.
//
// - dynamic: catches up to the current leader. Targets a per-turn score of
//   `gap + (strength/100) * leaderAvgMove` and plays the move closest to it,
//   never below a small floor relative to the median move score so a
//   trivial 2-pointer never wins on distance.
//
//   strength=100 reproduces the original "Competitive" behavior — match
//   the leader's average move every turn, perpetually one move ahead if it
//   started ahead. strength<100 deliberately falls behind by
//   (1 - strength/100) * leaderAvgMove per turn so a human can pull away.

export interface MoveLike {
  totalScore: number
}

export type Strategy = 'percentile' | 'dynamic'

export interface DynamicContext {
  myScore: number
  // Score of the leading opponent (max across humans + other CPUs).
  leaderScore: number
  // How many moves the leading opponent has played, per move_history.
  // Used to compute their per-turn average. 0 → fall back to a default.
  leaderMoveCount: number
}

/** Pick the move at the given percentile rank (descending by score). */
export function selectPercentile<M extends MoveLike>(moves: M[], strength: number): M {
  if (moves.length === 0) throw new Error('selectPercentile: empty moves')
  const sorted = [...moves].sort((a, b) => b.totalScore - a.totalScore)
  const clamped = Math.max(0, Math.min(100, Math.round(strength)))
  // Integer arithmetic avoids the (1 - 0.8) === 0.19999...96 trap.
  const idx = Math.floor(((100 - clamped) * (sorted.length - 1)) / 100)
  return sorted[idx]
}

/** Default per-turn average to use when no opponent moves are recorded yet
 *  (e.g., the dynamic computer plays the very first move of the game). */
export const DYNAMIC_DEFAULT_AVG_MOVE = 20

/** Pick the move whose score lands closest to the dynamic catch-up target. */
export function selectDynamic<M extends MoveLike>(
  moves: M[],
  strength: number,
  ctx: DynamicContext,
): M {
  if (moves.length === 0) throw new Error('selectDynamic: empty moves')
  const clamped = Math.max(0, Math.min(100, strength))
  const avgMove = ctx.leaderMoveCount > 0
    ? ctx.leaderScore / ctx.leaderMoveCount
    : DYNAMIC_DEFAULT_AVG_MOVE
  const gap = ctx.leaderScore - ctx.myScore
  const target = gap + (clamped / 100) * avgMove

  // Floor: never play a trivially weak move just because it minimizes |dist|.
  // Calibrated against the median of the available moves.
  const ascending = moves.map(m => m.totalScore).sort((a, b) => a - b)
  const median = ascending[Math.floor(ascending.length / 2)] ?? 0
  const floor = Math.max(4, Math.floor(median * 0.3))
  const effective = Math.max(floor, target)

  let best = moves[0]
  let bestDist = Math.abs(best.totalScore - effective)
  for (let i = 1; i < moves.length; i++) {
    const d = Math.abs(moves[i].totalScore - effective)
    if (d < bestDist) { bestDist = d; best = moves[i] }
  }
  return best
}

/** Walk the move_history and return the per-player count of `play` moves. */
export function countPlaysByPlayer(
  moveHistory: { player_id: string; type: string }[],
): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const m of moveHistory) {
    if (m.type !== 'play') continue
    counts[m.player_id] = (counts[m.player_id] ?? 0) + 1
  }
  return counts
}

// ─── Naming and description ──────────────────────────────────────────────────

/** Named presets exposed in the create-game form. */
export const PRESETS = [
  { name: 'Easy', strategy: 'percentile' as Strategy, strength: 50 },
  { name: 'Medium', strategy: 'percentile' as Strategy, strength: 80 },
  { name: 'Hard', strategy: 'percentile' as Strategy, strength: 100 },
  { name: 'Competitive', strategy: 'dynamic' as Strategy, strength: 100 },
] as const

/** Short label shown in the scoreboard, lobby, and history.
 *  Presets get their familiar names; off-preset values become "C{strength}". */
export function computerLabel(strategy: Strategy, strength: number): string {
  const preset = PRESETS.find(p => p.strategy === strategy && p.strength === strength)
  return preset ? preset.name : `C${strength}`
}

/** Longer description for the get-game API response (LLM clients consume it). */
export function computerDescription(strategy: Strategy, strength: number): string {
  if (strategy === 'percentile') {
    if (strength === 100) {
      return 'Brute-force algorithm (Hard) — exhaustively searches all legal moves and always plays the highest-scoring one'
    }
    if (strength === 80) {
      return 'Algorithm (Medium, percentile 80) — plays the move at the 80th percentile of the score-sorted list'
    }
    if (strength === 50) {
      return 'Algorithm (Easy, percentile 50) — plays the median-scoring move'
    }
    return `Algorithm (Custom, percentile ${strength}) — plays the move at the ${strength}th percentile of the score-sorted list`
  }
  // dynamic
  if (strength === 100) {
    return "Adaptive algorithm (Competitive) — targets the leading opponent's score each turn, playing conservatively when ahead and aggressively when behind"
  }
  return `Adaptive algorithm (Custom, dynamic ${strength}) — like Competitive but accepts falling ${100 - strength}% behind the leader's per-turn average so a human can pull away`
}
