/**
 * Spec 015 FR-070 (user, 2026-11-23: "make formats show"): on the Content,
 * Video and task sheets, a cell's number format (Currency, Percent, a date
 * pattern…) shows as on a blank sheet, and copying carries the look and the
 * shown text. Cells whose value isn't a number or date (titles, pills) are
 * left to the grid's own rendering.
 */
import type { CellStyle } from '@/types/index'
import { display, showsRed } from '@/lib/sheet-format'
import type { GridCol } from './GridCore'

interface Model<R> {
  render(row: R, col: GridCol, cellEl: () => HTMLElement | undefined): React.ReactNode
  textValue(row: R, col: GridCol): string
  copyStyle?(row: R, col: GridCol): CellStyle | null
  copyShown?(row: R, col: GridCol): string
}

export function withNumberFormats<R>(model: Model<R>, styleOf: (row: R, col: GridCol) => CellStyle | null, locale: string, enabled: boolean) {
  if (!enabled) return
  const base = model.render
  const shownOf = (row: R, col: GridCol): { raw: string; shown: string; num: CellStyle['num'] } | null => {
    if (col === 'rowNo') return null
    const num = styleOf(row, col)?.num
    if (!num) return null
    const raw = model.textValue(row, col)
    if (!raw) return null
    const shown = display(raw, num, locale)
    return shown === raw ? null : { raw, shown, num }
  }
  model.render = (row, col, cellEl) => {
    const s = shownOf(row, col)
    if (!s) return base(row, col, cellEl)
    return <span className="fx-sheet-ellipsis" data-num-shown="" title={s.raw} style={showsRed(s.raw, s.num) ? { color: '#C00000' } : undefined}>{s.shown}</span>
  }
  model.copyStyle = (row, col) => (col === 'rowNo' ? null : styleOf(row, col))
  model.copyShown = (row, col) => shownOf(row, col)?.shown ?? model.textValue(row, col)
}

/**
 * Spec 015 FR-041 (user, 2026-11-23: "copy carries its comment thread"): a copy
 * names each cell's comment address, and a paste asks the comments panel to
 * copy those threads onto the cells it landed on.
 */
export function withCommentPaste<R>(
  model: { rows: R[]; cols: GridCol[]; copyKey?(row: R, col: GridCol): string | null; pasteComments?(pairs: { from: string; r: number; c: number }[]): void },
  opts: { enabled: boolean; sheet: string; keyOf(row: R, col: GridCol): { rowKey: string; colKey: string } | null; paste(pairs: { from: string; rowKey: string; colKey: string }[]): void },
) {
  if (!opts.enabled) return
  model.copyKey = (row, col) => { const k = col === 'rowNo' ? null : opts.keyOf(row, col); return k ? `${opts.sheet}|${k.rowKey}|${k.colKey}` : null }
  model.pasteComments = pairs => {
    const out: { from: string; rowKey: string; colKey: string }[] = []
    for (const p of pairs) {
      const row = model.rows[p.r], col = model.cols[p.c]
      const k = row && col && col !== 'rowNo' ? opts.keyOf(row, col) : null
      if (k) out.push({ from: p.from, ...k })
    }
    if (out.length) opts.paste(out)
  }
}
