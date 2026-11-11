'use client'

/**
 * A blank sheet (spec 013 US1–US4): the shared GridCore over a SheetDoc.
 *
 * Every edit becomes a BlankChange handed to the workbook (`apply`), which
 * shows it at once, puts it on the sheet's undo stack and queues it for the
 * server. This file only works out what an action changes: which cells, which
 * rows and columns, and what they held, so that undo can put them back.
 *
 * Headings are letters (A, B … Z, AA), rows are numbered, and the sheet grows
 * when a paste runs past its edge, up to 5,000 rows and 200 columns.
 *
 * Spec 015 stage 2: hidden rows and columns are left out of the grid, so the
 * grid's indexes are over what's visible (`vRows`, `vCols`); names and
 * letters still count every row and column, as in Excel (hide row 5 and the
 * next one is still 6).
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { GridCore, type ActiveCell, type CellWrite, type GridModel, type GridRect, type MenuTarget, type WriteWhy } from '@/components/sheet/GridCore'
import type { CellStyle, ColFilter, ConditionalRule, SheetDoc, SheetMergeRecord, SheetTableRecord, SheetView, SortKey } from '@/types/index'
import type { BlankChange } from '@/lib/sheet-undo'
import { BLANK_COL_LIMIT, BLANK_ROW_LIMIT, DEFAULT_COL_W, cellsOfCols, cellsOfRows, emptyExtras, growTo, insertAt } from '@/lib/sheet-doc'
import { display, formatKey, indexFormats, planBorders, planFormat, planRect, resolveStyle, showsRed, toCss, validateStyle, type FormatItem } from '@/lib/sheet-format'
import { clearPatch, matches, nextMatch, paintPatch, replaceIn, transpose } from '@/lib/sheet-tools'
import { cellStylePatch, columnValues, evalRules, filterOn, filterRows, looksLikeHeader, barCss, sortRows, tableLook, type CellView } from '@/lib/sheet-rules'
import { FilterMenu } from './format/StyleTools'
import { announceFind, askComment, clearComments, useCommentBridge, useFormatBridge, type FormatCmd, type FormatState, type MergeMode, type ViewOp } from './format/bus'
import { fitHeight } from './format/fit'
import { cellName, colLetters } from '@/lib/sheet-selection'
import { parseClipboard, pastePlan, toGrid } from '@/lib/sheet-clipboard'
import { PopMenu, type PopItem } from './PopMenu'
import { ConfirmDialog, ResizeDialog } from './Dialogs'

const MAX_CELL = 50_000
export const BLANK_ROW_H = 24

type Row = { key: string; id: string; position: number; height: number | null }

export interface BlankSheetProps {
  doc: SheetDoc
  name: string
  /** Why this member can't change it (a protected sheet), or null. */
  readOnly: string | null
  apply(label: string, changes: BlankChange[]): void
  onUndo(): void
  onRedo(): void
  /** What is selected, for the toolbar: the active cell's name and the count. */
  onSelect(info: { cell: string; count: number }): void
  onSkipped(skipped: Partial<Record<string, number>>): void
  /** A short message for the workbook's toast (a menu Paste the browser refused). */
  onNotice(text: string): void
  newId(): string
}

