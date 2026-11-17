/**
 * Selection in a sheet (spec 013 FR-010–FR-012). Pure: rows and columns are
 * indexes into what the grid shows; the grid maps them to its own keys.
 *
 * A selection is an anchor (where it started, the active cell) and a focus
 * (where it ends). Shift moves the focus; a plain move collapses both.
 */

export interface Cell { r: number; c: number }
export interface Selection { anchor: Cell; focus: Cell }
export interface Rect { r0: number; c0: number; r1: number; c1: number }

export const at = (r: number, c: number): Selection => ({ anchor: { r, c }, focus: { r, c } })

/** The selection as a normalised rectangle. */
export function rect(s: Selection): Rect {
  return {
    r0: Math.min(s.anchor.r, s.focus.r), c0: Math.min(s.anchor.c, s.focus.c),
    r1: Math.max(s.anchor.r, s.focus.r), c1: Math.max(s.anchor.c, s.focus.c),
  }
}

export const size = (s: Selection | Rect): number => {
  const q = 'anchor' in s ? rect(s) : s
  return (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1)
}

export const contains = (q: Rect, r: number, c: number) => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** Shift+click or Shift+arrow: keep the anchor, move the focus. */
export function extend(s: Selection, to: Cell, rows: number, cols: number): Selection {
  return { anchor: s.anchor, focus: { r: clamp(to.r, 0, rows - 1), c: clamp(to.c, 0, cols - 1) } }
}

/** A whole row, or rows from one to another (a row-number click, with Shift). */
export function rowRange(from: number, to: number, cols: number): Selection {
  return { anchor: { r: from, c: 0 }, focus: { r: to, c: Math.max(0, cols - 1) } }
}
/** A whole column, or columns from one to another (a heading click, with Shift). */
export function colRange(from: number, to: number, rows: number): Selection {
  return { anchor: { r: 0, c: from }, focus: { r: Math.max(0, rows - 1), c: to } }
}
export const all = (rows: number, cols: number): Selection => ({ anchor: { r: 0, c: 0 }, focus: { r: Math.max(0, rows - 1), c: Math.max(0, cols - 1) } })

export type Dir = 'up' | 'down' | 'left' | 'right'
const STEP: Record<Dir, Cell> = { up: { r: -1, c: 0 }, down: { r: 1, c: 0 }, left: { r: 0, c: -1 }, right: { r: 0, c: 1 } }

/**
 * Ctrl/Cmd+arrow (FR-004): the edge of the data, as in Excel. From a filled
 * cell whose neighbour is filled, run to the last filled cell before a gap;
 * otherwise jump to the next filled cell, or to the sheet's edge.
 */
export function edge(from: Cell, dir: Dir, rows: number, cols: number, filled: (r: number, c: number) => boolean): Cell {
  const d = STEP[dir]
  const inside = (p: Cell) => p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols
  const next = (p: Cell): Cell => ({ r: p.r + d.r, c: p.c + d.c })
  let p = from
  const n = next(p)
  if (!inside(n)) return p
  if (filled(p.r, p.c) && filled(n.r, n.c)) {
    while (inside(next(p)) && filled(next(p).r, next(p).c)) p = next(p)
    return p
  }
  p = n
  while (inside(p) && !filled(p.r, p.c)) {
    if (!inside(next(p))) return p
    p = next(p)
  }
  return p
}

/** Move by one cell (arrows), clamped to the sheet. */
export function step(from: Cell, dir: Dir, rows: number, cols: number): Cell {
  const d = STEP[dir]
  return { r: clamp(from.r + d.r, 0, rows - 1), c: clamp(from.c + d.c, 0, cols - 1) }
}

/** Every cell of a rectangle, row by row. */
export function cells(q: Rect): Cell[] {
  const out: Cell[] = []
  for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) out.push({ r, c })
  return out
}

/** A column's letters, as in Excel: 0 → A, 25 → Z, 26 → AA. */
export function colLetters(i: number): string {
  let s = ''
  let n = i + 1
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}
/** "B3", for screen readers and the toolbar. */
export const cellName = (r: number, c: number) => `${colLetters(c)}${r + 1}`

// ── spec 017: several areas (Ctrl+click) ─────────────────────────────────────

/** At most this many areas (FR-017). */
export const MAX_AREAS = 100

/** Take a block out of every area (Ctrl+click on selected cells): each area splits into at most 4 pieces. */
export function subtract(areas: Rect[], cut: Rect): Rect[] {
  const out: Rect[] = []
  for (const q of areas) {
    if (cut.r1 < q.r0 || cut.r0 > q.r1 || cut.c1 < q.c0 || cut.c0 > q.c1) { out.push(q); continue }
    if (q.r0 < cut.r0) out.push({ ...q, r1: cut.r0 - 1 })
    if (q.r1 > cut.r1) out.push({ ...q, r0: cut.r1 + 1 })
    const r0 = Math.max(q.r0, cut.r0), r1 = Math.min(q.r1, cut.r1)
    if (q.c0 < cut.c0) out.push({ r0, r1, c0: q.c0, c1: cut.c0 - 1 })
    if (q.c1 > cut.c1) out.push({ r0, r1, c0: cut.c1 + 1, c1: q.c1 })
  }
  return out
}

