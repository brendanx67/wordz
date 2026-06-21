import { describe, expect, test } from 'bun:test'
import { quantile, computeBoxStats } from './boxStats.ts'

describe('quantile', () => {
  test('empty list is 0, single value is itself', () => {
    expect(quantile([], 0.5)).toBe(0)
    expect(quantile([42], 0.25)).toBe(42)
    expect(quantile([42], 1)).toBe(42)
  })

  test('exact quartiles on an evenly spaced set', () => {
    const s = [10, 20, 30, 40, 50]
    expect(quantile(s, 0.25)).toBe(20)
    expect(quantile(s, 0.5)).toBe(30)
    expect(quantile(s, 0.75)).toBe(40)
  })

  test('linear interpolation between points (type-7)', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5)
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75)
  })
})

describe('computeBoxStats', () => {
  test('empty input collapses to zeros', () => {
    const b = computeBoxStats([])
    expect(b.n).toBe(0)
    expect(b.median).toBe(0)
    expect(b.outliers).toEqual([])
    expect(b.values).toEqual([])
  })

  test('no-outlier set: whiskers reach the extremes', () => {
    const b = computeBoxStats([30, 10, 50, 20, 40]) // unsorted on purpose
    expect(b.n).toBe(5)
    expect(b.min).toBe(10)
    expect(b.max).toBe(50)
    expect(b.q1).toBe(20)
    expect(b.median).toBe(30)
    expect(b.q3).toBe(40)
    expect(b.mean).toBe(30)
    expect(b.whiskerLow).toBe(10)
    expect(b.whiskerHigh).toBe(50)
    expect(b.outliers).toEqual([])
    // values are returned sorted ascending
    expect(b.values).toEqual([10, 20, 30, 40, 50])
  })

  test('high outlier sits past the 1.5xIQR fence; whisker stops at the last in-range point', () => {
    const b = computeBoxStats([10, 11, 12, 13, 14, 15, 100])
    expect(b.q1).toBe(11.5)
    expect(b.median).toBe(13)
    expect(b.q3).toBe(14.5)
    // IQR=3 -> high fence = 14.5 + 4.5 = 19; 100 is beyond it
    expect(b.whiskerHigh).toBe(15)
    expect(b.whiskerLow).toBe(10)
    expect(b.outliers).toEqual([100])
    expect(b.mean).toBe(175 / 7)
  })
})
