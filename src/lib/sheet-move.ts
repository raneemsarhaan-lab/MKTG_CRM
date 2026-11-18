/**
 * Moving and copying cells with the mouse (spec 020 tips 13, 107–111;
 * research R14). Pure.
 *
 * A drag's result is planned as "which cell's content ends up where": each
 * entry says a destination cell now holds what a source cell held (or is
 * emptied). The sheet then moves values, formats and comments along it, as
 * one undo step.
 *
 * - **move / copy:** the block lands on the target; a move empties the source
 *   cells the target doesn't cover.
 * - **insert (Shift):** the cells at the target shift down (or right) to make
 *   room, in the target's columns (or rows) only; a move then closes the gap
 *   it left, as Excel does.
 */
export interface MovePt { r: number; c: number }
export interface MoveRect { r0: number; c0: number; r1: number; c1: number }
export type MoveKind = 'move' | 'copy'
export type Shift = 'down' | 'right' | null
export interface MovePlan {
  /** Each changed cell: what it holds now (null: emptied). */
  cells: { to: MovePt; from: MovePt | null }[]
  /** How many rows and columns the sheet needs afterwards. */
  rows: number
  cols: number
}

const key = (r: number, c: number) => `${r},${c}`

/**
 * The plan for a block `src` dropped with its top-left corner at `dst`, on a
 * sheet of `rows` × `cols` (the sheet grows if the result reaches past it).
 */
export function planMove(src: MoveRect, dst: MovePt, kind: MoveKind, shift: Shift, rows: number, cols: number): MovePlan {
  const h = src.r1 - src.r0 + 1, w = src.c1 - src.c0 + 1
  // The grid as "where each cell's content came from"; untouched cells are themselves.
  const V = new Map<string, MovePt | null>()
  const get = (r: number, c: number): MovePt | null => (V.has(key(r, c)) ? V.get(key(r, c))! : { r, c })
  const set = (r: number, c: number, v: MovePt | null) => V.set(key(r, c), v)
  let maxR = rows, maxC = cols
  const block = (i: number, j: number): MovePt => ({ r: src.r0 + i, c: src.c0 + j })

  if (!shift) {
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) set(dst.r + i, dst.c + j, block(i, j))
    if (kind === 'move') {
      for (let r = src.r0; r <= src.r1; r++) for (let c = src.c0; c <= src.c1; c++) {
        const inDst = r >= dst.r && r < dst.r + h && c >= dst.c && c < dst.c + w
        if (!inDst) set(r, c, null)
      }
    }
    maxR = Math.max(maxR, dst.r + h); maxC = Math.max(maxC, dst.c + w)
  } else if (shift === 'down') {
    // Make room: in the target's columns, everything from the target row down moves h rows lower.
    const last = maxR - 1
    for (let j = 0; j < w; j++) {
      const c = dst.c + j
      for (let r = last; r >= dst.r; r--) set(r + h, c, get(r, c))
      for (let i = 0; i < h; i++) set(dst.r + i, c, block(i, j))
    }
    maxR += h; maxC = Math.max(maxC, dst.c + w)
    if (kind === 'move') {
      // Close the gap the block left: in its columns, the cells under it move up h rows.
      for (let j = 0; j < w; j++) {
        const c = src.c0 + j
        const shifted = c >= dst.c && c < dst.c + w && src.r0 >= dst.r
        const top = src.r0 + (shifted ? h : 0)
        for (let r = top; r < maxR; r++) set(r, c, r + h < maxR ? get(r + h, c) : null)
      }
    }
  } else {
    const last = maxC - 1
    for (let i = 0; i < h; i++) {
      const r = dst.r + i
      for (let c = last; c >= dst.c; c--) set(r, c + w, get(r, c))
      for (let j = 0; j < w; j++) set(r, dst.c + j, block(i, j))
    }
    maxC += w; maxR = Math.max(maxR, dst.r + h)
    if (kind === 'move') {
      for (let i = 0; i < h; i++) {
        const r = src.r0 + i
        const shifted = r >= dst.r && r < dst.r + h && src.c0 >= dst.c
        const left = src.c0 + (shifted ? w : 0)
        for (let c = left; c < maxC; c++) set(r, c, c + w < maxC ? get(r, c + w) : null)
      }
    }
  }

  const cells: MovePlan['cells'] = []
  let needR = rows, needC = cols
  for (const [k, from] of V) {
    const [r, c] = k.split(',').map(Number)
    if (from && from.r === r && from.c === c) continue
    // Cells past the sheet's end that end up empty don't need the sheet to grow.
    if (!from && (r >= rows || c >= cols)) continue
    cells.push({ to: { r, c }, from })
    if (r + 1 > needR) needR = r + 1
    if (c + 1 > needC) needC = c + 1
  }
  cells.sort((a, b) => a.to.r - b.to.r || a.to.c - b.to.c)
  return { cells, rows: needR, cols: needC }
}

/** Whether a rectangle cuts through another (overlaps without holding it whole). */
export const splits = (block: MoveRect, other: MoveRect) => {
  const meets = block.r0 <= other.r1 && other.r0 <= block.r1 && block.c0 <= other.c1 && other.c0 <= block.c1
  const holds = block.r0 <= other.r0 && block.r1 >= other.r1 && block.c0 <= other.c0 && block.c1 >= other.c1
  return meets && !holds
}

/** The right-drag menu (Excel's list), with each item's access key. */
export const MOVE_CHOICES = [
  { key: 'move', letter: 'M' }, { key: 'copy', letter: 'C' }, { key: 'values', letter: 'V' }, { key: 'formats', letter: 'F' },
  { key: 'link', letter: 'L' }, { key: 'hyperlink', letter: 'H' },
  { key: 'shiftDownCopy', letter: 'S' }, { key: 'shiftRightCopy', letter: 'R' }, { key: 'shiftDownMove', letter: 'D' }, { key: 'shiftRightMove', letter: 'T' },
] as const
export type MoveChoice = typeof MOVE_CHOICES[number]['key']
