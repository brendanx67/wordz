import { describe, expect, test } from 'bun:test'
import {
  selectPercentile,
  selectDynamic,
  countPlaysByPlayer,
  computerLabel,
  computerDescription,
  PRESETS,
  DYNAMIC_DEFAULT_AVG_MOVE,
} from './computerStrategy.ts'

const m = (totalScore: number) => ({ totalScore })

describe('selectPercentile', () => {
  test('strength=100 picks the top move', () => {
    const moves = [m(10), m(50), m(30)]
    expect(selectPercentile(moves, 100).totalScore).toBe(50)
  })

  test('strength=0 picks the worst move', () => {
    const moves = [m(10), m(50), m(30)]
    expect(selectPercentile(moves, 0).totalScore).toBe(10)
  })

  test('strength=50 picks the middle move', () => {
    const moves = [m(10), m(20), m(30), m(40), m(50)]
    expect(selectPercentile(moves, 50).totalScore).toBe(30)
  })

  test('strength=80 picks the second-best of five', () => {
    // floor((1 - 0.8) * 4) = floor(0.8) = 0 → top, then for 5: idx=floor(0.8)=0
    // Use 11 elements to test 80% cleanly: floor(0.2 * 10) = 2 → 9th-from-top
    const moves = Array.from({ length: 11 }, (_, i) => m(100 - i * 10))
    // sorted descending: 100, 90, ..., 0
    // idx = floor(0.2 * 10) = 2 → 80
    expect(selectPercentile(moves, 80).totalScore).toBe(80)
  })

  test('single-move list works at any strength', () => {
    const moves = [m(42)]
    expect(selectPercentile(moves, 0).totalScore).toBe(42)
    expect(selectPercentile(moves, 50).totalScore).toBe(42)
    expect(selectPercentile(moves, 100).totalScore).toBe(42)
  })

  test('strength is clamped to [0, 100]', () => {
    const moves = [m(10), m(50), m(30)]
    expect(selectPercentile(moves, 200).totalScore).toBe(50)
    expect(selectPercentile(moves, -50).totalScore).toBe(10)
  })

  test('throws on empty list', () => {
    expect(() => selectPercentile([], 50)).toThrow()
  })
})

describe('selectDynamic', () => {
  const moves = Array.from({ length: 21 }, (_, i) => m(i * 5)) // 0, 5, 10, ..., 100

  test('strength=100 with gap=0 targets one leader avg-move', () => {
    // leader avg = 30, gap = 0, target = 0 + 1.0 * 30 = 30 → closest is 30
    const ctx = { myScore: 90, leaderScore: 90, leaderMoveCount: 3 }
    expect(selectDynamic(moves, 100, ctx).totalScore).toBe(30)
  })

  test('strength=100 behind by gap=20 targets gap + avg', () => {
    // leader avg = 30, gap = 20, target = 50
    const ctx = { myScore: 70, leaderScore: 90, leaderMoveCount: 3 }
    expect(selectDynamic(moves, 100, ctx).totalScore).toBe(50)
  })

  test('strength=80 behind by gap=20 targets gap + 0.8*avg', () => {
    // target = 20 + 0.8 * 30 = 44 → closest of 40 or 45 (both dist 4 and 1)
    const ctx = { myScore: 70, leaderScore: 90, leaderMoveCount: 3 }
    // 44 is closer to 45 than 40, so picks 45
    expect(selectDynamic(moves, 80, ctx).totalScore).toBe(45)
  })

  test('strength=100 ahead falls back to floor', () => {
    // gap = -30, target = -30 + 30 = 0 → but median of moves(0..100 step 5)
    // is 50 → floor = max(4, floor(50*0.3)) = 15 → effective = max(15, 0) = 15
    const ctx = { myScore: 120, leaderScore: 90, leaderMoveCount: 3 }
    expect(selectDynamic(moves, 100, ctx).totalScore).toBe(15)
  })

  test('strength=100 way ahead still respects floor (never plays trivial)', () => {
    // gap = -200, target = -170 → floor wins
    const ctx = { myScore: 290, leaderScore: 90, leaderMoveCount: 3 }
    expect(selectDynamic(moves, 100, ctx).totalScore).toBe(15)
  })

  test('uses default avg-move when leader has not played yet', () => {
    // leaderMoveCount=0 → avg = DYNAMIC_DEFAULT_AVG_MOVE = 20, target = 0 + 20 = 20
    const ctx = { myScore: 0, leaderScore: 0, leaderMoveCount: 0 }
    expect(selectDynamic(moves, 100, ctx).totalScore).toBe(20)
    // Sanity: docs the constant
    expect(DYNAMIC_DEFAULT_AVG_MOVE).toBe(20)
  })

  test('throws on empty list', () => {
    const ctx = { myScore: 0, leaderScore: 0, leaderMoveCount: 0 }
    expect(() => selectDynamic([], 100, ctx)).toThrow()
  })
})

describe('computerLabel', () => {
  test('preset values map to familiar names', () => {
    expect(computerLabel('percentile', 50)).toBe('Easy')
    expect(computerLabel('percentile', 80)).toBe('Medium')
    expect(computerLabel('percentile', 100)).toBe('Hard')
    expect(computerLabel('dynamic', 100)).toBe('Competitive')
  })

  test('off-preset values use family prefix (P=percentile, C=competitive)', () => {
    expect(computerLabel('percentile', 75)).toBe('P75')
    expect(computerLabel('percentile', 90)).toBe('P90')
    expect(computerLabel('percentile', 98)).toBe('P98')
    expect(computerLabel('dynamic', 80)).toBe('C80')
    expect(computerLabel('dynamic', 60)).toBe('C60')
    expect(computerLabel('dynamic', 90)).toBe('C90')
  })

  test('PRESETS covers all four named options', () => {
    expect(PRESETS.map(p => p.name)).toEqual(['Easy', 'Medium', 'Hard', 'Competitive'])
  })
})

describe('computerDescription', () => {
  test('returns family-aware sentences for presets and custom', () => {
    expect(computerDescription('percentile', 100)).toMatch(/Hard.*highest-scoring/)
    expect(computerDescription('percentile', 80)).toMatch(/Medium.*80th percentile/)
    expect(computerDescription('percentile', 50)).toMatch(/Easy.*median/)
    expect(computerDescription('percentile', 75)).toMatch(/Custom.*75th percentile/)
    expect(computerDescription('dynamic', 100)).toMatch(/Competitive.*leading opponent/)
    expect(computerDescription('dynamic', 80)).toMatch(/Custom.*dynamic 80.*20% behind/)
  })
})

describe('countPlaysByPlayer', () => {
  test('counts only play moves, not pass/exchange', () => {
    const history = [
      { player_id: 'a', type: 'play' },
      { player_id: 'b', type: 'play' },
      { player_id: 'a', type: 'pass' },
      { player_id: 'a', type: 'play' },
      { player_id: 'b', type: 'exchange' },
    ]
    expect(countPlaysByPlayer(history)).toEqual({ a: 2, b: 1 })
  })

  test('returns empty object for empty history', () => {
    expect(countPlaysByPlayer([])).toEqual({})
  })
})