export function BlankSheet(p: BlankSheetProps) {
  const t = useTranslations('sheets')
  const { doc } = p
  const [picked, setActive] = useState<ActiveCell | null>(null)
  const [notes, setNotes] = useState<Record<string, string | undefined>>({})
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: PopItem[]; anchor: HTMLElement } | null>(null)
  const [resize, setResize] = useState<{ kind: 'row' | 'col'; ids: string[]; value: number } | null>(null)
  const [selectRect, setSelectRect] = useState<GridRect | null>(null)
  const rectRef = useRef<GridRect>({ r0: 0, c0: 0, r1: 0, c1: 0 })
  const noteTimers = useRef(new Map<string, number>())

  const extras = doc.extras ?? emptyExtras()
  const view = extras.view
  const index = useMemo(() => indexFormats(extras.formats), [extras.formats])
  const styleOf = useCallback((rowId: string, colId: string) => resolveStyle(index, rowId, colId), [index])
  // Stage 2: what's hidden is left out of the grid; indexes from the grid are over what's visible.
  const hiddenR = useMemo(() => new Set(view.hiddenRows ?? []), [view.hiddenRows])
  const hiddenC = useMemo(() => new Set(view.hiddenCols ?? []), [view.hiddenCols])
  // Stage 3 (FR-046): rows the filter leaves out are hidden the same way, until it's cleared.
  const fArea = view.filterArea ?? null
  const filter = useMemo(() => view.filter ?? {}, [view.filter])
  const cellView = useCallback((rowId: string, col: string): CellView => ({ text: doc.cells[rowId]?.[col] ?? '', style: resolveStyle(index, rowId, col) }), [doc.cells, index])
  /** The rows under the filter's header row, to its last row or the sheet's end. */
  const filterScope = useMemo(() => {
    if (!fArea) return [] as string[]
    const h = fArea.header ? doc.rows.findIndex(r => r.id === fArea.header) : -1
    const e = fArea.last ? doc.rows.findIndex(r => r.id === fArea.last) : -1
    return doc.rows.slice(h + 1, e >= 0 ? e + 1 : doc.rows.length).map(r => r.id)
  }, [fArea, doc.rows])
  const filteredOut = useMemo(() => {
    const out = new Set<string>()
    if (!fArea || !Object.values(filter).some(filterOn)) return out
    const keep = new Set(filterRows(filterScope, filter, cellView))
    for (const id of filterScope) if (!keep.has(id)) out.add(id)
    return out
  }, [fArea, filter, filterScope, cellView])
  const vRows = useMemo(() => doc.rows.filter(r => !hiddenR.has(r.id) && !filteredOut.has(r.id)), [doc.rows, hiddenR, filteredOut])
  const vCols = useMemo(() => doc.cols.filter(c => !hiddenC.has(c.id)), [doc.cols, hiddenC])
  /** The grid shows its first cell as active before anything is clicked; the toolbar must agree. */
  const active: ActiveCell | null = picked && vRows.some(r => r.id === picked.key) ? picked
    : vRows[0] && vCols[0] ? { key: vRows[0].id, col: vCols[0].id } : null
  const rows: Row[] = useMemo(() => vRows.map(r => ({ key: r.id, ...r })), [vRows])
  const colIds = useMemo(() => vCols.map(c => c.id), [vCols])
  /** Every column's place in the sheet, hidden ones included: its letter. */
  const colIndex = useMemo(() => new Map(doc.cols.map((c, i) => [c.id, i])), [doc.cols])
  const vColIndex = useMemo(() => new Map(colIds.map((id, i) => [id, i])), [colIds])
  const widths = useMemo(() => Object.fromEntries(doc.cols.map(c => [c.id, c.width ?? DEFAULT_COL_W])), [doc.cols])
  const value = (rowId: string, colId: string) => doc.cells[rowId]?.[colId] ?? ''
  const ro = p.readOnly
  const locale = useLocale()

  // ── spec 015: formatting, merges ────────────────────────────────────────
  /** Rows grow to fit wrapped text and large type, unless someone set their height (as Excel's autofit). */
  const autoH = useMemo(() => {
    const out = new Map<string, number>()
    const hasLayers = index.size > 0
    if (!hasLayers) return out
    for (const r of doc.rows) {
      if (r.height !== null) continue
      let h = 0
      const rowCells = doc.cells[r.id]
      for (const c of doc.cols) {
        const st = resolveStyle(index, r.id, c.id)
        if (!st) continue
        const v = rowCells?.[c.id] ?? ''
        if (!v && !st.size) continue
        h = Math.max(h, fitHeight(v, st, (c.width ?? DEFAULT_COL_W)))
      }
      if (h > BLANK_ROW_H) out.set(r.id, Math.min(400, h))
    }
    return out
  }, [doc.rows, doc.cols, doc.cells, index])
  const heightOf = (r: { id: string; height: number | null }) => r.height ?? autoH.get(r.id) ?? BLANK_ROW_H
  /** Every row's place in the sheet, hidden ones included: its number. */
  const rowIndex = useMemo(() => new Map(doc.rows.map((r, i) => [r.id, i])), [doc.rows])
  const vRowIndex = useMemo(() => new Map(vRows.map((r, i) => [r.id, i])), [vRows])
  /** The name of a visible cell: its real row number and column letter (B4). */
  const nameAt = (r: number, c: number) => cellName(rowIndex.get(vRows[r]?.id ?? '') ?? r, colIndex.get(vCols[c]?.id ?? '') ?? c)
  /** Merges as blocks of visible indexes; one whose edges are gone or hidden is left out. */
  const boxes = useMemo(() => extras.merges.map(m => {
    const a = vRowIndex.get(m.top), b = vRowIndex.get(m.bottom), c = vColIndex.get(m.left), d = vColIndex.get(m.right)
    if (a === undefined || b === undefined || c === undefined || d === undefined) return null
    return { m, r0: Math.min(a, b), r1: Math.max(a, b), c0: Math.min(c, d), c1: Math.max(c, d) }
  }).filter((x): x is { m: SheetMergeRecord; r0: number; r1: number; c0: number; c1: number } => !!x), [extras.merges, vRowIndex, vColIndex])
  const spans = useMemo(() => {
    const anchor = new Map<string, { width: number; height: number }>(), covered = new Map<string, string>()
    for (const b of boxes) {
      let width = 0, height = 0
      for (let c = b.c0; c <= b.c1; c++) width += vCols[c].width ?? DEFAULT_COL_W
      for (let r = b.r0; r <= b.r1; r++) height += heightOf(vRows[r])
      const ak = `${vRows[b.r0].id}|${vCols[b.c0].id}`
      anchor.set(ak, { width, height })
      for (let r = b.r0; r <= b.r1; r++) for (let c = b.c0; c <= b.c1; c++) if (r !== b.r0 || c !== b.c0) covered.set(`${vRows[r].id}|${vCols[c].id}`, ak)
    }
    return { anchor, covered }
  }, [boxes, vRows, vCols, autoH]) // eslint-disable-line react-hooks/exhaustive-deps

  const onNote = useCallback((key: string, note: string | null) => {
    setNotes(n => ({ ...n, [key]: note ?? undefined }))
    window.clearTimeout(noteTimers.current.get(key))
    if (note) noteTimers.current.set(key, window.setTimeout(() => setNotes(n => ({ ...n, [key]: undefined })), 4000))
  }, [])

  /** Cells to change, with what they held; unchanged ones drop out. */
  function cellChange(list: { rowId: string; colId: string; value: string }[]): BlankChange | null {
    const cells = list
      .map(x => ({ rowId: x.rowId, colId: x.colId, before: value(x.rowId, x.colId), after: x.value }))
      .filter(x => x.before !== x.after)
    return cells.length ? { kind: 'cells', cells } : null
  }

  async function writeCells(writes: CellWrite[], why: WriteWhy) {
    if (ro) return { skipped: { protected: writes.length } }
    const skipped: Partial<Record<string, number>> = {}
    const bump = (k: string) => { skipped[k] = (skipped[k] ?? 0) + 1 }
    let maxR = -1, maxC = -1
    for (const w of writes) { if (w.r > maxR) maxR = w.r; if (w.c > maxC) maxC = w.c }
    // A paste past the edge grows the sheet (FR-024), up to the limits.
    const newRows = why === 'paste' ? growTo(doc.rows, doc.rows.length + maxR - vRows.length, BLANK_ROW_LIMIT, p.newId) : []
    const newCols = why === 'paste' ? growTo(doc.cols, doc.cols.length + maxC - vCols.length, BLANK_COL_LIMIT, p.newId) : []
    const allRows = [...vRows, ...newRows], allCols = [...vCols, ...newCols]
    const list: { rowId: string; colId: string; value: string }[] = []
    for (const w of writes) {
      const r = allRows[w.r], c = allCols[w.c]
      if (!r || !c) { if (w.value) bump('limit'); continue }
      if (w.value.length > MAX_CELL) { bump('invalid'); continue }
      list.push({ rowId: r.id, colId: c.id, value: w.value })
    }
    const forward: BlankChange[] = []
    if (newRows.length) forward.push({ kind: 'insertRows', rows: newRows.map(r => ({ ...r, height: null })) })
    if (newCols.length) forward.push({ kind: 'insertCols', cols: newCols.map(c => ({ ...c, width: null })) })
    const cells = cellChange(list)
    if (cells) forward.push(cells)
    // A paste from an HTML table brings its formatting (spec 015 FR-041, SC-003); text leaves it alone.
    const items: FormatItem[] = []
    for (const w of writes) {
      if (w.style === undefined) continue
      const r = allRows[w.r], c = allCols[w.c]
      if (!r || !c) continue
      const before = index.get(formatKey(r.id, c.id)) ?? null, after = validateStyle(w.style)
      if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: r.id, colKey: c.id, before, after })
    }
    if (items.length) forward.push({ kind: 'formats', items })
    if (forward.length) p.apply(why, forward)
    return { skipped }
  }

  // ── structure ───────────────────────────────────────────────────────────
  /** A visible index as a place in the whole sheet, for inserts. */
  const docRow = (at: number) => (at < vRows.length ? rowIndex.get(vRows[at].id) ?? doc.rows.length : doc.rows.length)
  const docCol = (at: number) => (at < vCols.length ? colIndex.get(vCols[at].id) ?? doc.cols.length : doc.cols.length)
  function insertRows(at: number, n: number) {
    const made = insertAt(doc.rows, docRow(at), n, p.newId)
    p.apply('insertRows', [{ kind: 'insertRows', rows: made.map(r => ({ ...r, height: null })) }])
    setSelectRect({ r0: at, c0: 0, r1: at + n - 1, c1: Math.max(0, vCols.length - 1) })
  }
  function insertCols(at: number, n: number) {
    const made = insertAt(doc.cols, docCol(at), n, p.newId)
    p.apply('insertCols', [{ kind: 'insertCols', cols: made.map(c => ({ ...c, width: null })) }])
    setSelectRect({ r0: 0, c0: at, r1: Math.max(0, vRows.length - 1), c1: at + n - 1 })
  }
  /** Stage 3: a table whose edge row or column is deleted keeps its other rows and columns; one fully deleted goes. */
  function tablesAfter(kind: 'rows' | 'cols', goneIds: Set<string>): BlankChange[] {
    const list = extras.tables ?? []
    if (!list.length) return []
    const all = kind === 'rows' ? doc.rows : doc.cols, idx = kind === 'rows' ? rowIndex : colIndex
    const [a, b] = kind === 'rows' ? ['top', 'bottom'] as const : ['left', 'right'] as const
    let changed = false
    const after = list.flatMap(tb => {
      if (!goneIds.has(tb[a]) && !goneIds.has(tb[b])) return [tb]
      const i0 = idx.get(tb[a]) ?? 0, i1 = idx.get(tb[b]) ?? 0
      const kept = all.slice(Math.min(i0, i1), Math.max(i0, i1) + 1).filter(x => !goneIds.has(x.id))
      changed = true
      return kept.length ? [{ ...tb, [a]: kept[0].id, [b]: kept[kept.length - 1].id }] : []
    })
    const out: BlankChange[] = changed ? [{ kind: 'tables', before: list, after }] : []
    const area = view.filterArea
    if (area && ((kind === 'rows' && area.header && goneIds.has(area.header)) || (kind === 'cols' && area.cols.every(c => goneIds.has(c))))) {
      out.push({ kind: 'view', before: viewNow(), after: { ...viewNow(), filterArea: null, filter: {} } })
    }
    return out
  }
  function deleteRows(r0: number, r1: number) {
    const gone = vRows.slice(r0, r1 + 1)
    p.apply('deleteRows', [...tablesAfter('rows', new Set(gone.map(r => r.id))), { kind: 'deleteRows', rows: gone, cells: cellsOfRows(doc, gone.map(r => r.id)) }])
  }
  function deleteCols(c0: number, c1: number) {
    const gone = vCols.slice(c0, c1 + 1)
    p.apply('deleteCols', [...tablesAfter('cols', new Set(gone.map(c => c.id))), { kind: 'deleteCols', cols: gone, cells: cellsOfCols(doc, gone.map(c => c.id)) }])
  }
  function setHeights(ids: string[], h: number | null) {
    const list = doc.rows.filter(r => ids.includes(r.id) && r.height !== h).map(r => ({ id: r.id, before: r.height, after: h }))
    if (list.length) p.apply('rowHeights', [{ kind: 'rowHeights', rows: list }])
  }
  function setWidths(ids: string[], w: number | null) {
    const list = doc.cols.filter(c => ids.includes(c.id) && c.width !== w).map(c => ({ id: c.id, before: c.width, after: w }))
    if (list.length) p.apply('colWidths', [{ kind: 'colWidths', cols: list }])
  }
  function clear(q: GridRect) {
    const list: { rowId: string; colId: string; value: string }[] = []
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) {
      const row = vRows[r], col = vCols[c]
      if (row && col && value(row.id, col.id)) list.push({ rowId: row.id, colId: col.id, value: '' })
    }
    const ch = cellChange(list)
    if (ch) p.apply('clear', [ch])
  }

  /** Back to the grid after a menu or dialog, so the keys (Ctrl+Z…) keep working. */
  const rootRef = useRef<HTMLDivElement>(null)
  const focusActive = () => requestAnimationFrame(() => {
    const a = document.activeElement
    if (a && a !== document.body && !rootRef.current?.contains(a) && a.closest('[role="dialog"], [role="menu"]')) return
    rootRef.current?.querySelector<HTMLElement>('.fx-sheet-td.is-active')?.focus({ preventScroll: true })
  })

  // ── the clipboard from a menu ───────────────────────────────────────────
  /** Copy and Cut from a menu go through the grid's own handlers (a real copy event). */
  function clipboardCommand(kind: 'copy' | 'cut', anchor: HTMLElement) {
    const cell = anchor.closest('[data-sheet-grid]')?.querySelector<HTMLElement>('.fx-sheet-td.is-active') ?? anchor
    cell.focus()
    let ok = false
    try { ok = document.execCommand(kind) } catch { ok = false }
    if (!ok) p.onNotice(t('grid.pasteHint'))
  }
  async function menuPaste(q: GridRect) {
    let html = '', text = ''
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        if (it.types.includes('text/html')) html = await (await it.getType('text/html')).text()
        if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text()
      }
    } catch {
      try { text = await navigator.clipboard.readText() } catch { p.onNotice(t('grid.pasteHint')); return }
    }
    const g = toGrid(parseClipboard({ html, text }, new DOMParser()))
    if (!g.length) return
    const plan = pastePlan(g, q)
    const list: CellWrite[] = []
    for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) list.push({ r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) })
    const res = await writeCells(list, 'paste')
    p.onSkipped(res.skipped)
    setSelectRect({ r0: q.r0, c0: q.c0, r1: q.r0 + plan.rows - 1, c1: q.c0 + plan.cols - 1 })
  }

  // ── the menus (FR-040–FR-043) ───────────────────────────────────────────
  function contextMenu(target: MenuTarget, at: { x: number; y: number }, anchor: HTMLElement) {
    const q = target.rect
    const nr = q.r1 - q.r0 + 1, nc = q.c1 - q.c0 + 1
    const lock = ro ? { disabled: true, why: ro } : {}
    const tooManyRows = doc.rows.length + nr > BLANK_ROW_LIMIT ? { disabled: true, why: t('err.too_many_rows') } : {}
    const tooManyCols = doc.cols.length + nc > BLANK_COL_LIMIT ? { disabled: true, why: t('err.too_many_cols') } : {}
    const allRows = nr >= vRows.length ? { disabled: true, why: t('menu.keepOneRow') } : {}
    const allCols = nc >= vCols.length ? { disabled: true, why: t('menu.keepOneCol') } : {}
    const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    const k = (key: string) => `${mac ? '⌘' : 'Ctrl+'}${key}`
    const clip: PopItem[] = [
      { key: 'cut', label: t('menu.cut'), kbd: k('X'), ...lock, onSelect: () => clipboardCommand('cut', anchor) },
      { key: 'copy', label: t('menu.copy'), kbd: k('C'), onSelect: () => clipboardCommand('copy', anchor) },
      { key: 'paste', label: t('menu.paste'), kbd: k('V'), ...lock, onSelect: () => void menuPaste(q) },
    ]
    const rowItems: PopItem[] = [
      { key: 'insertRowAbove', label: t('menu.insertRowAbove'), ...lock, ...(ro ? {} : tooManyRows), onSelect: () => insertRows(q.r0, target.kind === 'row' ? nr : 1) },
      { key: 'insertRowBelow', label: t('menu.insertRowBelow'), ...lock, ...(ro ? {} : tooManyRows), onSelect: () => insertRows(q.r1 + 1, target.kind === 'row' ? nr : 1) },
    ]
    const colItems: PopItem[] = [
      { key: 'insertColLeft', label: t('menu.insertColLeft'), ...lock, ...(ro ? {} : tooManyCols), onSelect: () => insertCols(q.c0, target.kind === 'col' ? nc : 1) },
      { key: 'insertColRight', label: t('menu.insertColRight'), ...lock, ...(ro ? {} : tooManyCols), onSelect: () => insertCols(q.c1 + 1, target.kind === 'col' ? nc : 1) },
    ]
    const delRow: PopItem = { key: 'deleteRow', label: t('menu.deleteRow', { n: nr }), danger: true, ...lock, ...(ro ? {} : allRows), onSelect: () => deleteRows(q.r0, q.r1) }
    const delCol: PopItem = { key: 'deleteCol', label: t('menu.deleteCol', { n: nc }), danger: true, ...lock, ...(ro ? {} : allCols), onSelect: () => deleteCols(q.c0, q.c1) }
    const clearItem: PopItem = { key: 'clear', label: t('menu.clear'), kbd: 'Delete', ...lock, onSelect: () => clear(q) }
    const commentItem: PopItem = { key: 'comment', label: t('comments.new'), kbd: mac ? '⌘⌥M' : 'Ctrl+Alt+M', onSelect: () => askComment() }
    const e = (k: string) => t(`format.edit.${k}`)
    let items: PopItem[]
    if (target.kind === 'row') {
      const ids = vRows.slice(q.r0, q.r1 + 1).map(r => r.id)
      items = [...clip, { kind: 'sep', key: 's1' }, ...rowItems, delRow, clearItem, { kind: 'sep', key: 's2' },
        { key: 'resizeRow', label: t('menu.resizeRow'), ...lock, onSelect: () => setResize({ kind: 'row', ids, value: vRows[q.r0]?.height ?? BLANK_ROW_H }) },
        { key: 'hideRows', label: e('hideRows'), ...lock, ...(ro ? {} : allRows), onSelect: () => viewOp('hideRows') },
        ...(hiddenNear('rows', q).length ? [{ key: 'unhideRows', label: e('unhideRows'), ...lock, onSelect: () => viewOp('unhideRows') }] : [])]
    } else if (target.kind === 'col') {
      const ids = vCols.slice(q.c0, q.c1 + 1).map(c => c.id)
      items = [...clip, { kind: 'sep', key: 's1' }, ...colItems, delCol, clearItem, { kind: 'sep', key: 's2' },
        { key: 'resizeCol', label: t('menu.resizeCol'), ...lock, onSelect: () => setResize({ kind: 'col', ids, value: vCols[q.c0]?.width ?? DEFAULT_COL_W }) },
        { key: 'hideCols', label: e('hideCols'), ...lock, ...(ro ? {} : allCols), onSelect: () => viewOp('hideCols') },
        ...(hiddenNear('cols', q).length ? [{ key: 'unhideCols', label: e('unhideCols'), ...lock, onSelect: () => viewOp('unhideCols') }] : [])]
    } else {
      items = [...clip, { kind: 'sep', key: 's1' }, commentItem, clearItem, { kind: 'sep', key: 's2' }, ...rowItems, ...colItems, { kind: 'sep', key: 's3' }, delRow, delCol]
    }
    setMenu({ at, items, anchor })
  }

  const model: GridModel<Row> = {
    rows,
    cols: colIds,
    widths,
    rowNoWidth: 46,
    label: t('grid.label', { name: p.name, rows: doc.rows.length, cols: doc.cols.length }),
    header: col => {
      const i = colIndex.get(col) ?? 0
      const before = i > 0 && hiddenC.has(doc.cols[i - 1].id)
      return {
        text: before
          ? <>{colLetters(i)}<button type="button" className="fx-hid-mark" data-unhide-col={col} title={t('format.edit.unhideCols')} aria-label={t('format.edit.unhideCols')}
                                       onPointerDown={ev => ev.stopPropagation()}
                                       onClick={ev => { ev.stopPropagation(); unhideBefore('cols', i) }} /></>
          : colLetters(i),
        className: `is-letter${before ? ' is-after-hidden' : ''}`,
      }
    },
    rowProps: row => ({ className: `is-blank${(rowIndex.get(row.id) ?? 0) > 0 && hiddenR.has(doc.rows[(rowIndex.get(row.id) ?? 1) - 1].id) ? ' is-after-hidden' : ''}`, level: 1 }),
    cellRole: () => 'gridcell',
    cellClass: (_row, col) => (col === 'rowNo' ? 'fx-sheet-td is-frozen-no' : 'fx-sheet-td is-blank-cell'),
    isText: (_row, col) => col !== 'rowNo' && !ro,
    textValue: (row, col) => value(row.id, col),
    copyText: (row, col) => value(row.id, col),
    isMenu: () => false,
    render: (row, col) => {
      if (col === 'rowNo') return null
      const v = value(row.id, col)
      // Stage 3: the filter buttons sit in the filter's header row.
      const fb = fArea && fArea.header === row.id && fArea.cols.includes(col)
        ? <button type="button" className={`fx-flt-btn${filterOn(filter[col]) ? ' is-on' : ''}`} data-filter-btn={col} tabIndex={-1}
                  aria-label={sheetT('filterOf', { col: v || colLetters(colIndex.get(col) ?? 0) })} aria-haspopup="dialog"
                  onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); setFilterUi({ col, anchor: ev.currentTarget }) }}>
            {filterOn(filter[col]) ? '▼' : '▾'}</button>
        : null
      if (!v) return fb
      const st = styleOf(row.id, col)
      const shown = st?.num ? display(v, st.num, locale) : v
      const text = <span className="fx-sheet-cell-text" style={showsRed(v, st?.num) ? { color: '#C00000' } : undefined}>{shown}</span>
      return fb ? <>{text}{fb}</> : text
    },
    cellStyle: (row, col) => lookCss(row.id, col),
    copyStyle: (row, col) => styleOf(row.id, col),
    copyShown: (row, col) => { const v = value(row.id, col), st = styleOf(row.id, col); return st?.num ? display(v, st.num, locale) : v },
    marked: (row, col) => marks.has(`${row.id}|${col}`),
    cellSpan: (row, col) => {
      const k = `${row.id}|${col}`
      if (spans.covered.has(k)) return 'covered'
      return spans.anchor.get(k) ?? null
    },
    rowLabel: row => {
      const i = rowIndex.get(row.id) ?? 0
      if (i > 0 && hiddenR.has(doc.rows[i - 1].id)) {
        return <>{i + 1}<button type="button" className="fx-hid-mark is-row" data-unhide-row={row.id} title={t('format.edit.unhideRows')} aria-label={t('format.edit.unhideRows')}
                                onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); unhideBefore('rows', i) }} /></>
      }
      return i + 1
    },
    isDraft: () => false,
    inputLabel: (row, col) => cellName(rowIndex.get(row.id) ?? 0, colIndex.get(col) ?? 0),
    inputDir: () => undefined,
    readOnlyNote: (_row, col) => (col === 'rowNo' ? null : ro),
    onCommit: async (row, col, v) => {
      if (ro) return ro
      if (v.length > MAX_CELL) return t('err.too_long')
      const ch = cellChange([{ rowId: row.id, colId: col, value: v }])
      if (ch) p.apply('edit', [ch])
      return null
    },
    onCancelDraft: () => {},
    onOpen: () => {},
    onPaste: () => {},
    onResize: (col, w) => { if (!ro) setWidths([col], w) },
    selection: true,
    spreadsheet: true,
    multiline: true,
    writeCells,
    onUndo: p.onUndo,
    onRedo: p.onRedo,
    contextMenu,
    rowHeight: row => row.height ?? autoH.get(row.id) ?? null,
    onRowResize: (row, h) => { if (!ro) setHeights([row.id], h) },
    onSkipped: p.onSkipped,
    onSelect: q => {
      rectRef.current = q
      p.onSelect({ cell: nameAt(q.r0, q.c0), count: (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1) })
    },
    // Stage 2: frozen panes count the sheet's first rows and columns; hidden ones among them don't show.
    frozenRows: vRows.filter(r => (rowIndex.get(r.id) ?? 0) < (view.frozenRows ?? 0)).length,
    frozenCols: vCols.filter(c => (colIndex.get(c.id) ?? 0) < (view.frozenCols ?? 0)).length,
  }

  // A covered cell isn't a place to stand: arrows step over the merge, a click lands on its top-left.
  const setActiveCell = useCallback((a: ActiveCell) => {
    const anchorKey = spans.covered.get(`${a.key}|${a.col}`)
    if (!anchorKey) { setActive(a); return }
    const [ak, ac] = anchorKey.split('|')
    setActive(prev => {
      if (prev && prev.key === ak && prev.col === ac) {
        // Moving out of the merge: past its far edge in the direction of travel.
        const b = boxes.find(x => vRows[x.r0].id === ak && vCols[x.c0].id === ac)
        const tr = vRowIndex.get(a.key) ?? 0, tc = vColIndex.get(a.col) ?? 0
        if (b) {
          if (tr > b.r0 && tr <= b.r1 && b.r1 + 1 < vRows.length && tc === b.c0) return { key: vRows[b.r1 + 1].id, col: a.col }
          if (tc > b.c0 && tc <= b.c1 && b.c1 + 1 < vCols.length && tr === b.r0) return { key: a.key, col: vCols[b.c1 + 1].id }
        }
        return prev
      }
      return { key: ak, col: ac }
    })
  }, [spans, boxes, vRows, vCols, vRowIndex, vColIndex])

  // ── spec 015: the format toolbar's commands ─────────────────────────────
  const [mergeAsk, setMergeAsk] = useState<{ value: string; run(): void } | null>(null)
  const size = { rows: vRows.length, cols: vCols.length }
  const rk = (r: number) => vRows[r]?.id ?? null, ck = (c: number) => vCols[c]?.id ?? null
  function applyItems(label: string, items: FormatItem[] | null) {
    if (ro) { p.onNotice(ro); return }
    if (!items) { p.onNotice(t('format.err.too_many_formats')); return }
    if (items.length) p.apply(label, [{ kind: 'formats', items }])
  }
  function merge(mode: MergeMode) {
    if (ro) { p.onNotice(ro); return }
    const q = rectRef.current
    const hit = boxes.filter(b => b.r0 <= q.r1 && q.r0 <= b.r1 && b.c0 <= q.c1 && q.c0 <= b.c1).map(b => b.m)
    if (mode === 'unmerge') { if (hit.length) p.apply('unmerge', [{ kind: 'merges', add: [], remove: hit }]); return }
    const groups = mode === 'across' ? Array.from({ length: q.r1 - q.r0 + 1 }, (_, i) => ({ r0: q.r0 + i, r1: q.r0 + i, c0: q.c0, c1: q.c1 })) : [q]
    if (groups.every(g => g.r0 === g.r1 && g.c0 === g.c1)) return
    const clears: { rowId: string; colId: string; value: string }[] = []
    let keep = ''
    for (const g of groups) for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
      const v = value(vRows[r].id, vCols[c].id)
      if (r === g.r0 && c === g.c0) { if (!keep) keep = v; continue }
      if (v) clears.push({ rowId: vRows[r].id, colId: vCols[c].id, value: '' })
    }
    const run = () => {
      const forward: BlankChange[] = [{
        kind: 'merges', remove: hit,
        add: groups.filter(g => g.r0 !== g.r1 || g.c0 !== g.c1).map(g => ({ id: p.newId(), top: vRows[g.r0].id, bottom: vRows[g.r1].id, left: vCols[g.c0].id, right: vCols[g.c1].id })),
      }]
      const ch = cellChange(clears)
      if (ch) forward.push(ch)
      if (mode === 'center') {
        const items = planFormat(index, groups.map(g => [vRows[g.r0].id, vCols[g.c0].id] as [string, string]), { ha: 'center' })
        if (items.length) forward.push({ kind: 'formats', items })
      }
      p.apply('merge', forward)
    }
    if (clears.length) setMergeAsk({ value: keep, run }); else run()
  }
  // ── stage 2: hide, unhide, freeze (FR-047) ──────────────────────────────
  const viewNow = (): Partial<SheetView> => ({ frozenRows: view.frozenRows ?? 0, frozenCols: view.frozenCols ?? 0, hiddenRows: view.hiddenRows ?? [], hiddenCols: view.hiddenCols ?? [], filterArea: view.filterArea ?? null, filter: view.filter ?? {} })
  function setView(label: string, after: Partial<SheetView>) {
    if (ro) { p.onNotice(ro); return }
    p.apply(label, [{ kind: 'view', before: viewNow(), after: { ...viewNow(), ...after } }])
  }
  /** Hidden rows or columns in or next to the selection (what Unhide brings back). */
  function hiddenNear(kind: 'rows' | 'cols', q: GridRect): string[] {
    const all = kind === 'rows' ? doc.rows : doc.cols, hid = kind === 'rows' ? hiddenR : hiddenC
    const vis = kind === 'rows' ? vRows : vCols, idx = kind === 'rows' ? rowIndex : colIndex
    const a = kind === 'rows' ? q.r0 : q.c0, b = kind === 'rows' ? q.r1 : q.c1
    const lo = a > 0 ? (idx.get(vis[a - 1]?.id ?? '') ?? -1) + 1 : 0
    const hi = b + 1 < vis.length ? (idx.get(vis[b + 1].id) ?? all.length) - 1 : all.length - 1
    return all.slice(lo, hi + 1).filter(x => hid.has(x.id)).map(x => x.id)
  }
  /** The marker before a row or column: unhide the hidden run just before it. */
  function unhideBefore(kind: 'rows' | 'cols', at: number) {
    const all = kind === 'rows' ? doc.rows : doc.cols, hid = kind === 'rows' ? hiddenR : hiddenC
    const show: string[] = []
    for (let i = at - 1; i >= 0 && hid.has(all[i].id); i--) show.push(all[i].id)
    if (!show.length) return
    if (kind === 'rows') setView('unhideRows', { hiddenRows: (view.hiddenRows ?? []).filter(id => !show.includes(id)) })
    else setView('unhideCols', { hiddenCols: (view.hiddenCols ?? []).filter(id => !show.includes(id)) })
  }
  function viewOp(op: ViewOp) {
    const q = rectRef.current
    const activeR = active ? rowIndex.get(active.key) ?? 0 : 0, activeC = active ? colIndex.get(active.col) ?? 0 : 0
    switch (op) {
      case 'hideRows': {
        const ids = vRows.slice(q.r0, q.r1 + 1).map(r => r.id)
        if (ids.length >= vRows.length) { p.onNotice(t('menu.keepOneRow')); return }
        setView('hideRows', { hiddenRows: [...new Set([...(view.hiddenRows ?? []), ...ids])] })
        break
      }
      case 'hideCols': {
        const ids = vCols.slice(q.c0, q.c1 + 1).map(c => c.id)
        if (ids.length >= vCols.length) { p.onNotice(t('menu.keepOneCol')); return }
        setView('hideCols', { hiddenCols: [...new Set([...(view.hiddenCols ?? []), ...ids])] })
        break
      }
      case 'unhideRows': { const show = hiddenNear('rows', q); if (show.length) setView('unhideRows', { hiddenRows: (view.hiddenRows ?? []).filter(id => !show.includes(id)) }); break }
      case 'unhideCols': { const show = hiddenNear('cols', q); if (show.length) setView('unhideCols', { hiddenCols: (view.hiddenCols ?? []).filter(id => !show.includes(id)) }); break }
      case 'freezeTop': setView('freeze', { frozenRows: 1, frozenCols: 0 }); break
      case 'freezeFirst': setView('freeze', { frozenRows: 0, frozenCols: 1 }); break
      case 'freezeHere': setView('freeze', { frozenRows: activeR, frozenCols: activeC }); break
      case 'unfreeze': setView('freeze', { frozenRows: 0, frozenCols: 0 }); break
    }
  }

  // ── stage 2: Format Painter, Clear, Fill, Paste Special, Find and Replace ─
  function cellsIn(q: GridRect, f: (rowId: string, colId: string, r: number, c: number) => void) {
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) { const row = vRows[r], col = vCols[c]; if (row && col) f(row.id, col.id, r, c) }
  }
  function clearWhat(what: 'all' | 'formats' | 'contents' | 'comments') {
    const q = rectRef.current
    if (ro && what !== 'comments') { p.onNotice(ro); return }
    const forward: BlankChange[] = []
    if (what === 'all' || what === 'contents') {
      const list: { rowId: string; colId: string; value: string }[] = []
      cellsIn(q, (rid, cid) => { if (value(rid, cid)) list.push({ rowId: rid, colId: cid, value: '' }) })
      const ch = cellChange(list)
      if (ch) forward.push(ch)
    }
    if (what === 'all' || what === 'formats') {
      const items = planRect(index, q, size, rk, ck, clearPatch())
      if (!items) { p.onNotice(t('format.err.too_many_formats')); return }
      if (items.length) forward.push({ kind: 'formats', items })
    }
    if (what === 'all' || what === 'comments') {
      const keys: string[] = []
      cellsIn(q, (rid, cid) => { if (marks.has(`${rid}|${cid}`)) keys.push(`${rid}|${cid}`) })
      if (keys.length) clearComments('blank', keys)
    }
    if (forward.length) p.apply(`clear-${what}`, forward)
  }
  /** Fill Down / Right (FR-043): the first row or column's values and look, into the rest. */
  function fill(dir: 'down' | 'right') {
    if (ro) { p.onNotice(ro); return }
    const q = rectRef.current
    const list: { rowId: string; colId: string; value: string }[] = []
    const targets: { rowId: string; colId: string; src: { rowId: string; colId: string } }[] = []
    cellsIn(q, (rid, cid, r, c) => {
      const src = dir === 'down' ? { rowId: vRows[q.r0].id, colId: cid } : { rowId: rid, colId: vCols[q.c0].id }
      if ((dir === 'down' && r === q.r0) || (dir === 'right' && c === q.c0)) return
      list.push({ rowId: rid, colId: cid, value: value(src.rowId, src.colId) })
      targets.push({ rowId: rid, colId: cid, src })
    })
    if (!targets.length) return
    const forward: BlankChange[] = []
    const ch = cellChange(list)
    if (ch) forward.push(ch)
    const items: FormatItem[] = []
    for (const x of targets) {
      const before = index.get(formatKey(x.rowId, x.colId)) ?? null, after = index.get(formatKey(x.src.rowId, x.src.colId)) ?? null
      if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: x.rowId, colKey: x.colId, before, after })
    }
    if (items.length) forward.push({ kind: 'formats', items })
    if (forward.length) p.apply(`fill-${dir}`, forward)
  }
  /** Paste Special (FR-041): values only, formats only, or both; optionally transposed. */
  async function pasteSpecial(cmd: Extract<FormatCmd, { kind: 'pasteSpecial' }>) {
    if (ro) { p.onNotice(ro); return }
    const q = rectRef.current
    const grid = cmd.transpose ? transpose(cmd.grid, '') : cmd.grid
    const styles = cmd.styles ? (cmd.transpose ? transpose(cmd.styles, null) : cmd.styles) : null
    if (!grid.length) return
    const plan = pastePlan(grid, q)
    const one = grid.length === 1 && grid[0].length === 1
    if (cmd.mode === 'formats') {
      if (!styles) { p.onNotice(t('format.edit.noFormats')); return }
      const items: FormatItem[] = []
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const row = vRows[q.r0 + r], col = vCols[q.c0 + c]
        if (!row || !col) continue
        const st = (one ? styles[0]?.[0] : styles[r]?.[c]) ?? null
        const before = index.get(formatKey(row.id, col.id)) ?? null, after = validateStyle(st)
        if (JSON.stringify(before) !== JSON.stringify(after)) items.push({ rowKey: row.id, colKey: col.id, before, after })
      }
      if (items.length) p.apply('pasteFormats', [{ kind: 'formats', items }])
    } else {
      const list: CellWrite[] = []
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const w: CellWrite = { r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) }
        if (cmd.mode === 'all' && styles) w.style = (one ? styles[0]?.[0] : styles[r]?.[c]) ?? null
        list.push(w)
      }
      const res = await writeCells(list, 'paste')
      p.onSkipped(res.skipped)
    }
    setSelectRect({ r0: q.r0, c0: q.c0, r1: q.r0 + plan.rows - 1, c1: q.c0 + plan.cols - 1 })
  }
  /** Every filled visible cell, in reading order, for Find. */
  const filled = () => {
    const out: { r: number; c: number; text: string }[] = []
    vRows.forEach((row, r) => { const cells = doc.cells[row.id]; if (!cells) return; vCols.forEach((col, c) => { const v = cells[col.id]; if (v) out.push({ r, c, text: v }) }) })
    return out
  }
  function find(cmd: Extract<FormatCmd, { kind: 'find' }>) {
    const all = filled()
    const count = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).length
    const from = active ? { r: vRowIndex.get(active.key) ?? 0, c: vColIndex.get(active.col) ?? 0 } : null
    const i = nextMatch(all, from, cmd.q.query, cmd.q, cmd.dir)
    if (i < 0) { announceFind({ source: 'blank', count: 0, at: 0, cell: null }); return }
    const hit = all[i]
    const at = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).sort((a, b) => a.r - b.r || a.c - b.c).findIndex(x => x.r === hit.r && x.c === hit.c) + 1
    setActive({ key: vRows[hit.r].id, col: vCols[hit.c].id })
    setSelectRect({ r0: hit.r, c0: hit.c, r1: hit.r, c1: hit.c })
    announceFind({ source: 'blank', count, at, cell: nameAt(hit.r, hit.c) })
  }
  function replace(cmd: Extract<FormatCmd, { kind: 'replace' }>) {
    if (ro) { p.onNotice(ro); return }
    const all = filled()
    const from = active ? { r: vRowIndex.get(active.key) ?? 0, c: vColIndex.get(active.col) ?? 0 } : null
    let targets = all.filter(x => matches(x.text, cmd.q.query, cmd.q))
    if (!cmd.all) {
      // Replace: the selected match if it is one, then on to the next.
      const cur = targets.find(x => from && x.r === from.r && x.c === from.c)
      if (!cur) { find({ kind: 'find', q: cmd.q, dir: 1 }); return }
      targets = [cur]
    }
    const list = targets.map(x => ({ rowId: vRows[x.r].id, colId: vCols[x.c].id, value: replaceIn(x.text, cmd.q.query, cmd.by, cmd.q) }))
    const ch = cellChange(list)
    if (ch) p.apply(cmd.all ? 'replaceAll' : 'replace', [ch])
    const replaced = ch?.kind === 'cells' ? ch.cells.length : 0
    const total = all.filter(x => matches(x.text, cmd.q.query, cmd.q)).length
    announceFind({ source: 'blank', count: Math.max(0, total - replaced), at: 0, cell: null, replaced, skipped: 0 })
    if (!cmd.all) requestAnimationFrame(() => find({ kind: 'find', q: cmd.q, dir: 1 }))
  }

  // ── stage 3: cell styles, tables, sort, filter, conditional formatting ─
  const tables = useMemo(() => extras.tables ?? [], [extras.tables])
  const rules = useMemo(() => extras.rules ?? [], [extras.rules])
  const sheetT = (k: string, v?: Record<string, string | number>) => t(`format.st3.${k}`, v)
  /** A table's rows and columns as they show now (filtered rows drop out of the banding, as in Excel). */
  const tableBoxes = useMemo(() => tables.map(tb => {
    const r0 = rowIndex.get(tb.top), r1 = rowIndex.get(tb.bottom), c0 = colIndex.get(tb.left), c1 = colIndex.get(tb.right)
    if (r0 === undefined || r1 === undefined || c0 === undefined || c1 === undefined) return null
    const rowsIn = vRows.filter(r => { const i = rowIndex.get(r.id) ?? -1; return i >= Math.min(r0, r1) && i <= Math.max(r0, r1) })
    const colsIn = new Set(vCols.filter(c => { const i = colIndex.get(c.id) ?? -1; return i >= Math.min(c0, c1) && i <= Math.max(c0, c1) }).map(c => c.id))
    return { tb, pos: new Map(rowsIn.map((r, i) => [r.id, i])), cols: colsIn, rows: rowsIn.length, dr: [Math.min(r0, r1), Math.max(r0, r1)], dc: [Math.min(c0, c1), Math.max(c0, c1)] }
  }).filter((x): x is NonNullable<typeof x> => !!x), [tables, rowIndex, colIndex, vRows, vCols])
  const tableLookAt = (rowId: string, colId: string): CellStyle | null => {
    for (const b of tableBoxes) { const r = b.pos.get(rowId); if (r !== undefined && b.cols.has(colId)) return tableLook(b.tb, r, 0, b.rows) }
    return null
  }
  const tableAt = (rowId: string, colId: string): SheetTableRecord | null => {
    const r = rowIndex.get(rowId) ?? -1, c = colIndex.get(colId) ?? -1
    return tableBoxes.find(b => r >= b.dr[0] && r <= b.dr[1] && c >= b.dc[0] && c <= b.dc[1])?.tb ?? null
  }
  /** Conditional formatting over the rows on screen (R8). */
  const ruleLooks = useMemo(() => evalRules(rules, vRows.map(r => r.id), colIds, (r, c) => doc.cells[r]?.[c] ?? ''), [rules, vRows, colIds, doc.cells])
  const rtl = locale.startsWith('ar')
  const lookCss = (rowId: string, colId: string) => {
    const own = styleOf(rowId, colId)
    const tl = tableBoxes.length ? tableLookAt(rowId, colId) : null
    const rl = ruleLooks.size ? ruleLooks.get(`${rowId}|${colId}`) : undefined
    if (!tl && !rl) return own ? toCss(own) : null
    let st: CellStyle = { ...(tl ?? {}), ...(own ?? {}) }
    if (rl?.style) st = { ...st, ...rl.style }
    if (rl?.scale) st = { ...st, fill: rl.scale }
    const css = toCss(st)
    if (!rl?.bar) return css
    return { ...css, cell: { ...css.cell, ...barCss(rl.bar, rtl) } }
  }
  /** The block of filled cells around a cell, as Excel's "current region". */
  function region(r: number, c: number): GridRect {
    let r0 = r, r1 = r, c0 = c, c1 = c, grew = true
    const rowHas = (rr: number, a: number, b: number) => { for (let x = a; x <= b; x++) if (value(vRows[rr].id, vCols[x].id)) return true; return false }
    const colHas = (cc: number, a: number, b: number) => { for (let x = a; x <= b; x++) if (value(vRows[x].id, vCols[cc].id)) return true; return false }
    while (grew) {
      grew = false
      if (r0 > 0 && rowHas(r0 - 1, c0, c1)) { r0--; grew = true }
      if (r1 < vRows.length - 1 && rowHas(r1 + 1, c0, c1)) { r1++; grew = true }
      if (c0 > 0 && colHas(c0 - 1, r0, r1)) { c0--; grew = true }
      if (c1 < vCols.length - 1 && colHas(c1 + 1, r0, r1)) { c1++; grew = true }
    }
    return { r0, c0, r1, c1 }
  }
  const activeAt = () => ({ r: active ? vRowIndex.get(active.key) ?? 0 : 0, c: active ? vColIndex.get(active.col) ?? 0 : 0 })
  const multi = () => { const q = rectRef.current; return q.r0 !== q.r1 || q.c0 !== q.c1 }
  /** What Sort works on: the selection, the table, the filter's rows, or the block around the active cell; and whether it has a header row. */
  function sortScope(fromFilter = false): { rows: typeof vRows; header: boolean | null } {
    const q = rectRef.current
    if (fromFilter && fArea?.header) { const h = vRows.find(r => r.id === fArea.header); const inScope = new Set(filterScope); return { rows: [...(h ? [h] : []), ...vRows.filter(r => inScope.has(r.id))], header: !!h } }
    if (q.r0 !== q.r1) return { rows: vRows.slice(q.r0, q.r1 + 1), header: null }
    const tb = active ? tableAt(active.key, active.col) : null
    if (tb) { const b = tableBoxes.find(x => x.tb.id === tb.id)!; return { rows: vRows.filter(r => b.pos.has(r.id)), header: tb.header } }
    if (fArea?.header) { const h = vRows.find(r => r.id === fArea.header); const inScope = new Set(filterScope); return { rows: [...(h ? [h] : []), ...vRows.filter(r => inScope.has(r.id))], header: !!h } }
    const a = activeAt(), g = region(a.r, a.c)
    return { rows: vRows.slice(g.r0, g.r1 + 1), header: null }
  }
  function sortBy(keys: SortKey[], header: boolean | null, fromFilter = false) {
    if (ro) { p.onNotice(ro); return }
    if (!keys.length) return
    const sc = sortScope(fromFilter)
    const hdr = header ?? sc.header ?? looksLikeHeader(colIds.map(c => cellView(sc.rows[0]?.id ?? '', c)), sc.rows[1] ? colIds.map(c => cellView(sc.rows[1].id, c)) : undefined)
    const body = hdr ? sc.rows.slice(1) : sc.rows
    if (body.length < 2) return
    const first = vRowIndex.get(body[0].id) ?? 0, last = vRowIndex.get(body[body.length - 1].id) ?? 0
    if (boxes.some(b => b.r1 >= first && b.r0 <= last)) { p.onNotice(sheetT('sortMerged')); return }
    const ordered = sortRows(body, keys, (r, col) => cellView(r.id, col))
    const slots = body.map(r => r.position).sort((x, y) => x - y)
    const moved = ordered.map((r, i) => ({ id: r.id, before: r.position, after: slots[i] })).filter(x => x.before !== x.after)
    if (moved.length) p.apply('sort', [{ kind: 'rowOrder', rows: moved }])
  }
  function formatAsTable(style: string) {
    if (ro) { p.onNotice(ro); return }
    const cur = active ? tableAt(active.key, active.col) : null
    if (cur) { p.apply('tableStyle', [{ kind: 'tables', before: tables, after: tables.map(x => (x.id === cur.id ? { ...x, style } : x)) }]); return }
    const a = activeAt(), q = multi() ? rectRef.current : region(a.r, a.c)
    const d0 = rowIndex.get(vRows[q.r0].id) ?? 0, d1 = rowIndex.get(vRows[q.r1].id) ?? 0, e0 = colIndex.get(vCols[q.c0].id) ?? 0, e1 = colIndex.get(vCols[q.c1].id) ?? 0
    if (tableBoxes.some(b => b.dr[0] <= d1 && d0 <= b.dr[1] && b.dc[0] <= e1 && e0 <= b.dc[1])) { p.onNotice(sheetT('tableOverlap')); return }
    if (boxes.some(b => b.r0 <= q.r1 && q.r0 <= b.r1 && b.c0 <= q.c1 && q.c0 <= b.c1)) { p.onNotice(sheetT('tableMerged')); return }
    const rec: SheetTableRecord = { id: p.newId(), top: vRows[q.r0].id, bottom: vRows[q.r1].id, left: vCols[q.c0].id, right: vCols[q.c1].id, style, header: true, banded: true }
    p.apply('table', [
      { kind: 'tables', before: tables, after: [...tables, rec] },
      { kind: 'view', before: viewNow(), after: { ...viewNow(), filterArea: { header: rec.top, cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id), last: rec.bottom }, filter: {} } },
    ])
    setSelectRect(q)
  }
  function tableOff() {
    if (ro) { p.onNotice(ro); return }
    const cur = active ? tableAt(active.key, active.col) : null
    if (!cur) return
    const forward: BlankChange[] = [{ kind: 'tables', before: tables, after: tables.filter(x => x.id !== cur.id) }]
    if (fArea?.header === cur.top) forward.push({ kind: 'view', before: viewNow(), after: { ...viewNow(), filterArea: null, filter: {} } })
    p.apply('tableOff', forward)
  }
  function filterCmd(op: 'toggle' | 'clear' | 'reapply') {
    if (op === 'clear') { if (Object.keys(filter).length) setView('filterClear', { filter: {} }); return }
    if (op === 'reapply') return
    if (fArea) { setView('filterOff', { filterArea: null, filter: {} }); return }
    const a = activeAt(), q = multi() ? rectRef.current : region(a.r, a.c)
    setView('filterOn', { filterArea: { header: vRows[q.r0].id, cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id), last: null }, filter: {} })
  }
  function filterCol(col: string, f: ColFilter | null) {
    const next = { ...filter }
    if (f && filterOn(f)) next[col] = f; else delete next[col]
    setView('filter', { filter: next })
  }
  const [filterUi, setFilterUi] = useState<{ col: string; anchor: HTMLElement } | null>(null)
  /** "E3:E6", or "E:G" for whole columns: where a rule applies. */
  function whereOf(r: ConditionalRule): string {
    const cs = r.range.cols.map(c => colIndex.get(c)).filter((x): x is number => x !== undefined)
    if (!cs.length) return ''
    const a = colLetters(Math.min(...cs)), b = colLetters(Math.max(...cs))
    if (r.range.rows === 'all') return `${a}:${b}`
    const rs = r.range.rows.map(x => rowIndex.get(x)).filter((x): x is number => x !== undefined)
    if (!rs.length) return `${a}:${b}`
    return `${a}${Math.min(...rs) + 1}:${b}${Math.max(...rs) + 1}`
  }
  function setRules(label: string, after: ConditionalRule[]) {
    if (ro) { p.onNotice(ro); return }
    p.apply(label, [{ kind: 'rules', before: rules, after }])
  }
  function ruleNew(rule: Pick<ConditionalRule, 'kind' | 'args' | 'style'>) {
    const q = rectRef.current
    const range: ConditionalRule['range'] = {
      rows: q.r0 === 0 && q.r1 === vRows.length - 1 && !Object.keys(filter).length ? 'all' : vRows.slice(q.r0, q.r1 + 1).map(r => r.id),
      cols: vCols.slice(q.c0, q.c1 + 1).map(c => c.id),
    }
    setRules('rule', [{ id: p.newId(), range, ...rule, priority: 0 }, ...[...rules].sort((x, y) => x.priority - y.priority).map((r, i) => ({ ...r, priority: i + 1 }))])
  }
  function rulesClear(where: 'selection' | 'sheet') {
    if (where === 'sheet') { if (rules.length) setRules('rulesClear', []); return }
    const q = rectRef.current
    const rs = new Set(vRows.slice(q.r0, q.r1 + 1).map(r => r.id)), cs = new Set(vCols.slice(q.c0, q.c1 + 1).map(c => c.id))
    const kept = rules.filter(r => !(r.range.cols.some(c => cs.has(c)) && (r.range.rows === 'all' || r.range.rows.some(x => rs.has(x)))))
    if (kept.length !== rules.length) setRules('rulesClear', kept)
  }
  /** Sort's columns, named by the header row when there is one. */
  const usedCols = useMemo(() => { const u = new Set<string>(); for (const row of Object.values(doc.cells)) for (const c of Object.keys(row)) u.add(c); return vCols.filter(c => u.has(c.id)).map(c => c.id) }, [doc.cells, vCols])
  function sortInfo(): { cols: { key: string; name: string }[]; header: boolean | null } {
    const q = rectRef.current
    const tb = active ? tableAt(active.key, active.col) : null
    let cols: string[], headRow: string | null, header: boolean | null
    if (multi()) { cols = vCols.slice(q.c0, q.c1 + 1).map(c => c.id); headRow = vRows[q.r0]?.id ?? null; header = null }
    else if (tb) { cols = vCols.filter(c => tableBoxes.find(b => b.tb.id === tb.id)?.cols.has(c.id)).map(c => c.id); headRow = tb.header ? tb.top : null; header = tb.header }
    else if (fArea) { cols = fArea.cols.filter(c => vColIndex.has(c)); headRow = fArea.header; header = true }
    else { cols = usedCols.length ? usedCols : colIds.slice(0, 1); headRow = vRows[0]?.id ?? null; header = null }
    if (header === null && headRow) {
      const i = vRowIndex.get(headRow) ?? 0
      header = vRows[i + 1] ? looksLikeHeader(cols.map(c => cellView(headRow!, c)), cols.map(c => cellView(vRows[i + 1].id, c))) : false
    }
    return { cols: cols.map(c => ({ key: c, name: (header && headRow ? value(headRow, c) : '') || `${sheetT('column')} ${colLetters(colIndex.get(c) ?? 0)}` })), header }
  }

  function runFormat(cmd: FormatCmd) {
    const q = rectRef.current
    if (cmd.kind === 'patch') applyItems(cmd.label, planRect(index, q, size, rk, ck, cmd.patch))
    else if (cmd.kind === 'borders') applyItems('borders', planBorders(index, q, size, rk, ck, cmd.preset, cmd.line))
    else if (cmd.kind === 'merge') merge(cmd.mode)
    else if (cmd.kind === 'paint') applyItems('paint', planRect(index, q, size, rk, ck, paintPatch(cmd.style)))
    else if (cmd.kind === 'view') viewOp(cmd.op)
    else if (cmd.kind === 'resize') {
      if (ro) { p.onNotice(ro); return }
      if (cmd.what === 'row') setResize({ kind: 'row', ids: vRows.slice(q.r0, q.r1 + 1).map(r => r.id), value: heightOf(vRows[q.r0]) })
      else setResize({ kind: 'col', ids: vCols.slice(q.c0, q.c1 + 1).map(c => c.id), value: vCols[q.c0]?.width ?? DEFAULT_COL_W })
      return
    }
    else if (cmd.kind === 'clear') clearWhat(cmd.what)
    else if (cmd.kind === 'fill') fill(cmd.dir)
    else if (cmd.kind === 'pasteSpecial') void pasteSpecial(cmd)
    else if (cmd.kind === 'find') { find(cmd); return }
    else if (cmd.kind === 'replace') { replace(cmd); return }
    else if (cmd.kind === 'cellStyle') { const patch = cellStylePatch(cmd.key); if (patch) applyItems('cellStyle', planRect(index, q, size, rk, ck, patch)) }
    else if (cmd.kind === 'table') formatAsTable(cmd.style)
    else if (cmd.kind === 'tableOff') tableOff()
    else if (cmd.kind === 'sort') sortBy(cmd.keys, cmd.header)
    else if (cmd.kind === 'filter') filterCmd(cmd.op)
    else if (cmd.kind === 'filterCol') filterCol(cmd.col, cmd.f)
    else if (cmd.kind === 'ruleNew') ruleNew(cmd.rule)
    else if (cmd.kind === 'rulesSet') setRules('rules', cmd.rules)
    else if (cmd.kind === 'rulesClear') rulesClear(cmd.where)
    focusActive()
  }
  const activeRow = active ? rowIndex.get(active.key) : undefined, activeCol = active ? colIndex.get(active.col) : undefined
  const fmtState: FormatState | null = active && activeRow !== undefined && activeCol !== undefined ? {
    source: 'blank',
    style: styleOf(active.key, active.col),
    value: value(active.key, active.col),
    cell: cellName(activeRow, activeCol),
    rowKey: active.key,
    colKey: active.col,
    readOnly: ro,
    mergeOff: null,
    merged: spans.anchor.has(`${active.key}|${active.col}`),
    multi: rectRef.current.r0 !== rectRef.current.r1 || rectRef.current.c0 !== rectRef.current.c1,
    viewOff: null,
    frozen: { rows: view.frozenRows ?? 0, cols: view.frozenCols ?? 0 },
    table: (() => { const tb = tableAt(active.key, active.col); return tb ? { style: tb.style } : null })(),
    tableOff: null,
    filter: { on: !!fArea, cols: Object.values(filter).filter(filterOn).length },
    ...(() => { const si = sortInfo(); return { sortCols: si.cols, sortHeader: si.header } })(),
    rules: [...rules].sort((x, y) => x.priority - y.priority).map(r => ({ ...r, where: whereOf(r) })),
  } : null
  useFormatBridge('blank', true, fmtState, runFormat)
  // Spec 015 comments: corner markers, and selecting a cell from the panel or a link.
  const marks = useCommentBridge('blank', true, (rowKey, colKey) => {
    if (!vRowIndex.has(rowKey) || !vColIndex.has(colKey)) return
    setActive({ key: rowKey, col: colKey })
    requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(`[data-cell="${rowKey}|${colKey}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  })

  return (
    <div ref={rootRef} className="fx-sheet-scroll fx-sh-blank" data-blank-sheet={doc.id} data-protected={ro ? '' : undefined}>
      <GridCore model={model} active={active} setActive={setActiveCell} editDraft={null} notes={notes} onNote={onNote} selectRect={selectRect} />
      {mergeAsk && (
        <ConfirmDialog attr="data-merge-warn" title={t('format.merge.warnTitle')} body={t('format.merge.warnBody', { value: mergeAsk.value })}
                       ok={t('format.merge.warnGo')} cancel={t('format.merge.cancel')}
                       onCancel={() => { setMergeAsk(null); focusActive() }}
                       onOk={() => { const run = mergeAsk.run; setMergeAsk(null); run(); focusActive() }} />
      )}
      {menu && (
        <PopMenu at={menu.at} items={menu.items} label={t('tabMenu.label')} attr="data-cell-menu"
                 onClose={() => { setMenu(null); focusActive() }} />
      )}
      {filterUi && (() => {
        const others = { ...filter }
        delete others[filterUi.col]
        const rowsIn = filterRows(filterScope, others, cellView).filter(id => !hiddenR.has(id))
        const cv = columnValues(rowsIn, filterUi.col, cellView)
        const title = (fArea?.header ? value(fArea.header, filterUi.col) : '') || colLetters(colIndex.get(filterUi.col) ?? 0)
        const close = () => { setFilterUi(null); focusActive() }
        return <FilterMenu anchor={filterUi.anchor} title={title} values={cv.values} fills={cv.fills} current={filter[filterUi.col]}
                           onSort={dir => { sortBy([{ col: filterUi.col, dir }], true, true); close() }}
                           onApply={f => { filterCol(filterUi.col, f); close() }} onClose={close} />
      })()}
      {resize && (
        <ResizeDialog kind={resize.kind} value={resize.value} onCancel={() => { setResize(null); focusActive() }}
                      onOk={v => { if (resize.kind === 'row') setHeights(resize.ids, v); else setWidths(resize.ids, v); setResize(null); focusActive() }} />
      )}
    </div>
  )
}
