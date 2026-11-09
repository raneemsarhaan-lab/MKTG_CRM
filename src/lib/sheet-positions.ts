/**
 * Sortable positions for a blank sheet's rows and columns (spec 013 R3).
 * Pure. A new row or column gets the midpoint of its neighbours, so nothing
 * else moves; when two neighbours get too close, the sheet is renumbered.
 */

export const STEP = 1
export const MIN_GAP = 1e-6

/** A position between two neighbours; null means "no neighbour on that side". */
export function between(before: number | null, after: number | null): number {
  if (before === null && after === null) return STEP
  if (before === null) return (after as number) - STEP
  if (after === null) return before + STEP
  return (before + after) / 2
}

/** `count` positions between two neighbours, evenly spaced, for a multi-row insert. */
export function betweenMany(before: number | null, after: number | null, count: number): number[] {
  if (count <= 0) return []
  if (before === null && after === null) return Array.from({ length: count }, (_, i) => (i + 1) * STEP)
  if (before === null) return Array.from({ length: count }, (_, i) => (after as number) - (count - i) * STEP)
  if (after === null) return Array.from({ length: count }, (_, i) => before + (i + 1) * STEP)
  const gap = (after - before) / (count + 1)
  return Array.from({ length: count }, (_, i) => before + gap * (i + 1))
}

/** Whether sorted positions have run out of room anywhere. */
export function needsRenumber(sorted: number[]): boolean {
  for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < MIN_GAP) return true
  return false
}

/** Fresh positions 1…n, in the same order. */
export function renumber<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position).map((x, i) => ({ ...x, position: (i + 1) * STEP }))
}

/** Ascending positions for a new sheet's rows or columns. */
export const initial = (n: number) => Array.from({ length: n }, (_, i) => (i + 1) * STEP)
