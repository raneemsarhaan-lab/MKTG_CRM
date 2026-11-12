/**
 * A blank sheet in memory (spec 013 R3, R5, R6). Pure.
 *
 * Every edit is a change from sheet-undo: it is applied to the document on
 * screen at once, pushed on the undo stack, and turned into the server's
 * change set for the outbox. The same function applies a step backwards on
 * undo, so the screen, the server and the history can't disagree.
 */
import type { ConditionalRule, FormatWrite, SheetChanges, SheetDoc, SheetExtras, SheetMergeRecord, SheetTableRecord, SheetView, ViewWrite } from '@/types/index'
import type { BlankChange } from '@/lib/sheet-undo'
import { betweenMany } from '@/lib/sheet-positions'

export const BLANK_ROW_LIMIT = 5000
export const BLANK_COL_LIMIT = 200
export const DEFAULT_COL_W = 120

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position

/** Spec 015: a sheet with no formatting, merges or comments yet. */
export const emptyExtras = (): SheetExtras => ({ formats: [], merges: [], view: { frozenRows: 0, frozenCols: 0 }, threads: [] })
const fk = (r: string, c: string) => `${r}\u0001${c}`

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
    case 'formats': {
      const ex = doc.extras ?? emptyExtras()
      const map = new Map(ex.formats.map(f => [fk(f.rowKey, f.colKey), f]))
      for (const x of ch.items) {
        const k = fk(x.rowKey, x.colKey)
        if (x.after && Object.keys(x.after).length) map.set(k, { rowKey: x.rowKey, colKey: x.colKey, style: x.after }); else map.delete(k)
      }
      return { ...doc, extras: { ...ex, formats: [...map.values()] } }
    }
    case 'merges': {
      const ex = doc.extras ?? emptyExtras()
      const gone = new Set(ch.remove.map(m => m.id))
      const kept = ex.merges.filter(m => !gone.has(m.id))
      const have = new Set(kept.map(m => m.id))
      return { ...doc, extras: { ...ex, merges: [...kept, ...ch.add.filter(m => !have.has(m.id))] } }
    }
    case 'view': {
      const ex = doc.extras ?? emptyExtras()
      return { ...doc, extras: { ...ex, view: { ...ex.view, ...ch.after } } }
    }
    case 'rules': {
      const ex = doc.extras ?? emptyExtras()
      return { ...doc, extras: { ...ex, rules: ch.after } }
    }
    case 'tables': {
      const ex = doc.extras ?? emptyExtras()
      return { ...doc, extras: { ...ex, tables: ch.after } }
    }
    case 'rowOrder': {
      const pos = new Map(ch.rows.map(r => [r.id, r.after]))
      return { ...doc, rows: doc.rows.map(r => (pos.has(r.id) ? { ...r, position: pos.get(r.id)! } : r)).sort(byPos) }
    }
    case 'taskMap': {
      const ex = doc.extras ?? emptyExtras()
      return { ...doc, extras: { ...ex, taskMap: ch.after } }
    }
    case 'rowTasks': {
      const ex = doc.extras ?? emptyExtras()
      const rowTasks = { ...(ex.rowTasks ?? {}) }
      for (const r of ch.rows) { if (r.after) rowTasks[r.rowId] = r.after; else delete rowTasks[r.rowId] }
      return { ...doc, extras: { ...ex, rowTasks } }
    }
    case 'taskFields': {
      // On screen only: the task's values come back from writeTaskFields; the snapshot cell shows the new value meanwhile.
      const ex = doc.extras ?? emptyExtras()
      const map = ex.taskMap
      if (!map) return doc
      const colOf = new Map(Object.entries(map.fields).map(([c, f]) => [f, c]))
      const cells = { ...doc.cells }
      const tasks = { ...(ex.tasks ?? {}) }
      for (const x of ch.cells) {
        const col = colOf.get(x.field)
        if (col) { const row = { ...(cells[x.rowId] ?? {}) }; if (x.after) row[col] = x.after; else delete row[col]; cells[x.rowId] = row }
        const tid = ex.rowTasks?.[x.rowId]
        if (tid && tasks[tid]) tasks[tid] = { ...tasks[tid], values: { ...tasks[tid].values, [x.field]: x.after } }
      }
      return { ...doc, cells, extras: { ...ex, tasks } }
    }
  }
}

