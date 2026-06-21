// Pure box-and-whisker statistics for the player-statistics page. Kept free of
// React/Supabase so it's trivially unit-testable (see src/lib/scoring.ts for
// the same "pure functions live in lib/" convention).

export interface BoxStats {
  /** Number of observations. */
  n: number
  min: number
  max: number
  /** First quartile (25th percentile). */
  q1: number
  /** Second quartile (50th percentile). */
  median: number
  /** Third quartile (75th percentile). */
  q3: number
  mean: number
  /** Lowest observation within 1.5×IQR of Q1 (the lower whisker end). */
  whiskerLow: number
  /** Highest observation within 1.5×IQR of Q3 (the upper whisker end). */
  whiskerHigh: number
  /** Observations outside the 1.5×IQR fences, drawn as individual points. */
  outliers: number[]
  /** The input values, sorted ascending. */
  values: number[]
}

/**
 * Linear-interpolation quantile (the "type 7" method used by NumPy's default
 * and Excel's PERCENTILE.INC). `p` is in [0, 1]; `sortedAsc` must be sorted.
 */
export function quantile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length
  if (n === 0) return 0
  if (n === 1) return sortedAsc[0]
  const idx = (n - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sortedAsc[lo]
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (idx - lo)
}

/**
 * Compute Tukey box-plot statistics for a set of values. Whiskers extend to the
 * most extreme observation within 1.5×IQR of the box; anything past the fences
 * is reported as an outlier. Degenerate inputs (0 or 1 values) collapse to a
 * point, which the renderer draws as a thin marker.
 */
export function computeBoxStats(values: number[]): BoxStats {
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  if (n === 0) {
    return { n: 0, min: 0, max: 0, q1: 0, median: 0, q3: 0, mean: 0, whiskerLow: 0, whiskerHigh: 0, outliers: [], values: [] }
  }

  const q1 = quantile(sorted, 0.25)
  const median = quantile(sorted, 0.5)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  const lowFence = q1 - 1.5 * iqr
  const highFence = q3 + 1.5 * iqr

  const inRange = sorted.filter(v => v >= lowFence && v <= highFence)
  const whiskerLow = inRange.length ? inRange[0] : sorted[0]
  const whiskerHigh = inRange.length ? inRange[inRange.length - 1] : sorted[n - 1]
  const outliers = sorted.filter(v => v < lowFence || v > highFence)
  const mean = sorted.reduce((s, v) => s + v, 0) / n

  return { n, min: sorted[0], max: sorted[n - 1], q1, median, q3, mean, whiskerLow, whiskerHigh, outliers, values: sorted }
}
