import { describe, expect, test } from 'bun:test'
import { classifyGame, seatsForGame, seatToSpec } from './gameType.ts'

// Minimal builders matching the shape classifyGame reads off a finished row.
const human = (id: string, score: number, name: string) => ({ player_id: id, score, profiles: { display_name: name } })
const cpu = (id: string, strategy: string, strength: number, score: number) =>
  ({ id, name: `${id} (x)`, strategy, strength, score })
const api = (id: string, name: string, score: number) => ({ id, name, score })

describe('classifyGame', () => {
  test('human vs percentile computer', () => {
    const c = classifyGame({
      winner: 'u1',
      computer_players: [cpu('computer-1', 'percentile', 97, 298)],
      game_players: [human('u1', 308, 'Brendan')],
    })!
    expect(c.groupKey).toBe('Human×1|Computer (P97)×1')
    expect(c.groupLabel).toBe('Human + Computer (P97)')
    expect(c.seats).toHaveLength(2)

    const h = c.seats.find(s => s.kind === 'human')!
    expect(h.partKey).toBe('h:u1')
    expect(h.partLabel).toBe('Brendan')
    expect(h.isWinner).toBe(true)

    const comp = c.seats.find(s => s.kind === 'computer')!
    expect(comp.partKey).toBe('c:percentile:97')
    expect(comp.strategy).toBe('percentile')
    expect(comp.strength).toBe(97)
    expect(comp.isWinner).toBe(false)
  })

  test('two humans collapse to "2 Humans"', () => {
    const c = classifyGame({
      winner: 'u1',
      computer_players: [],
      game_players: [human('u1', 300, 'A'), human('u2', 250, 'B')],
    })!
    expect(c.groupKey).toBe('Human×2')
    expect(c.groupLabel).toBe('2 Humans')
  })

  test('all-computer hard mirror', () => {
    const c = classifyGame({
      winner: 'computer-1',
      computer_players: [cpu('computer-1', 'percentile', 100, 349), cpu('computer-2', 'percentile', 100, 320)],
      game_players: [],
    })!
    expect(c.groupKey).toBe('Computer (Hard)×2')
    expect(c.groupLabel).toBe('2× Computer (Hard)')
    expect(c.seats.every(s => s.partKey === 'c:percentile:100')).toBe(true)
  })

  test('LLM seat strips "(on behalf of ...)" and groups by base name', () => {
    const c = classifyGame({
      winner: 'api-1',
      computer_players: [api('api-1', 'Claude (on behalf of Brendan)', 280)],
      game_players: [human('u1', 300, 'Brendan')],
    })!
    expect(c.groupKey).toBe('Human×1|LLM×1')
    const llm = c.seats.find(s => s.kind === 'api')!
    expect(llm.partKey).toBe('a:claude')
    expect(llm.partLabel).toBe('Claude')
  })

  test('legacy computer without strategy/strength defaults to Hard (percentile 100)', () => {
    const c = classifyGame({
      winner: 'u1',
      computer_players: [{ id: 'computer-1', name: 'Computer 1', score: 100 }],
      game_players: [human('u1', 300, 'A')],
    })!
    const comp = c.seats.find(s => s.kind === 'computer')!
    expect(comp.typeTag).toBe('Computer (Hard)')
    expect(comp.partKey).toBe('c:percentile:100')
  })

  test('profiles returned as an array is handled', () => {
    const seats = seatsForGame({
      winner: null,
      computer_players: [],
      game_players: [{ player_id: 'u1', score: 5, profiles: [{ display_name: 'Arr' }] }],
    })
    expect(seats[0].partLabel).toBe('Arr')
  })

  test('fewer than two seats is not a classifiable game', () => {
    expect(classifyGame({ winner: 'u1', computer_players: [], game_players: [human('u1', 0, 'A')] })).toBeNull()
    expect(classifyGame({ winner: null, computer_players: [], game_players: [] })).toBeNull()
  })
})

describe('seatToSpec', () => {
  test('computer keeps strategy + strength; others carry only kind', () => {
    const c = classifyGame({
      winner: 'u1',
      computer_players: [cpu('computer-1', 'percentile', 95, 200)],
      game_players: [human('u1', 300, 'A')],
    })!
    const specs = c.seats.map(seatToSpec)
    expect(specs).toContainEqual({ kind: 'human' })
    expect(specs).toContainEqual({ kind: 'computer', strategy: 'percentile', strength: 95 })
  })
})
