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
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GridCore, type ActiveCell, type CellWrite, type GridModel, type GridRect, type MenuTarget, type WriteWhy } from '@/components/sheet/GridCore'
import type { SheetDoc } from '@/types/index'
import type { BlankChange } from '@/lib/sheet-undo'
import { BLANK_COL_LIMIT, BLANK_ROW_LIMIT, DEFAULT_COL_W, cellsOfCols, cellsOfRows, growTo, insertAt } from '@/lib/sheet-doc'
import { cellName, colLetters } from '@/lib/sheet-selection'
import { parseClipboard, pastePlan, toGrid } from '@/lib/sheet-clipboard'
import { PopMenu, type PopItem } from './PopMenu'
import { ResizeDialog } from './Dialogs'

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
  const [active, setActive] = useState<ActiveCell | null>(null)
  const [notes, setNotes] = useState<Record<string, string | undefined>>({})
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: PopItem[]; anchor: HTMLElement } | null>(null)
  const [resize, setResize] = useState<{ kind: 'row' | 'col'; ids: string[]; value: number } | null>(null)
  const [selectRect, setSelectRect] = useState<GridRect | null>(null)
  const rectRef = useRef<GridRect>({ r0: 0, c0: 0, r1: 0, c1: 0 })
  const noteTimers = useRef(new Map<string, number>())

  const rows: Row[] = useMemo(() => doc.rows.map(r => ({ key: r.id, ...r })), [doc.rows])
  const colIds = useMemo(() => doc.cols.map(c => c.id), [doc.cols])
  const colIndex = useMemo(() => new Map(colIds.map((id, i) => [id, i])), [colIds])
  const widths = useMemo(() => Object.fromEntries(doc.cols.map(c => [c.id, c.width ?? DEFAULT_COL_W])), [doc.cols])
  const value = (rowId: string, colId: string) => doc.cells[rowId]?.[colId] ?? ''
  const ro = p.readOnly

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
    const newRows = why === 'paste' ? growTo(doc.rows, maxR, BLANK_ROW_LIMIT, p.newId) : []
    const newCols = why === 'paste' ? growTo(doc.cols, maxC, BLANK_COL_LIMIT, p.newId) : []
    const allRows = [...doc.rows, ...newRows], allCols = [...doc.cols, ...newCols]
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
    if (forward.length) p.apply(why, forward)
    return { skipped }
  }

  // ── structure ───────────────────────────────────────────────────────────
  function insertRows(at: number, n: number) {
    const made = insertAt(doc.rows, at, n, p.newId)
    p.apply('insertRows', [{ kind: 'insertRows', rows: made.map(r => ({ ...r, height: null })) }])
    setSelectRect({ r0: at, c0: 0, r1: at + n - 1, c1: Math.max(0, doc.cols.length - 1) })
  }
  function insertCols(at: number, n: number) {
    const made = insertAt(doc.cols, at, n, p.newId)
    p.apply('insertCols', [{ kind: 'insertCols', cols: made.map(c => ({ ...c, width: null })) }])
    setSelectRect({ r0: 0, c0: at, r1: Math.max(0, doc.rows.length - 1), c1: at + n - 1 })
  }
  function deleteRows(r0: number, r1: number) {
    const gone = doc.rows.slice(r0, r1 + 1)
    p.apply('deleteRows', [{ kind: 'deleteRows', rows: gone, cells: cellsOfRows(doc, gone.map(r => r.id)) }])
  }
  function deleteCols(c0: number, c1: number) {
    const gone = doc.cols.slice(c0, c1 + 1)
    p.apply('deleteCols', [{ kind: 'deleteCols', cols: gone, cells: cellsOfCols(doc, gone.map(c => c.id)) }])
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
      const row = doc.rows[r], col = doc.cols[c]
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
    const allRows = nr >= doc.rows.length ? { disabled: true, why: t('menu.keepOneRow') } : {}
    const allCols = nc >= doc.cols.length ? { disabled: true, why: t('menu.keepOneCol') } : {}
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
    let items: PopItem[]
    if (target.kind === 'row') {
      const ids = doc.rows.slice(q.r0, q.r1 + 1).map(r => r.id)
      items = [...clip, { kind: 'sep', key: 's1' }, ...rowItems, delRow, clearItem, { kind: 'sep', key: 's2' },
        { key: 'resizeRow', label: t('menu.resizeRow'), ...lock, onSelect: () => setResize({ kind: 'row', ids, value: doc.rows[q.r0]?.height ?? BLANK_ROW_H }) }]
    } else if (target.kind === 'col') {
      const ids = doc.cols.slice(q.c0, q.c1 + 1).map(c => c.id)
      items = [...clip, { kind: 'sep', key: 's1' }, ...colItems, delCol, clearItem, { kind: 'sep', key: 's2' },
        { key: 'resizeCol', label: t('menu.resizeCol'), ...lock, onSelect: () => setResize({ kind: 'col', ids, value: doc.cols[q.c0]?.width ?? DEFAULT_COL_W }) }]
    } else {
      items = [...clip, { kind: 'sep', key: 's1' }, clearItem, { kind: 'sep', key: 's2' }, ...rowItems, ...colItems, { kind: 'sep', key: 's3' }, delRow, delCol]
    }
    setMenu({ at, items, anchor })
  }

  const model: GridModel<Row> = {
    rows,
    cols: colIds,
    widths,
    rowNoWidth: 46,
    label: t('grid.label', { name: p.name, rows: doc.rows.length, cols: doc.cols.length }),
    header: col => ({ text: colLetters(colIndex.get(col) ?? 0), className: 'is-letter' }),
    rowProps: () => ({ className: 'is-blank', level: 1 }),
    cellRole: () => 'gridcell',
    cellClass: (_row, col) => (col === 'rowNo' ? 'fx-sheet-td is-frozen-no' : 'fx-sheet-td is-blank-cell'),
    isText: (_row, col) => col !== 'rowNo' && !ro,
    textValue: (row, col) => value(row.id, col),
    copyText: (row, col) => value(row.id, col),
    isMenu: () => false,
    render: (row, col) => {
      if (col === 'rowNo') return null
      const v = value(row.id, col)
      return v ? <span className="fx-sheet-cell-text">{v}</span> : null
    },
    rowLabel: (_row, i) => i + 1,
    isDraft: () => false,
    inputLabel: (row, col) => cellName(rows.indexOf(row), colIndex.get(col) ?? 0),
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
    rowHeight: row => row.height,
    onRowResize: (row, h) => { if (!ro) setHeights([row.id], h) },
    onSkipped: p.onSkipped,
    onSelect: q => {
      rectRef.current = q
      p.onSelect({ cell: cellName(q.r0, q.c0), count: (q.r1 - q.r0 + 1) * (q.c1 - q.c0 + 1) })
    },
  }

  return (
    <div ref={rootRef} className="fx-sheet-scroll fx-sh-blank" data-blank-sheet={doc.id} data-protected={ro ? '' : undefined}>
      <GridCore model={model} active={active} setActive={setActive} editDraft={null} notes={notes} onNote={onNote} selectRect={selectRect} />
      {menu && (
        <PopMenu at={menu.at} items={menu.items} label={t('tabMenu.label')} attr="data-cell-menu"
                 onClose={() => { setMenu(null); focusActive() }} />
      )}
      {resize && (
        <ResizeDialog kind={resize.kind} value={resize.value} onCancel={() => { setResize(null); focusActive() }}
                      onOk={v => { if (resize.kind === 'row') setHeights(resize.ids, v); else setWidths(resize.ids, v); setResize(null); focusActive() }} />
      )}
    </div>
  )
}
