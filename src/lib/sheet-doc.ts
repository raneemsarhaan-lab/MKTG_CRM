/**
 * A blank sheet in memory (spec 013 R3, R5, R6). Pure.
 *
 * Every edit is a change from sheet-undo: it is applied to the document on
 * screen at once, pushed on the undo stack, and turned into the server's
 * change set for the outbox. The same function applies a step backwards on
 * undo, so the screen, the server and the history can't disagree.
 */
import type { SheetChanges, SheetDoc } from '@/types/index'
import type { BlankChange } from '@/lib/sheet-undo'
import { betweenMany } from '@/lib/sheet-positions'

export const BLANK_ROW_LIMIT = 5000
export const BLANK_COL_LIMIT = 200
export const DEFAULT_COL_W = 120

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position

/** The document after a change. */
export function applyChange(doc: SheetDoc, ch: BlankChange): SheetDoc {
  switch (ch.kind) {
    case 'cells': {
      const cells = { ...doc.cells }
      for (const x of ch.cells) {
        const row = { ...(cells[x.rowId] ?? {}) }
        if (x.after === '') delete row[x.colId]; else row[x.colId] = x.after
        if (Object.keys(row).length) cells[x.rowId] = row; else delete cells[x.rowId]
      }
      return { ...doc, cells }
    }
    case 'insertRows': {
      const have = new Set(doc.rows.map(r => r.id))
      return { ...doc, rows: [...doc.rows, ...ch.rows.filter(r => !have.has(r.id))].sort(byPos) }
    }
    case 'deleteRows': {
      const gone = new Set(ch.rows.map(r => r.id))
      const cells = { ...doc.cells }
      for (const id of gone) delete cells[id]
      return { ...doc, rows: doc.rows.filter(r => !gone.has(r.id)), cells }
    }
    case 'insertCols': {
      const have = new Set(doc.cols.map(c => c.id))
      return { ...doc, cols: [...doc.cols, ...ch.cols.filter(c => !have.has(c.id))].sort(byPos) }
    }
    case 'deleteCols': {
      const gone = new Set(ch.cols.map(c => c.id))
      const cells: SheetDoc['cells'] = {}
      for (const [rid, row] of Object.entries(doc.cells)) {
        const next: Record<string, string> = {}
        for (const [cid, v] of Object.entries(row)) if (!gone.has(cid)) next[cid] = v
        if (Object.keys(next).length) cells[rid] = next
      }
      return { ...doc, cols: doc.cols.filter(c => !gone.has(c.id)), cells }
    }
    case 'rowHeights': {
      const h = new Map(ch.rows.map(r => [r.id, r.after]))
      return { ...doc, rows: doc.rows.map(r => (h.has(r.id) ? { ...r, height: h.get(r.id) ?? null } : r)) }
    }
    case 'colWidths': {
      const w = new Map(ch.cols.map(c => [c.id, c.after]))
      return { ...doc, cols: doc.cols.map(c => (w.has(c.id) ? { ...c, width: w.get(c.id) ?? null } : c)) }
    }
  }
}

export const applyAll = (doc: SheetDoc, chs: BlankChange[]) => chs.reduce(applyChange, doc)

/** What the server needs to save these changes (contracts/server.md `applySheetChanges`). */
export function toServer(chs: BlankChange[]): SheetChanges {
  const out: SheetChanges = {}
  const push = <K extends keyof SheetChanges>(k: K, items: NonNullable<SheetChanges[K]>) => {
    out[k] = [...((out[k] ?? []) as unknown[]), ...(items as unknown[])] as SheetChanges[K]
  }
  for (const ch of chs) {
    switch (ch.kind) {
      case 'cells': push('cells', ch.cells.map(x => ({ rowId: x.rowId, colId: x.colId, value: x.after }))); break
      case 'insertRows': push('insertRows', ch.rows.map(r => ({ id: r.id, position: r.position, height: r.height }))); break
      case 'deleteRows': push('deleteRows', ch.rows.map(r => r.id)); break
      case 'insertCols': push('insertCols', ch.cols.map(c => ({ id: c.id, position: c.position, width: c.width }))); break
      case 'deleteCols': push('deleteCols', ch.cols.map(c => c.id)); break
      case 'rowHeights': push('rowHeights', ch.rows.map(r => ({ id: r.id, height: r.after }))); break
      case 'colWidths': push('colWidths', ch.cols.map(c => ({ id: c.id, width: c.after }))); break
    }
  }
  return out
}

