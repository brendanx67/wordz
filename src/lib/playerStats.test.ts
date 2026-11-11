import { describe, expect, test } from 'bun:test'
import { ALL_TIME, STATS_WINDOWS, buildPlayerStats, type StatsGameRow, type StatsWindow } from './playerStats.ts'

const NOW = Date.parse('2026-11-11T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString()

// Human "u1" vs a P98 computer. `won` decides who takes the game.
const vsComputer = (id: string, finished: string, won: boolean): StatsGameRow => ({
  id,
  updated_at: finished,
  winner: won ? 'u1' : 'computer-1',
  computer_players: [{ id: 'computer-1', name: 'Computer 1 (P98)', strategy: 'percentile', strength: 98, score: won ? 300 : 400 }],
  game_players: [{ player_id: 'u1', score: won ? 400 : 300, profiles: { display_name: 'Brendan' } }],
})

// An all-computer simulation, as "More Games" produces in batches.
const simulation = (id: string, finished: string): StatsGameRow => ({
  id,
  updated_at: finished,
  winner: 'computer-1',
  computer_players: [
    { id: 'computer-1', name: 'Computer 1 (Hard)', strategy: 'percentile', strength: 100, score: 420 },
    { id: 'computer-2', name: 'Computer 2 (Hard)', strategy: 'percentile', strength: 100, score: 380 },
  ],
  game_players: [],
})

const windowById = (id: string): StatsWindow => STATS_WINDOWS.find(w => w.id === id)!
const human = (data: ReturnType<typeof buildPlayerStats>, groupKey: string) =>
  data.groups.find(g => g.key === groupKey)!.participants.find(p => p.kind === 'human')!

const VS_P98 = 'Human×1|Computer (P98)×1'
const SIM = 'Computer (Hard)×2'

describe('buildPlayerStats', () => {
  test('all time counts every game', () => {
    const games = [vsComputer('a', daysAgo(1), true), vsComputer('b', daysAgo(200), false), simulation('s', daysAgo(5))]
    const data = buildPlayerStats(games, ALL_TIME, NOW)
    expect(data.finishedGames).toBe(3)
    expect(data.totalFinishedGames).toBe(3)
    expect(human(data, VS_P98).games).toBe(2)
    expect(human(data, VS_P98).wins).toBe(1)
  })

  test('a games window keeps the newest N of each type', () => {
    // 60 older losses followed by 50 recent wins against the same opponent.
    const games = [
      ...Array.from({ length: 60 }, (_, i) => vsComputer(`old-${i}`, daysAgo(100 + i), false)),
      ...Array.from({ length: 50 }, (_, i) => vsComputer(`new-${i}`, daysAgo(i), true)),
    ]
    const all = human(buildPlayerStats(games, ALL_TIME, NOW), VS_P98)
    expect(all.games).toBe(110)
    expect(all.wins).toBe(50)

    const last50 = human(buildPlayerStats(games, windowById('g50'), NOW), VS_P98)
    expect(last50.games).toBe(50)
    expect(last50.wins).toBe(50)

    const last100 = human(buildPlayerStats(games, windowById('g100'), NOW), VS_P98)
    expect(last100.games).toBe(100)
    expect(last100.wins).toBe(50)
  })

  test('a batch of simulations does not push human games out of a games window', () => {
    const games = [
      ...Array.from({ length: 10 }, (_, i) => vsComputer(`h-${i}`, daysAgo(30 + i), true)),
      ...Array.from({ length: 200 }, (_, i) => simulation(`s-${i}`, daysAgo(i / 100))),
    ]
    const data = buildPlayerStats(games, windowById('g50'), NOW)
    expect(data.groups.find(g => g.key === SIM)!.gameCount).toBe(50)
    expect(human(data, VS_P98).games).toBe(10)
    expect(data.finishedGames).toBe(60)
    expect(data.totalFinishedGames).toBe(210)
  })

  test('a days window keeps games finished since the cutoff and drops empty types', () => {
    const games = [
      vsComputer('recent-win', daysAgo(3), true),
      vsComputer('recent-loss', daysAgo(29), false),
      vsComputer('old-loss', daysAgo(31), false),
      simulation('old-sim', daysAgo(45)),
    ]
    const d30 = buildPlayerStats(games, windowById('d30'), NOW)
    expect(d30.groups.map(g => g.key)).toEqual([VS_P98])
    expect(human(d30, VS_P98).games).toBe(2)
    expect(human(d30, VS_P98).wins).toBe(1)

    const d60 = buildPlayerStats(games, windowById('d60'), NOW)
    expect(d60.finishedGames).toBe(4)
  })

  test('the drill-down list is newest first whatever the input order', () => {
    const games = [vsComputer('mid', daysAgo(5), true), vsComputer('newest', daysAgo(1), true), vsComputer('oldest', daysAgo(9), false)]
    const group = buildPlayerStats(games, ALL_TIME, NOW).groups[0]
    expect(group.games.map(g => g.gameId)).toEqual(['newest', 'mid', 'oldest'])
    expect(group.meanTotalScore).toBe(700)
    expect(group.maxTotalScore).toBe(700)
  })

  test('no games in the window yields no groups', () => {
    const data = buildPlayerStats([vsComputer('old', daysAgo(120), true)], windowById('d90'), NOW)
    expect(data.groups).toEqual([])
    expect(data.finishedGames).toBe(0)
    expect(data.totalFinishedGames).toBe(1)
  })
})
