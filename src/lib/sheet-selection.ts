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
