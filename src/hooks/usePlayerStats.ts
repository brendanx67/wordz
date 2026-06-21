import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { computeBoxStats, type BoxStats } from '@/lib/boxStats'
import { computerLabel, type Strategy } from '@/lib/_shared/computerStrategy'

// Player statistics, grouped by *game type* (the composition of seats at the
// board). Within each type we keep one score series per distinct participant so
// the page can render a head-to-head box plot — e.g. "me" vs "Computer (P97)".

export type ParticipantKind = 'human' | 'computer' | 'api'

export interface ParticipantSeries {
  /** Stable identity within the group (player_id, strategy:strength, or name). */
  key: string
  label: string
  kind: ParticipantKind
  /** Games of this type the participant appeared in. */
  games: number
  /** Games of this type the participant won. */
  wins: number
  stats: BoxStats
}

export interface GameTypeGroup {
  key: string
  /** Human-readable composition, e.g. "Human + Computer (P97)" or "3 Humans". */
  label: string
  gameCount: number
  participants: ParticipantSeries[]
}

export interface PlayerStatsData {
  groups: GameTypeGroup[]
  finishedGames: number
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

// One seat at the board, resolved to both a "type tag" (used to classify the
// game) and a "participant identity" (used to aggregate scores across games).
interface Seat {
  typeTag: string          // role in the matchup, e.g. "Human", "Computer (P97)"
  partKey: string          // who, across games: player_id / strategy:strength / name
  partLabel: string
  kind: ParticipantKind
  score: number
  isWinner: boolean
}

function seatsForGame(game: {
  winner: string | null
  computer_players: unknown
  game_players?: { player_id: string; score: number; profiles: unknown }[] | null
}): Seat[] {
  const seats: Seat[] = []

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
      })
    }
  }

  return seats
}

// Order tags so the matchup reads naturally: humans, then computers, then LLMs.
function tagRank(tag: string): number {
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

const KIND_RANK: Record<ParticipantKind, number> = { human: 0, computer: 1, api: 2 }

export function usePlayerStats() {
  return useQuery({
    queryKey: ['player-stats'],
    queryFn: async (): Promise<PlayerStatsData> => {
      const { data, error } = await supabase
        .from('games')
        .select('id, winner, computer_players, game_players(player_id, score, profiles(display_name))')
        .eq('status', 'finished')
      if (error) throw error
      const games = data ?? []

      // Accumulator per game-type group.
      interface GroupAcc {
        label: string
        gameCount: number
        parts: Map<string, { label: string; kind: ParticipantKind; scores: number[]; wins: number }>
      }
      const groups = new Map<string, GroupAcc>()

      for (const game of games) {
        const seats = seatsForGame(game)
        if (seats.length < 2) continue // skip degenerate/abandoned rows

        // Classify the game by its multiset of seat type tags.
        const tagCounts = new Map<string, number>()
        for (const s of seats) tagCounts.set(s.typeTag, (tagCounts.get(s.typeTag) ?? 0) + 1)
        const groupKey = [...tagCounts.entries()]
          .sort((a, b) => tagRank(a[0]) - tagRank(b[0]) || a[0].localeCompare(b[0]))
          .map(([t, c]) => `${t}×${c}`)
          .join('|')

        let acc = groups.get(groupKey)
        if (!acc) {
          acc = { label: buildGroupLabel(tagCounts), gameCount: 0, parts: new Map() }
          groups.set(groupKey, acc)
        }
        acc.gameCount++

        for (const s of seats) {
          let part = acc.parts.get(s.partKey)
          if (!part) {
            part = { label: s.partLabel, kind: s.kind, scores: [], wins: 0 }
            acc.parts.set(s.partKey, part)
          }
          part.scores.push(s.score)
          if (s.isWinner) part.wins++
        }
      }

      const result: GameTypeGroup[] = [...groups.entries()].map(([key, acc]) => ({
        key,
        label: acc.label,
        gameCount: acc.gameCount,
        participants: [...acc.parts.entries()]
          .map(([pk, p]) => ({
            key: pk,
            label: p.label,
            kind: p.kind,
            games: p.scores.length,
            wins: p.wins,
            stats: computeBoxStats(p.scores),
          }))
          .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.games - a.games || b.stats.mean - a.stats.mean),
      }))

      // Most-played game types first — that's where the data is richest.
      result.sort((a, b) => b.gameCount - a.gameCount || a.label.localeCompare(b.label))

      return { groups: result, finishedGames: games.length }
    },
    staleTime: 30_000,
  })
}