/** Every selected cell once, in reading order (overlapping areas count once). */
export function unionCells(areas: Rect[]): Cell[] {
  const seen = new Set<number>(), out: Cell[] = []
  const W = 1 + Math.max(0, ...areas.map(q => q.c1))
  for (const q of areas) for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) {
    const k = r * W + c
    if (!seen.has(k)) { seen.add(k); out.push({ r, c }) }
  }
  return out.sort((a, b) => a.r - b.r || a.c - b.c)
}

/** How many cells the areas cover, overlaps once. */
export const unionSize = (areas: Rect[]) => unionCells(areas).length

/**
 * How several areas copy as one block (FR-011), as in Excel: areas over the
 * same rows sit side by side (in column order), areas over the same columns
 * stack (in row order); anything else can't be copied. One area is itself.
 */
export function copyLayout(areas: Rect[]): { kind: 'one' | 'rows' | 'cols'; order: Rect[] } | null {
  if (areas.length <= 1) return { kind: 'one', order: areas }
  const [a] = areas
  if (areas.every(q => q.r0 === a.r0 && q.r1 === a.r1)) {
    const order = [...areas].sort((x, y) => x.c0 - y.c0)
    if (order.every((q, i) => i === 0 || q.c0 > order[i - 1].c1)) return { kind: 'rows', order }
  }
  if (areas.every(q => q.c0 === a.c0 && q.c1 === a.c1)) {
    const order = [...areas].sort((x, y) => x.r0 - y.r0)
    if (order.every((q, i) => i === 0 || q.r0 > order[i - 1].r1)) return { kind: 'cols', order }
  }
  return null
}

/** Every area is whole rows (or whole columns): row (column) commands take them all. */
export const wholeRows = (areas: Rect[], cols: number) => areas.length > 0 && areas.every(q => q.c0 === 0 && q.c1 >= cols - 1)
export const wholeCols = (areas: Rect[], rows: number) => areas.length > 0 && areas.every(q => q.r0 === 0 && q.r1 >= rows - 1)

/** The distinct rows (or columns) the areas touch, ascending. */
export function areaRows(areas: Rect[]): number[] {
  const s = new Set<number>()
  for (const q of areas) for (let r = q.r0; r <= q.r1; r++) s.add(r)
  return [...s].sort((a, b) => a - b)
}
export function areaCols(areas: Rect[]): number[] {
  const s = new Set<number>()
  for (const q of areas) for (let c = q.c0; c <= q.c1; c++) s.add(c)
  return [...s].sort((a, b) => a - b)
}

/** "B2", "B2:D4", "C:C", "3:5": an area as Excel names it. */
export function areaLabel(q: Rect, rows: number, cols: number): string {
  const allRows = q.r0 === 0 && q.r1 >= rows - 1, allCols = q.c0 === 0 && q.c1 >= cols - 1
  if (allRows && !allCols) return `${colLetters(q.c0)}:${colLetters(q.c1)}`
  if (allCols && !allRows) return `${q.r0 + 1}:${q.r1 + 1}`
  if (q.r0 === q.r1 && q.c0 === q.c1) return cellName(q.r0, q.c0)
  return `${cellName(q.r0, q.c0)}:${cellName(q.r1, q.c1)}`
}

/** "B2, E5, B8:D9" and how many more beyond the first three (FR-008). */
export function selectionLabel(areas: Rect[], rows: number, cols: number, show = 3): { text: string; more: number } {
  const names = areas.map(q => areaLabel(q, rows, cols))
  return { text: names.slice(0, show).join(', '), more: Math.max(0, names.length - show) }
}

/**
 * Spec 020 (Go To Special, research R1): cells picked one by one, folded into
 * as few rectangles as possible (runs along each row, then runs of equal runs
 * down the rows). Null when it would take more than `max` areas.
 */
export function foldCells(list: Cell[], max = MAX_AREAS): Rect[] | null {
  if (!list.length) return []
  const byRow = new Map<number, number[]>()
  for (const { r, c } of list) { const a = byRow.get(r); if (a) a.push(c); else byRow.set(r, [c]) }
  // Runs per row: [c0, c1].
  const runs: { r: number; c0: number; c1: number }[] = []
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const cs = [...new Set(byRow.get(r)!)].sort((a, b) => a - b)
    let s = cs[0], p = cs[0]
    for (let i = 1; i <= cs.length; i++) {
      if (i < cs.length && cs[i] === p + 1) { p = cs[i]; continue }
      runs.push({ r, c0: s, c1: p })
      if (i < cs.length) { s = cs[i]; p = cs[i] }
    }
  }
  // Stack a run onto an open rectangle with the same columns that ended on the row above.
  const open = new Map<string, Rect>()
  const done: Rect[] = []
  for (const run of runs) {
    const k = `${run.c0}:${run.c1}`, q = open.get(k)
    if (q && q.r1 === run.r - 1) { q.r1 = run.r; continue }
    if (q) done.push(q)
    open.set(k, { r0: run.r, c0: run.c0, r1: run.r, c1: run.c1 })
  }
  const out = [...done, ...open.values()].sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0)
  return out.length > max ? null : out
}

/** Go To Special's choices this sheet can answer (the others need formulas or objects). */
export type GoSpecial = 'notes' | 'constants' | 'blanks' | 'region' | 'lastCell' | 'visible' | 'conditional' | 'validation' | 'validationSame' | 'rowDiffs' | 'colDiffs'
