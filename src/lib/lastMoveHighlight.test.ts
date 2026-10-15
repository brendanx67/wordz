import { describe, expect, test } from 'bun:test'
import { newestPlayTiles } from './lastMoveHighlight.ts'

const play = (...cols: number[]) => ({ type: 'play', tiles: cols.map(col => ({ row: 7, col })) })
const pass = { type: 'pass' }
const penalty = { type: 'endgame_penalty' }
const bonus = { type: 'endgame_bonus' }

describe('newestPlayTiles', () => {
  test('highlights a single new play', () => {
    expect(newestPlayTiles([play(7, 8), play(9)], 1)).toEqual([{ row: 7, col: 9 }])
  })

  test('game-ending play followed by endgame entries highlights that play', () => {
    const history = [play(7, 8), play(3, 4), penalty, bonus]
    expect(newestPlayTiles(history, 1)).toEqual([{ row: 7, col: 3 }, { row: 7, col: 4 }])
  })

  test('two plays in one update highlights the newer', () => {
    expect(newestPlayTiles([play(1), play(2), play(3)], 1)).toEqual([{ row: 7, col: 3 }])
  })

  test('does not reach back past the previous count', () => {
    expect(newestPlayTiles([play(1), pass], 1)).toBeUndefined()
  })

  test('play without tiles is skipped', () => {
    expect(newestPlayTiles([{ type: 'play' }], 0)).toBeUndefined()
  })

  test('undefined history', () => {
    expect(newestPlayTiles(undefined, 0)).toBeUndefined()
  })
})