/**
 * Merge queued change sets for one sheet, keeping order where it matters:
 * structure (deletes, inserts) before cells, and for a cell the last value.
 */
export function mergeServer(a: SheetChanges, b: SheetChanges): SheetChanges {
  const cat = <T>(x?: T[], y?: T[]) => (x || y ? [...(x ?? []), ...(y ?? [])] : undefined)
  const cells = cat(a.cells, b.cells)
  const out: SheetChanges = {
    insertRows: cat(a.insertRows, b.insertRows), deleteRows: cat(a.deleteRows, b.deleteRows),
    insertCols: cat(a.insertCols, b.insertCols), deleteCols: cat(a.deleteCols, b.deleteCols),
    rowHeights: cat(a.rowHeights, b.rowHeights), colWidths: cat(a.colWidths, b.colWidths), cells,
  }
  // A row inserted and deleted in the same batch never needs to reach the server.
  for (const [ins, del] of [['insertRows', 'deleteRows'], ['insertCols', 'deleteCols']] as const) {
    const dels = new Set(out[del] ?? [])
    const both = new Set((out[ins] ?? []).filter(x => dels.has(x.id)).map(x => x.id))
    if (both.size) {
      out[ins] = (out[ins] ?? []).filter(x => !both.has(x.id)) as never
      out[del] = (out[del] ?? []).filter(id => !both.has(id))
    }
  }
  if (cells) {
    const last = new Map<string, { rowId: string; colId: string; value: string }>()
    for (const c of cells) { const k = `${c.rowId}|${c.colId}`; last.delete(k); last.set(k, c) }
    out.cells = [...last.values()]
  }
  for (const k of Object.keys(out) as (keyof SheetChanges)[]) if (!out[k] || !(out[k] as unknown[]).length) delete out[k]
  return out
}

/** The number of cells in a change set, for chunking (2,000 per call). */
export const cellCount = (c: SheetChanges) => c.cells?.length ?? 0

/** Split a change set into calls of at most `max` cells; structure goes in the first. */
export function chunk(c: SheetChanges, max = 2000): SheetChanges[] {
  const cells = c.cells ?? []
  if (cells.length <= max) return [c]
  const { cells: _drop, ...rest } = c
  const out: SheetChanges[] = []
  for (let i = 0; i < cells.length; i += max) out.push(i === 0 ? { ...rest, cells: cells.slice(i, i + max) } : { cells: cells.slice(i, i + max) })
  return out
}

/**
 * New rows or columns to append so a write reaching index `need` fits (a
 * paste larger than the sheet, FR edge case): ids from `makeId`, positions
 * after the last one, up to the limit.
 */
export function growTo<T extends { id: string; position: number }>(list: T[], need: number, limit: number, makeId: () => string): { id: string; position: number }[] {
  const want = Math.min(need + 1, limit) - list.length
  if (want <= 0) return []
  const lastPos = list.length ? list[list.length - 1].position : null
  return betweenMany(lastPos, null, want).map(position => ({ id: makeId(), position }))
}

/** Rows or columns to insert at index `at` (before the item there), `count` of them. */
export function insertAt<T extends { id: string; position: number }>(list: T[], at: number, count: number, makeId: () => string): { id: string; position: number }[] {
  const before = at > 0 ? list[at - 1]?.position ?? null : null
  const after = list[at]?.position ?? null
  return betweenMany(before, after, count).map(position => ({ id: makeId(), position }))
}

/** Cells held by some rows (for a delete's undo). */
export function cellsOfRows(doc: SheetDoc, rowIds: string[]): { rowId: string; colId: string; value: string }[] {
  const out: { rowId: string; colId: string; value: string }[] = []
  for (const rid of rowIds) for (const [colId, value] of Object.entries(doc.cells[rid] ?? {})) out.push({ rowId: rid, colId, value })
  return out
}
/** Cells held by some columns (for a delete's undo). */
export function cellsOfCols(doc: SheetDoc, colIds: string[]): { rowId: string; colId: string; value: string }[] {
  const ids = new Set(colIds)
  const out: { rowId: string; colId: string; value: string }[] = []
  for (const [rowId, row] of Object.entries(doc.cells)) for (const [colId, value] of Object.entries(row)) if (ids.has(colId)) out.push({ rowId, colId, value })
  return out
}