/** Stage 3: rules or tables as the server takes them, from a list before and after. */
export function listWrite<T extends { id: string }>(before: T[], after: T[]): { put: T[]; remove: string[] } {
  const was = new Map(before.map(x => [x.id, JSON.stringify(x)]))
  const now = new Set(after.map(x => x.id))
  return { put: after.filter(x => was.get(x.id) !== JSON.stringify(x)), remove: before.filter(x => !now.has(x.id)).map(x => x.id) }
}
/** Two list writes in a row: the later one wins for each id. */
export function mergeLists<T extends { id: string }>(a: { put?: T[]; remove?: string[] } | undefined, b: { put?: T[]; remove?: string[] } | undefined): { put: T[]; remove: string[] } | undefined {
  if (!a && !b) return undefined
  const put = new Map<string, T>(), remove = new Set<string>()
  for (const w of [a, b]) {
    if (!w) continue
    for (const id of w.remove ?? []) { put.delete(id); remove.add(id) }
    for (const x of w.put ?? []) { remove.delete(x.id); put.set(x.id, x) }
  }
  return { put: [...put.values()], remove: [...remove] }
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
      case 'formats': push('formats', ch.items.map((x): FormatWrite => ({ rowKey: x.rowKey, colKey: x.colKey, style: x.after, mode: 'set' }))); break
      case 'merges':
        out.merges = netMerges([...opsOf(out.merges), ...ch.remove.map(x => ({ remove: x.id })), ...ch.add.map(x => ({ add: x }))])
        break
      case 'view': out.view = mergeView(out.view, viewWrite(ch.before, ch.after)); break
      case 'rules': out.rules = mergeLists<ConditionalRule>(out.rules, listWrite(ch.before, ch.after)); break
      case 'tables': out.tables = mergeLists<SheetTableRecord>(out.tables, listWrite(ch.before, ch.after)); break
      case 'rowOrder': push('rowPositions', ch.rows.map(r => ({ id: r.id, position: r.after }))); break
      case 'taskMap': out.taskMap = ch.after; break
      case 'rowTasks': out.rowTasks = lastByRow([...(out.rowTasks ?? []), ...ch.rows.map(r => ({ rowId: r.rowId, taskId: r.after }))]); break
      case 'taskFields': break
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
    formats: lastFormats(cat(a.formats, b.formats)),
    merges: a.merges || b.merges ? mergeMerges(a.merges, b.merges) : undefined,
    view: a.view || b.view ? mergeView(a.view, b.view) : undefined,
    rules: mergeLists(a.rules, b.rules),
    tables: mergeLists(a.tables, b.tables),
    rowPositions: lastById(cat(a.rowPositions, b.rowPositions)),
    ...('taskMap' in b ? { taskMap: b.taskMap } : 'taskMap' in a ? { taskMap: a.taskMap } : {}),
    rowTasks: a.rowTasks || b.rowTasks ? lastByRow([...(a.rowTasks ?? []), ...(b.rowTasks ?? [])]) : undefined,
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
  for (const k of Object.keys(out) as (keyof SheetChanges)[]) {
    const v = out[k]
    if (!v || (Array.isArray(v) && !v.length) || (k === 'merges' && !out.merges?.add?.length && !out.merges?.remove?.length)) delete out[k]
  }
  return out
}

/** For a format record, the last write wins (`set` replaces; a later `merge` lays over a queued `set`). */
function lastByRow(list: { rowId: string; taskId: string | null }[]) {
  const last = new Map<string, { rowId: string; taskId: string | null }>()
  for (const x of list) { last.delete(x.rowId); last.set(x.rowId, x) }
  return [...last.values()]
}
function lastById<T extends { id: string }>(list?: T[]): T[] | undefined {
  if (!list) return undefined
  const last = new Map<string, T>()
  for (const x of list) { last.delete(x.id); last.set(x.id, x) }
  return [...last.values()]
}
function lastFormats(list?: FormatWrite[]): FormatWrite[] | undefined {
  if (!list) return undefined
  const last = new Map<string, FormatWrite>()
  for (const f of list) {
    const k = fk(f.rowKey, f.colKey), prev = last.get(k)
    last.delete(k)
    last.set(k, prev && f.mode === 'merge' && prev.mode === 'set' && prev.style ? { ...f, mode: 'set', style: { ...prev.style, ...(f.style ?? {}) } } : f)
  }
  return [...last.values()]
}

