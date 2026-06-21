// Game-type classification, shared between the Stats page aggregation
// (usePlayerStats) and any caller that needs to name a single finished game's
// matchup — e.g. the game-over screen deep-linking into the matching stats card
// (#23). Both must compute the *same* group key, so the logic lives here once.

import { computerLabel, type Strategy } from '@/lib/_shared/computerStrategy'

export type ParticipantKind = 'human' | 'computer' | 'api'

// One seat at the board, resolved to both a "type tag" (used to classify the
// game) and a "participant identity" (used to aggregate scores across games).
export interface GameSeat {
  typeTag: string          // role in the matchup, e.g. "Human", "Computer (P97)"
  partKey: string          // who, across games: player_id / strategy:strength / name
  partLabel: string
  kind: ParticipantKind
  score: number
  isWinner: boolean
  // Set for computer seats; lets a type be turned back into a GameConfig (#23).
  strategy?: Strategy
  strength?: number
}

/** The minimal description of a seat needed to recreate it in a new game. */
export interface SeatSpec {
  kind: ParticipantKind
  strategy?: Strategy
  strength?: number
}

/** Reduce a resolved seat to the spec needed to recreate it. */
export function seatToSpec(seat: GameSeat): SeatSpec {
  return seat.kind === 'computer'
    ? { kind: 'computer', strategy: seat.strategy, strength: seat.strength }
    : { kind: seat.kind }
}

// The subset of a finished `games` row the classifier reads. Extra columns on
// the row are ignored, so callers can pass the whole record.
export interface ClassifiableGame {
  winner: string | null
  computer_players: unknown
  game_players?: { player_id: string; score: number; profiles: unknown }[] | null
}

interface ComputerSeat {
  id: string
  name: string
  strategy?: Strategy
  strength?: number
  score: number
}

function getDisplayName(profiles: unknown): string {
  if (!profiles) return 'Unknown'
  if (Array.isArray(profiles)) return (profiles[0] as { display_name?: string })?.display_name ?? 'Unknown'
  return (profiles as { display_name?: string }).display_name ?? 'Unknown'
}

/** Resolve every seat (humans + computers + LLM/API) in a finished game. */
export function seatsForGame(game: ClassifiableGame): GameSeat[] {
  const seats: GameSeat[] = []

  for (const p of game.game_players ?? []) {
    const name = getDisplayName(p.profiles)
    seats.push({
      typeTag: 'Human',
      partKey: `h:${p.player_id}`,
      partLabel: name,
      kind: 'human',
      score: p.score ?? 0,
      isWinner: game.winner === p.player_id,
    })
  }

  const cps = (game.computer_players ?? []) as ComputerSeat[]
  for (const cp of cps) {
    if (cp.id.startsWith('api-')) {
      // Strip "(on behalf of <human>)" so the same LLM groups together.
      const baseName = cp.name.replace(/\s*\(on behalf of .*\)$/, '').trim() || 'LLM'
      seats.push({
        typeTag: 'LLM',
        partKey: `a:${baseName.toLowerCase()}`,
        partLabel: baseName,
        kind: 'api',
        score: cp.score ?? 0,
        isWinner: game.winner === cp.id,
      })
    } else {
      const strategy = (cp.strategy ?? 'percentile') as Strategy
      const strength = cp.strength ?? 100
      const label = computerLabel(strategy, strength)
      seats.push({
        typeTag: `Computer (${label})`,
        partKey: `c:${strategy}:${strength}`,
        partLabel: `Computer (${label})`,
        kind: 'computer',
        score: cp.score ?? 0,
        isWinner: game.winner === cp.id,
        strategy,
        strength,
      })
    }
  }

  return seats
}

// Order tags so the matchup reads naturally: humans, then computers, then LLMs.
export function tagRank(tag: string): number {
  if (tag === 'Human') return 0
  if (tag.startsWith('Computer')) return 1
  return 2
}

function buildGroupLabel(tagCounts: Map<string, number>): string {
  const tags = [...tagCounts.keys()].sort((a, b) => tagRank(a) - tagRank(b) || a.localeCompare(b))
  // All-human games read best as "2 Humans", "3 Humans", etc.
  if (tags.length === 1 && tags[0] === 'Human') {
    const c = tagCounts.get('Human')!
    return `${c} Human${c > 1 ? 's' : ''}`
  }
  return tags
    .map(t => {
      const c = tagCounts.get(t)!
      if (t === 'Human') return `${c} Human${c > 1 ? 's' : ''}`
      return c > 1 ? `${c}× ${t}` : t
    })
    .join(' + ')
}

export interface GameClassification {
  /** Stable key for the game type (same across games of the same composition). */
  groupKey: string
  /** Human-readable composition, e.g. "Human + Computer (P97)" or "3 Humans". */
  groupLabel: string
  seats: GameSeat[]
}

/**
 * Classify a finished game by the multiset of its seat type tags. Returns null
 * for degenerate rows (fewer than two resolvable seats — abandoned/partial).
 */
export function classifyGame(game: ClassifiableGame): GameClassification | null {
  const seats = seatsForGame(game)
  if (seats.length < 2) return null

  const tagCounts = new Map<string, number>()
  for (const s of seats) tagCounts.set(s.typeTag, (tagCounts.get(s.typeTag) ?? 0) + 1)

  const groupKey = [...tagCounts.entries()]
    .sort((a, b) => tagRank(a[0]) - tagRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([t, c]) => `${t}×${c}`)
    .join('|')

  return { groupKey, groupLabel: buildGroupLabel(tagCounts), seats }
}
