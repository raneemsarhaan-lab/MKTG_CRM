/**
 * Spec 021 (US4): a field a brand has switched off is a hatched, empty cell
 * in a sheet that mixes brands (design/spaces-stage-c.html). The value stays
 * in the task; the cell just doesn't show it or take edits, and says why.
 *
 * `gateFeatureCells` wraps a grid model's reading and editing hooks; call it
 * right after the model is built. `gateFeatureStyle` adds the hatching; call
 * it after the formatting hooks have set `cellStyle`.
 */
import type { GridCol, GridModel } from './GridCore'
import { FEATURE_OFF_CELL } from '@/lib/brand-features'

/** The reason a cell is off ("Off for Omnisight"), or null when it shows normally. */
export type OffNote<R> = (row: R, col: GridCol) => string | null

export function gateFeatureCells<R extends { key: string }>(m: GridModel<R>, off: OffNote<R>): void {
  const { render, isText, isMenu, textValue, readOnlyNote, onOpen, onTypeAhead, copyText } = m
  m.render = (row, col, el) => {
    const note = off(row, col)
    return note ? <span data-feature-off={col} title={note} aria-label={note} style={{ display: 'block', width: '100%', minHeight: 14 }} /> : render(row, col, el)
  }
  m.isText = (row, col) => !off(row, col) && isText(row, col)
  m.isMenu = (row, col) => !off(row, col) && isMenu(row, col)
  m.textValue = (row, col) => (off(row, col) ? '' : textValue(row, col))
  m.readOnlyNote = (row, col) => off(row, col) ?? readOnlyNote?.(row, col) ?? null
  m.onOpen = (row, col, anchor) => { if (!off(row, col)) onOpen(row, col, anchor) }
  if (onTypeAhead) m.onTypeAhead = (row, col, ch, anchor) => (off(row, col) ? true : onTypeAhead(row, col, ch, anchor))
  if (copyText) m.copyText = (row, col) => (off(row, col) ? '' : copyText(row, col))
}

export function gateFeatureStyle<R extends { key: string }>(m: GridModel<R>, off: OffNote<R>): void {
  const cellStyle = m.cellStyle
  m.cellStyle = (row, col) => {
    const fx = cellStyle?.(row, col) ?? null
    if (!off(row, col)) return fx
    return { cell: { ...(fx?.cell ?? {}), ...FEATURE_OFF_CELL }, text: fx?.text ?? null, border: fx?.border ?? null }
  }
}
