import { describe, expect, test } from 'bun:test'
import { configFromComposition } from './gameConfigFromType.ts'
import type { SeatSpec } from './gameType.ts'

describe('configFromComposition', () => {
  test('human + computer becomes [me, computer, none, none]', () => {
    const specs: SeatSpec[] = [{ kind: 'human' }, { kind: 'computer', strategy: 'percentile', strength: 97 }]
    const config = configFromComposition(specs)
    expect(config.players.map(p => p.type)).toEqual(['me', 'computer', 'none', 'none'])
    const comp = config.players[1]
    expect(comp.computerStrategy).toBe('percentile')
    expect(comp.computerStrength).toBe(97)
    expect(comp.label).toBe('Computer (P97)')
    expect(config.computerDelay).toBe(0)
    expect(config.wordFinderEnabled).toBe(false)
  })

  test('first human is "me", extra humans are open seats', () => {
    const specs: SeatSpec[] = [{ kind: 'human' }, { kind: 'human' }, { kind: 'human' }]
    const config = configFromComposition(specs)
    expect(config.players.map(p => p.type)).toEqual(['me', 'human', 'human', 'none'])
  })

  test('all-computer type has no "me" seat', () => {
    const specs: SeatSpec[] = [
      { kind: 'computer', strategy: 'percentile', strength: 100 },
      { kind: 'computer', strategy: 'percentile', strength: 100 },
    ]
    const config = configFromComposition(specs)
    expect(config.players.map(p => p.type)).toEqual(['computer', 'computer', 'none', 'none'])
    expect(config.players.some(p => p.type === 'me')).toBe(false)
  })

  test('LLM seat defaults to a Claude/master API slot', () => {
    const specs: SeatSpec[] = [{ kind: 'human' }, { kind: 'api' }]
    const config = configFromComposition(specs)
    const apiSlot = config.players[1]
    expect(apiSlot.type).toBe('api-player')
    expect(apiSlot.apiPlayerName).toBe('Claude')
    expect(apiSlot.strategyLevel).toBe('master')
  })

  test('computer spec missing strategy/strength defaults to percentile 100', () => {
    const config = configFromComposition([{ kind: 'human' }, { kind: 'computer' }])
    const comp = config.players[1]
    expect(comp.computerStrategy).toBe('percentile')
    expect(comp.computerStrength).toBe(100)
  })

  test('always padded to four slots', () => {
    expect(configFromComposition([{ kind: 'human' }, { kind: 'human' }]).players).toHaveLength(4)
  })
})