/**
 * Merges queued in order, reduced to the last thing done to each merge. The
 * server removes first, then adds, so an add is also sent as a remove: that
 * makes it a replace whatever the server holds.
 */
export function netMerges(ops: ({ add: SheetMergeRecord } | { remove: string })[]): SheetChanges['merges'] {
  const last = new Map<string, SheetMergeRecord | null>()
  for (const o of ops) {
    const id = 'add' in o ? o.add.id : o.remove
    last.delete(id)
    last.set(id, 'add' in o ? o.add : null)
  }
  const add = [...last.values()].filter((m): m is SheetMergeRecord => !!m)
  return { add, remove: [...last.keys()] }
}
const opsOf = (m?: SheetChanges['merges']) => [
  ...(m?.remove ?? []).filter(id => !(m?.add ?? []).some(x => x.id === id)).map(id => ({ remove: id })),
  ...(m?.add ?? []).map(x => ({ add: x })),
]
function mergeMerges(a?: SheetChanges['merges'], b?: SheetChanges['merges']): SheetChanges['merges'] {
  return netMerges([...opsOf(a), ...opsOf(b)])
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

/** A view change as the server takes it: frozen counts, and the rows and columns to hide or show. */
export function viewWrite(before: Partial<SheetView>, after: Partial<SheetView>): ViewWrite {
  const out: ViewWrite = {}
  if (after.frozenRows !== undefined && after.frozenRows !== before.frozenRows) out.frozenRows = after.frozenRows
  if (after.frozenCols !== undefined && after.frozenCols !== before.frozenCols) out.frozenCols = after.frozenCols
  const diff = (a?: string[], b?: string[]) => { const A = new Set(a ?? []), B = new Set(b ?? []); return { add: [...B].filter(x => !A.has(x)), drop: [...A].filter(x => !B.has(x)) } }
  if (after.hiddenRows) { const d = diff(before.hiddenRows, after.hiddenRows); if (d.add.length) out.hideRows = d.add; if (d.drop.length) out.showRows = d.drop }
  if (after.hiddenCols) { const d = diff(before.hiddenCols, after.hiddenCols); if (d.add.length) out.hideCols = d.add; if (d.drop.length) out.showCols = d.drop }
  // Stage 3: the filter and the linked sheets' sort are sent whole (null = none).
  if ('filterArea' in after && JSON.stringify(after.filterArea ?? null) !== JSON.stringify(before.filterArea ?? null)) out.filterArea = after.filterArea ?? null
  if ('filter' in after && JSON.stringify(after.filter ?? null) !== JSON.stringify(before.filter ?? null)) out.filter = after.filter ?? null
  if ('sort' in after && JSON.stringify(after.sort ?? null) !== JSON.stringify(before.sort ?? null)) out.sort = after.sort ?? null
  return out
}

/** Two queued view writes as one, in order: the later frozen counts win, and a show undoes an earlier hide. */
export function mergeView(a: ViewWrite | undefined, b: ViewWrite | undefined): ViewWrite | undefined {
  if (!a) return b
  if (!b) return a
  const fold = (hideA?: string[], showA?: string[], hideB?: string[], showB?: string[]) => {
    const hide = new Set(hideA ?? []), show = new Set(showA ?? [])
    for (const x of hideB ?? []) { hide.add(x); show.delete(x) }
    for (const x of showB ?? []) { show.add(x); hide.delete(x) }
    return { hide: [...hide], show: [...show] }
  }
  const r = fold(a.hideRows, a.showRows, b.hideRows, b.showRows), c = fold(a.hideCols, a.showCols, b.hideCols, b.showCols)
  const out: ViewWrite = { frozenRows: b.frozenRows ?? a.frozenRows, frozenCols: b.frozenCols ?? a.frozenCols }
  if (r.hide.length) out.hideRows = r.hide
  if (r.show.length) out.showRows = r.show
  if (c.hide.length) out.hideCols = c.hide
  if (c.show.length) out.showCols = c.show
  for (const k of ['filterArea', 'filter', 'sort'] as const) if (k in b) (out as Record<string, unknown>)[k] = b[k]; else if (k in a) (out as Record<string, unknown>)[k] = a[k]
  for (const k of Object.keys(out) as (keyof ViewWrite)[]) if (out[k] === undefined) delete out[k]
  return out
}