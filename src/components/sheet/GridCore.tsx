'use client'

/**
 * The sheets' grid core (spec 008 FR-003, FR-037–FR-039, FR-082; spec 009
 * research R10; spec 013 R1, R4, R7). Shared by the video sheet, the Content
 * sheet and blank sheets, so they keep one keyboard model, one editing model
 * and one set of ARIA rules.
 *
 * A div-based treegrid: sticky header row, sticky row-number and title
 * columns (logical insets, so they mirror in Arabic), one roving tabindex.
 * - Arrow keys move as seen on screen; Ctrl/Cmd+arrows jump to the edge of the data.
 * - Enter, F2, a double-click or typing edits a text cell. Enter saves and moves
 *   down (Shift+Enter up), Tab saves and moves on (Shift+Tab back), Esc cancels.
 * - Menu cells ask the sheet to open their menu.
 * - A row may span its title across every column (`colsOf`).
 *
 * Spec 013 adds, each behind an optional model hook so a sheet opts in:
 * - range selection by drag, Shift and the headers (`selection`);
 * - copy, cut and paste with Excel and Google Sheets, Delete over a range (`writeCells`);
 * - undo and redo keys (`onUndo`, `onRedo`);
 * - row heights (`rowHeight`, `onRowResize`);
 * - cell, row and column menus (`contextMenu`);
 * - a multi-line editor with Alt+Enter (`multiline`);
 * - rows windowed to the visible area on long sheets.
 *
 * What a cell is and shows comes from the model; this file knows nothing about
 * clips, pieces, themes or blank sheets.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parseClipboard, pastePlan, serialise, toGrid } from '@/lib/sheet-clipboard'
import { edge as dataEdge } from '@/lib/sheet-selection'

export type GridCol = string
export interface ActiveCell { key: string; col: GridCol }

/** One cell a write touches: a row index into `rows`, a column index into `cols`. */
export interface CellWrite { r: number; c: number; value: string }
export type WriteWhy = 'paste' | 'clear' | 'cut'
/** What a write didn't change, by reason (shown under the toolbar, FR-025). */
export type WriteResult = { skipped: Partial<Record<string, number>> } | null

/** Where a context menu was asked for (FR-040). Indexes into `rows` and `cols`. */
export type MenuTarget =
  | { kind: 'cell'; r: number; c: number; rect: GridRect }
  | { kind: 'row'; r: number; rect: GridRect }
  | { kind: 'col'; c: number; rect: GridRect }
export interface GridRect { r0: number; c0: number; r1: number; c1: number }

export interface GridModel<R extends { key: string }> {
  rows: R[]
  /** Columns after the row number. */
  cols: GridCol[]
  widths: Record<GridCol, number>
  rowNoWidth: number
  label: string
  header(col: GridCol): { text: ReactNode; label?: string; className?: string; sort?: 'ascending' }
  /** Columns a row actually has; null = every column. A two-entry list spans its last cell. */
  colsOf?(row: R): GridCol[] | null
  rowProps(row: R, index: number): { className: string; level: number; expanded?: boolean; taskId?: string }
  cellRole(row: R, col: GridCol): 'rowheader' | 'gridcell'
  cellClass(row: R, col: GridCol): string
  isText(row: R, col: GridCol): boolean
  textValue(row: R, col: GridCol): string
  isMenu(row: R, col: GridCol): boolean
  render(row: R, col: GridCol, cellEl: () => HTMLElement | undefined): ReactNode
  describedBy?(row: R, col: GridCol): string | undefined
  isDraft(row: R): boolean
  inputLabel(row: R, col: GridCol): string
  inputPlaceholder?(row: R, col: GridCol): string | undefined
  inputDir?(col: GridCol): 'ltr' | undefined
  /** A note when someone tries to type into a cell they may not edit. */
  readOnlyNote?(row: R, col: GridCol): string | null
  onCommit(row: R, col: GridCol, value: string): Promise<string | null>
  onCancelDraft(row: R): void
  onOpen(row: R, col: GridCol, anchor: HTMLElement): void
  /** Enter or click on a cell that acts (the "+ Clip" row): true when handled. */
  onActivate?(row: R, col: GridCol): boolean
  /** Space on a group row's title or number. */
  onToggle?(row: R): boolean
  /** Delete on a row: true when handled. */
  onDelete?(row: R, col: GridCol, anchor: HTMLElement): boolean
  /** A paste the sheet reads itself (new rows: Paste clips, Paste plan). */
  onPaste(e: ClipboardEvent | React.ClipboardEvent, row: R | null, col: GridCol | null): void
  /** Spec 010: a column's header menu (▾ button, or Alt+↓ from any of its cells). */
  headerMenu?(col: GridCol, anchor: HTMLElement): void
  /** Spec 010: a heading dropped before another (null = at the end). Title never moves. */
  onReorder?(col: GridCol, beforeCol: GridCol | null): void
  /** Spec 010: a column's new width, after a drag of its edge or a double-click fit. */
  onResize?(col: GridCol, width: number): void
  /** Spec 010: the column's accessible name for its menu button. */
  headerName?(col: GridCol): string
  /** Spec 010: a letter typed on a non-text cell (Type, Choice): true when it opened a type-ahead. */
  onTypeAhead?(row: R, col: GridCol, ch: string, anchor: HTMLElement): boolean

  // ── spec 013 ──
  /** Range selection by drag, Shift and the headers. */
  selection?: boolean
  /** The text a copy takes from a cell (default: `textValue`, or the cell's shown text). */
  copyText?(row: R, col: GridCol): string
  /** Write many cells at once: paste, clear, cut. Indexes may run past the end on sheets that grow. */
  writeCells?(writes: CellWrite[], why: WriteWhy): Promise<WriteResult>
  /** A paste the sheet wants to read as new rows instead of filling cells (FR-026). */
  pasteAsRows?(grid: string[][]): boolean
  onUndo?(): void
  onRedo?(): void
  /** The cell, row-number and heading menus. */
  contextMenu?(target: MenuTarget, at: { x: number; y: number }, anchor: HTMLElement): void
  /** A row's height in px; null = the default. */
  rowHeight?(row: R): number | null
  onRowResize?(row: R, height: number | null): void
  /** The editor is a textarea: Alt+Enter adds a line break. */
  multiline?: boolean
  /** What a paste, clear or cut didn't change, by reason (FR-025). */
  onSkipped?(skipped: Partial<Record<string, number>>): void
  /** Tells the host what is selected, for the toolbar and screen readers. */
  onSelect?(rect: GridRect): void
  /** Row-number labels, when they aren't 1, 2, 3 (the linked sheets show clip numbers). */
  rowLabel?(row: R, index: number): ReactNode
}

export interface GridCoreProps<R extends { key: string }> {
  model: GridModel<R>
  active: ActiveCell | null
  setActive(a: ActiveCell): void
  /** A draft row key to start typing in. */
  editDraft: string | null
  notes: Record<string, string | undefined>
  onNote(cellKey: string, note: string | null): void
  /** Select this block after the next render (a paste's result). */
  selectRect?: GridRect | null
}

export const cellKey = (rowKey: string, col: GridCol) => `${rowKey}|${col}`

export const ROW_H = 24
/** Rows beyond which only the visible part is rendered (R7). */
const WINDOW_AT = 150
const OVERSCAN = 10

type Editing = { key: string; col: GridCol; value: string; select?: boolean; caret?: number }

/** The character offset in a cell's text at a point, for a double-click edit (FR-002). */
function caretAt(cell: HTMLElement, x: number, y: number): number | undefined {
  const d = document as Document & { caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null }
  let node: Node | null = null, offset = 0
  if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; offset = p.offset } }
  else if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; offset = r.startOffset } }
  if (!node || !cell.contains(node)) return undefined
  const r = document.createRange()
  r.setStart(cell, 0)
  try { r.setEnd(node, offset) } catch { return undefined }
  return r.toString().length
}

export function GridCore<R extends { key: string }>({ model: m, active: activeIn, setActive, editDraft, notes, onNote, selectRect }: GridCoreProps<R>) {
  const gridRef = useRef<HTMLDivElement>(null)
  const cells = useRef(new Map<string, HTMLElement>())
  const wantFocus = useRef(false)
  const [editing, setEditingState] = useState<Editing | null>(null)
  /**
   * The edit as of now, not as of the last render. Fast typing can outrun
   * React: keys typed before the new input mounts are added here, and Enter
   * commits what is here.
   */
  const editingRef = useRef<Editing | null>(null)
  const setEditing = (v: Editing | null) => { editingRef.current = v; setEditingState(v) }
  const committing = useRef(false)
  /** Characters typed on a "+ Clip" / "+ Piece" row before its draft appears. */
  const pendingChar = useRef('')
  const draftPending = useRef(false)

  // Spec 010: a width being dragged shows live, before it is saved.
  const [liveWidth, setLiveWidth] = useState<{ col: GridCol; width: number } | null>(null)
  const [liveHeight, setLiveHeight] = useState<{ key: string; height: number } | null>(null)
  const [dragCol, setDragCol] = useState<GridCol | null>(null)
  const [dropBefore, setDropBefore] = useState<GridCol | null>(null)
  const widthOf = (c: GridCol) => (liveWidth?.col === c ? liveWidth.width : m.widths[c])
  const allCols: GridCol[] = ['rowNo', ...m.cols]
  const template = `${m.rowNoWidth}px ${m.cols.map(c => `${widthOf(c)}px`).join(' ')}`
  const heightOf = (row: R) => (liveHeight?.key === row.key ? liveHeight.height : m.rowHeight?.(row) ?? null)

  /** Double-click on a column edge: fit the widest rendered cell (R5). */
  function fitWidth(col: GridCol) {
    let w = 60
    gridRef.current?.querySelectorAll<HTMLElement>(`[data-col="${CSS.escape(col)}"]`).forEach(el => {
      const inner = el.firstElementChild as HTMLElement | null
      w = Math.max(w, (inner ? inner.scrollWidth : 0) + 28)
    })
    m.onResize?.(col, Math.min(600, w))
  }
  function startResize(col: GridCol, e: React.PointerEvent<HTMLElement>) {
    e.preventDefault(); e.stopPropagation()
    const startX = e.clientX, startW = m.widths[col]
    const rtl = gridRef.current ? getComputedStyle(gridRef.current).direction === 'rtl' : false
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let last = startW
    const onMove = (ev: PointerEvent) => {
      last = Math.max(40, Math.min(600, Math.round(startW + (ev.clientX - startX) * (rtl ? -1 : 1))))
      setLiveWidth({ col, width: last })
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      setLiveWidth(null)
      if (last !== startW) m.onResize?.(col, last)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }
  /** A row number's bottom edge (FR-044): drag to resize, double-click to reset. */
  function startRowResize(row: R, e: React.PointerEvent<HTMLElement>) {
    e.preventDefault(); e.stopPropagation()
    const startY = e.clientY, startH = heightOf(row) ?? ROW_H
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let last = startH
    const onMove = (ev: PointerEvent) => {
      last = Math.max(21, Math.min(400, Math.round(startH + ev.clientY - startY)))
      setLiveHeight({ key: row.key, height: last })
    }
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      setLiveHeight(null)
      if (last !== startH) m.onRowResize?.(row, last)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }
  const colsFor = (row: R): GridCol[] => m.colsOf?.(row) ?? allCols
  /** The column a row really has for a requested one: itself, or the nearest before it. */
  const fit = (row: R, col: GridCol): GridCol => {
    const own = colsFor(row)
    if (own.includes(col)) return col
    const want = allCols.indexOf(col)
    let best = own[0]
    for (const c of own) if (allCols.indexOf(c) <= want) best = c
    return best
  }

  const activeRow = activeIn ? m.rows.find(r => r.key === activeIn.key) : undefined
  const active: ActiveCell | null = activeRow && activeIn
    ? { key: activeIn.key, col: fit(activeRow, allCols.includes(activeIn.col) ? activeIn.col : 'rowNo') }
    : m.rows[0] ? { key: m.rows[0].key, col: fit(m.rows[0], m.cols[0] ?? 'rowNo') } : null

  // ── selection (spec 013 FR-010–FR-012) ────────────────────────────────────
  const rowIndex = useMemo(() => new Map(m.rows.map((r, i) => [r.key, i])), [m.rows])
  /** The far corner of the selection; the near corner is the active cell. */
  const [focusEnd, setFocusEnd] = useState<ActiveCell | null>(null)
  const ai = active ? rowIndex.get(active.key) ?? 0 : 0
  const ac = active ? Math.max(0, m.cols.indexOf(active.col)) : 0
  const fi = focusEnd ? rowIndex.get(focusEnd.key) : undefined
  const fc = focusEnd ? m.cols.indexOf(focusEnd.col) : -1
  const rect: GridRect = m.selection && fi !== undefined && fc >= 0
    ? { r0: Math.min(ai, fi), c0: Math.min(ac, fc), r1: Math.max(ai, fi), c1: Math.max(ac, fc) }
    : { r0: ai, c0: ac, r1: ai, c1: ac }
  const multi = rect.r0 !== rect.r1 || rect.c0 !== rect.c1
  const rectRef = useRef(rect)
  rectRef.current = rect
  const sig = `${rect.r0},${rect.c0},${rect.r1},${rect.c1}`
  useEffect(() => { m.onSelect?.(rectRef.current) }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Select a block by indexes: the active cell is its top-left (or `anchor` when given). */
  const selectBlock = useCallback((q: GridRect, anchor?: { r: number; c: number }) => {
    const ar = anchor?.r ?? q.r0, acc = anchor?.c ?? q.c0
    const a = m.rows[Math.min(ar, m.rows.length - 1)], b = m.rows[Math.min(ar === q.r0 ? q.r1 : q.r0, m.rows.length - 1)]
    if (!a || !b) return
    wantFocus.current = true
    setActive({ key: a.key, col: m.cols[Math.min(acc, m.cols.length - 1)] })
    setFocusEnd({ key: b.key, col: m.cols[Math.min(acc === q.c0 ? q.c1 : q.c0, m.cols.length - 1)] })
  }, [m.rows, m.cols, setActive])

  // A paste's result becomes the selection (FR-025), once its rows exist.
  useEffect(() => {
    if (!selectRect || !m.selection || selectRect.r1 >= m.rows.length) return
    selectBlock(selectRect)
  }, [selectRect, m.rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const dragging = useRef(false)
  const cutRect = useRef<GridRect | null>(null)
  const [cutMark, setCutMark] = useState<GridRect | null>(null)

  // ── windowing (spec 013 R7) ───────────────────────────────────────────────
  const windowed = m.rows.length > WINDOW_AT
  const tops = useMemo(() => {
    if (!windowed) return null
    const t = new Array<number>(m.rows.length + 1)
    t[0] = 0
    for (let i = 0; i < m.rows.length; i++) t[i + 1] = t[i] + (heightOf(m.rows[i]) ?? ROW_H)
    return t
  }, [windowed, m.rows, liveHeight]) // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState({ top: 0, height: 800 })
  const scroller = () => gridRef.current?.parentElement ?? null
  useEffect(() => {
    if (!windowed) return
    const el = scroller()
    if (!el) return
    const read = () => setView(v => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { top: el.scrollTop, height: el.clientHeight }))
    read()
    el.addEventListener('scroll', read, { passive: true })
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', read); ro.disconnect() }
  }, [windowed])
  const find = (y: number) => {
    if (!tops) return 0
    let lo = 0, hi = m.rows.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tops[mid + 1] <= y) lo = mid + 1; else hi = mid }
    return lo
  }
  const first = windowed ? Math.max(0, find(view.top - 26) - OVERSCAN) : 0
  const last = windowed ? Math.min(m.rows.length, find(view.top + view.height) + OVERSCAN + 1) : m.rows.length

  useLayoutEffect(() => {
    if (!wantFocus.current || !active || editing) return
    const el = cells.current.get(cellKey(active.key, active.col))
    if (!el) {
      // Off-screen in a windowed sheet: scroll it into view; the next render focuses it.
      const i = rowIndex.get(active.key)
      const sc = scroller()
      if (windowed && tops && i !== undefined && sc) {
        const y = tops[i], h = tops[i + 1] - tops[i]
        if (y < sc.scrollTop + 26) sc.scrollTop = Math.max(0, y - 26)
        else if (y + h > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + h - sc.clientHeight + 4
        setView({ top: sc.scrollTop, height: sc.clientHeight })
      }
      return
    }
    wantFocus.current = false
    el.focus({ preventScroll: false })
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  // A new draft row starts in edit mode.
  useEffect(() => {
    if (!editDraft) return
    const row = m.rows.find(r => r.key === editDraft)
    if (row) {
      setActive({ key: row.key, col: 'title' })
      setFocusEnd(null)
      setEditing({ key: row.key, col: 'title', value: pendingChar.current })
      pendingChar.current = ''
      draftPending.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDraft])

  /** Enter or click on an acting cell. On a "+" row's title a draft is on its way: keep keys for it. */
  function activate(row: R, col: GridCol): boolean {
    const ok = !!m.onActivate?.(row, col)
    if (ok && col === 'title') {
      draftPending.current = true
      setTimeout(() => { if (!editingRef.current) { draftPending.current = false; pendingChar.current = '' } }, 1000)
    }
    return ok
  }

  function focusCell(row: R, col: GridCol, keepRange = false) {
    wantFocus.current = true
    if (!keepRange) setFocusEnd(null)
    setActive({ key: row.key, col: fit(row, col) })
  }

  async function commit(next: 'down' | 'up' | 'right' | 'left' | 'none') {
    const cur = editingRef.current
    if (!cur || committing.current) return
    const { key, col, value } = cur
    const row = m.rows.find(r => r.key === key)
    committing.current = true
    setEditing(null)
    if (row) {
      const before = m.textValue(row, col)
      if (m.isDraft(row) || value.trim() !== before.trim() || (m.multiline && value !== before)) {
        const note = await m.onCommit(row, col, value)
        onNote(cellKey(key, col), note)
      }
    }
    committing.current = false
    move(key, col, next)
  }

  function cancel() {
    const cur = editingRef.current
    if (!cur) return
    const { key, col } = cur
    setEditing(null)
    const row = m.rows.find(r => r.key === key)
    if (!row) return
    if (m.isDraft(row)) m.onCancelDraft(row)
    else focusCell(row, col)
  }

  function startEdit(row: R, col: GridCol, initial?: string, caret?: number) {
    if (!m.isText(row, col)) {
      const note = m.readOnlyNote?.(row, col)
      if (note) onNote(cellKey(row.key, col), note)
      return
    }
    // Typing a character replaces the value; Enter and F2 edit it with the caret at the end; a double-click at the point.
    setEditing({ key: row.key, col, value: initial ?? m.textValue(row, col), caret })
  }

  function move(key: string, col: GridCol, how: 'down' | 'up' | 'right' | 'left' | 'none') {
    if (how === 'none') return
    const ri = m.rows.findIndex(r => r.key === key)
    if (ri < 0) return
    if (how === 'down') return focusCell(m.rows[Math.min(ri + 1, m.rows.length - 1)], col)
    if (how === 'up') return focusCell(m.rows[Math.max(ri - 1, 0)], col)
    // Tab / Shift+Tab: the next or previous typed-into cell, across rows.
    const step = how === 'right' ? 1 : -1
    let r = ri, c = allCols.indexOf(col)
    for (let guard = 0; guard < m.rows.length * allCols.length; guard++) {
      c += step
      if (c >= allCols.length) { c = 0; r++ }
      if (c < 0) { c = allCols.length - 1; r-- }
      if (r < 0 || r >= m.rows.length) break
      const row = m.rows[r], cc = allCols[c]
      if (colsFor(row).includes(cc) && m.isText(row, cc)) {
        focusCell(row, cc)
        // Linked sheets: arriving by Tab selects the cell's text, like a form field.
        // Blank sheets: Tab just moves, as in a spreadsheet; typing replaces.
        if (!m.selection) setEditing({ key: row.key, col: cc, value: m.textValue(row, cc), select: true })
        return
      }
    }
    focusCell(m.rows[ri], col)
  }

  // ── clipboard (spec 013 R4, FR-020–FR-026) ────────────────────────────────
  const readText = (row: R, col: GridCol) => {
    if (m.copyText) return m.copyText(row, col)
    if (m.isText(row, col)) return m.textValue(row, col)
    return cells.current.get(cellKey(row.key, col))?.innerText.trim() ?? ''
  }
  const gridOf = (q: GridRect) => {
    const out: string[][] = []
    for (let r = q.r0; r <= q.r1; r++) {
      const row = m.rows[r], own = row ? colsFor(row) : []
      const line: string[] = []
      for (let c = q.c0; c <= q.c1; c++) line.push(row && own.includes(m.cols[c]) ? readText(row, m.cols[c]) : '')
      out.push(line)
    }
    return out
  }
  const writes = useRef(m.writeCells)
  writes.current = m.writeCells

  const gridHasFocus = () => {
    const a = document.activeElement
    return !!a && !!gridRef.current?.contains(a) && !(a instanceof HTMLInputElement) && !(a instanceof HTMLTextAreaElement)
  }

  useEffect(() => {
    function onCopy(e: ClipboardEvent, cut: boolean) {
      if (!gridHasFocus() || editingRef.current || !e.clipboardData) return
      const q = rectRef.current
      const { html, text } = serialise(gridOf(q))
      e.clipboardData.setData('text/plain', text)
      e.clipboardData.setData('text/html', html)
      e.preventDefault()
      if (cut && writes.current) { cutRect.current = q; setCutMark(q) } else { cutRect.current = null; setCutMark(null) }
    }
    const copy = (e: ClipboardEvent) => onCopy(e, false)
    const cut = (e: ClipboardEvent) => onCopy(e, true)
    async function paste(e: ClipboardEvent) {
      if (!gridHasFocus() || editingRef.current || !e.clipboardData) return
      const q = rectRef.current
      const row = m.rows[q.r0] ?? null, col = m.cols[q.c0] ?? null
      if (!writes.current) { m.onPaste(e, row, col); return }
      const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain')
      const g = toGrid(parseClipboard({ html, text }, new DOMParser()))
      if (!g.length) return
      if (m.pasteAsRows?.(g)) { m.onPaste(e, row, col); return }
      e.preventDefault()
      const plan = pastePlan(g, q)
      const list: CellWrite[] = []
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) list.push({ r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) })
      const res = await writes.current(list, 'paste')
      reportSkips(res)
      // A cut's source empties once its paste lands (FR-021).
      const src = cutRect.current
      if (src) {
        cutRect.current = null; setCutMark(null)
        const clear: CellWrite[] = []
        const target = { r0: q.r0, c0: q.c0, r1: q.r0 + plan.rows - 1, c1: q.c0 + plan.cols - 1 }
        for (let r = src.r0; r <= src.r1; r++) for (let c = src.c0; c <= src.c1; c++) {
          if (r >= target.r0 && r <= target.r1 && c >= target.c0 && c <= target.c1) continue
          clear.push({ r, c, value: '' })
        }
        if (clear.length) await writes.current(clear, 'cut')
      }
      if (m.selection) selectBlockLater.current = { r0: q.r0, c0: q.c0, r1: q.r0 + plan.rows - 1, c1: q.c0 + plan.cols - 1 }
      setTick(t => t + 1)
    }
    document.addEventListener('copy', copy)
    document.addEventListener('cut', cut)
    document.addEventListener('paste', paste)
    return () => { document.removeEventListener('copy', copy); document.removeEventListener('cut', cut); document.removeEventListener('paste', paste) }
  })
  // After a paste the sheet may have grown: select the pasted block once it exists.
  const selectBlockLater = useRef<GridRect | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const q = selectBlockLater.current
    if (!q || q.r1 >= m.rows.length || q.c1 >= m.cols.length) return
    selectBlockLater.current = null
    selectBlock(q)
  }, [tick, m.rows.length, m.cols.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function reportSkips(res: WriteResult) {
    if (!res) return
    const total = Object.values(res.skipped).reduce<number>((a, b) => a + (b ?? 0), 0)
    m.onSkipped?.(total ? res.skipped : {})
  }

  async function clearRange() {
    const q = rectRef.current
    if (!writes.current) return false
    const list: CellWrite[] = []
    for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) list.push({ r, c, value: '' })
    reportSkips(await writes.current(list, 'clear'))
    return true
  }

  function openMenu(target: MenuTarget, anchor: HTMLElement, at?: { x: number; y: number }) {
    if (!m.contextMenu) return false
    const b = anchor.getBoundingClientRect()
    m.contextMenu(target, at ?? { x: b.left + 8, y: b.bottom }, anchor)
    return true
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    const printable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
    // An edit has started but its input hasn't mounted yet: keep the keys for it.
    if (!editing && (editingRef.current || draftPending.current)) {
      if (printable) {
        e.preventDefault()
        if (editingRef.current) setEditing({ ...editingRef.current, value: editingRef.current.value + e.key })
        else pendingChar.current += e.key
      } else if (e.key === 'Enter' && editingRef.current) { e.preventDefault(); void commit('down') }
      return
    }
    if (editing || !active) return
    const target = e.target as HTMLElement
    if (!target.matches('[data-cell]')) return
    const ri = m.rows.findIndex(r => r.key === active.key)
    const ci = allCols.indexOf(active.col)
    const row = m.rows[ri]
    if (!row) return
    const rtl = gridRef.current ? getComputedStyle(gridRef.current).direction === 'rtl' : false
    const ctrl = e.ctrlKey || e.metaKey

    // Undo and redo (FR-031): the host keeps the history.
    if (ctrl && !e.altKey && (e.key === 'z' || e.key === 'Z') && (m.onUndo || m.onRedo)) {
      e.preventDefault()
      if (e.shiftKey) m.onRedo?.(); else m.onUndo?.()
      return
    }
    if (ctrl && (e.key === 'y' || e.key === 'Y') && m.onRedo) { e.preventDefault(); m.onRedo(); return }
    // Select all (FR-010).
    if (ctrl && (e.key === 'a' || e.key === 'A') && m.selection && m.rows.length && m.cols.length) {
      e.preventDefault()
      selectBlock({ r0: 0, c0: 0, r1: m.rows.length - 1, c1: m.cols.length - 1 })
      return
    }
    // The menu (FR-040).
    if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
      if (active.col === 'rowNo' ? openMenu({ kind: 'row', r: ri, rect }, target) : openMenu({ kind: 'cell', r: ri, c: Math.max(0, m.cols.indexOf(active.col)), rect }, target)) e.preventDefault()
      return
    }

    const go = (r: number, c: number) => {
      e.preventDefault()
      const rr = Math.max(0, Math.min(m.rows.length - 1, r))
      const cc = Math.max(0, Math.min(allCols.length - 1, c))
      focusCell(m.rows[rr], allCols[cc])
    }
    /** Shift+arrows (FR-010): move the far corner; the active cell stays. */
    const extendTo = (r: number, c: number) => {
      e.preventDefault()
      const rr = Math.max(0, Math.min(m.rows.length - 1, r))
      const cc = Math.max(0, Math.min(m.cols.length - 1, c))
      setFocusEnd({ key: m.rows[rr].key, col: m.cols[cc] })
      const el = cells.current.get(cellKey(m.rows[rr].key, m.cols[cc]))
      el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
    /** Left/right on a spanning row: step over the span. */
    const sideways = (dir: 1 | -1) => {
      const own = colsFor(row)
      const at = own.indexOf(active.col)
      const next = own[at + dir]
      if (next) { e.preventDefault(); focusCell(row, next) } else e.preventDefault()
    }
    // Alt+↓: the active column's header menu (spec 010 R6).
    if (e.altKey && e.key === 'ArrowDown' && m.headerMenu && active.col !== 'rowNo') {
      e.preventDefault()
      const btn = gridRef.current?.querySelector<HTMLElement>(`[data-col-menu="${CSS.escape(active.col)}"]`)
      m.headerMenu(active.col, btn ?? target)
      return
    }
    const arrow = e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
    if (arrow && m.selection) {
      const dir = e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowUp' ? 'up'
        : (e.key === 'ArrowRight') !== rtl ? 'right' : 'left'
      const from = e.shiftKey && fi !== undefined && fc >= 0 ? { r: fi, c: fc } : { r: ri, c: Math.max(0, m.cols.indexOf(active.col)) }
      const filled = (r: number, c: number) => { const rw = m.rows[r]; return !!rw && readText(rw, m.cols[c]) !== '' }
      const dr = dir === 'down' ? 1 : dir === 'up' ? -1 : 0, dc = dir === 'right' ? 1 : dir === 'left' ? -1 : 0
      // Ctrl/Cmd+arrow: the edge of the data (FR-004).
      const to = ctrl ? dataEdge(from, dir, m.rows.length, m.cols.length, filled) : { r: from.r + dr, c: from.c + dc }
      if (e.shiftKey) { extendTo(to.r, to.c); return }
      if (active.col === 'rowNo' && dir === 'left') { e.preventDefault(); return }
      return go(to.r, to.c + 1)
    }
    switch (e.key) {
      case 'ArrowDown':  return go(ri + 1, ci)
      case 'ArrowUp':    return go(ri - 1, ci)
      case 'ArrowRight': return colsFor(row) === allCols ? go(ri, ci + (rtl ? -1 : 1)) : sideways(rtl ? -1 : 1)
      case 'ArrowLeft':  return colsFor(row) === allCols ? go(ri, ci + (rtl ? 1 : -1)) : sideways(rtl ? 1 : -1)
      case 'Home':       return ctrl ? go(0, 0) : go(ri, m.selection ? 1 : 0)
      case 'End':        return ctrl ? go(m.rows.length - 1, allCols.length - 1) : go(ri, allCols.length - 1)
      case 'PageDown': {
        const page = Math.max(1, Math.floor((scroller()?.clientHeight ?? 400) / ROW_H) - 1)
        return go(ri + (m.selection ? page : 15), ci)
      }
      case 'PageUp': {
        const page = Math.max(1, Math.floor((scroller()?.clientHeight ?? 400) / ROW_H) - 1)
        return go(ri - (m.selection ? page : 15), ci)
      }
    }
    if (e.key === ' ' && (active.col === 'title' || active.col === 'rowNo') && m.onToggle?.(row)) {
      e.preventDefault(); return
    }
    // Space on an acting cell (a checkbox) toggles it.
    if (e.key === ' ' && active.col !== 'title' && active.col !== 'rowNo' && m.onActivate?.(row, active.col)) {
      e.preventDefault(); return
    }
    if (e.key === 'Escape' && cutRect.current) { cutRect.current = null; setCutMark(null); return }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      if (activate(row, active.col)) return
      if (m.isMenu(row, active.col)) { m.onOpen(row, active.col, target); return }
      startEdit(row, active.col)
      return
    }
    // Delete or Backspace over a selection clears it in one step (FR-005).
    if ((e.key === 'Delete' || e.key === 'Backspace') && m.writeCells && (multi || m.selection) && active.col !== 'rowNo') {
      e.preventDefault()
      void clearRange()
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && (active.col === 'title' || active.col === 'rowNo' || !m.isText(row, active.col))) {
      if (m.onDelete?.(row, active.col, target)) e.preventDefault()
      return
    }
    if (e.key === 'Delete' && m.isText(row, active.col)) {
      // Delete on a detail cell clears it, like a spreadsheet.
      e.preventDefault()
      void m.onCommit(row, active.col, '').then(note => onNote(cellKey(row.key, active.col), note))
      return
    }
    if (e.key.length === 1 && !ctrl && !e.altKey && e.key !== ' ' && m.isText(row, active.col)) {
      e.preventDefault()
      setFocusEnd(null)
      startEdit(row, active.col, e.key)
      return
    }
    if (e.key === ' ' && m.selection && m.isText(row, active.col)) {
      e.preventDefault()
      startEdit(row, active.col, ' ')
      return
    }
    if (e.key.length === 1 && !ctrl && !e.altKey && e.key !== ' ' && m.onTypeAhead?.(row, active.col, e.key, target)) {
      e.preventDefault()
      return
    }
    // Typing on a "+ Clip" / "+ Piece" row starts the new row with that character.
    if (e.key.length === 1 && !ctrl && !e.altKey && e.key !== ' ' && active.col === 'title') {
      pendingChar.current = e.key
      if (activate(row, active.col)) e.preventDefault()
      else pendingChar.current = ''
    }
  }

  // Drag to select (FR-010, FR-012): pointer down on a cell, enter others; edges scroll.
  useEffect(() => {
    if (!m.selection) return
    let raf = 0, lastY = 0, lastX = 0
    const tickScroll = () => {
      const sc = scroller()
      if (!dragging.current || !sc) return
      const b = sc.getBoundingClientRect()
      const dy = lastY < b.top + 30 ? -18 : lastY > b.bottom - 20 ? 18 : 0
      const dx = lastX < b.left + 20 ? -18 : lastX > b.right - 20 ? 18 : 0
      if (dx || dy) sc.scrollBy(dx, dy)
      raf = requestAnimationFrame(tickScroll)
    }
    const move = (e: PointerEvent) => {
      if (!dragging.current) return
      lastY = e.clientY; lastX = e.clientX
      if (!raf) raf = requestAnimationFrame(tickScroll)
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-cell]')
      if (!el || !gridRef.current?.contains(el)) return
      const [key, col] = [el.dataset.rowKey ?? '', el.dataset.col ?? '']
      if (!key || !col || col === 'rowNo') return
      setFocusEnd(f => (f && f.key === key && f.col === col ? f : { key, col }))
    }
    const up = () => { dragging.current = false; cancelAnimationFrame(raf); raf = 0 }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); cancelAnimationFrame(raf) }
  }, [m.selection]) // eslint-disable-line react-hooks/exhaustive-deps

  const inRect = (r: number, c: number) => r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1
  const cutIn = (r: number, c: number) => !!cutMark && r >= cutMark.r0 && r <= cutMark.r1 && c >= cutMark.c0 && c <= cutMark.c1

  function headerClick(col: GridCol, e: React.MouseEvent) {
    if (!m.selection) return
    const c = m.cols.indexOf(col)
    if (c < 0 || !m.rows.length) return
    if (e.shiftKey && active) {
      setFocusEnd({ key: m.rows[m.rows.length - 1].key, col })
      setActive({ key: m.rows[0].key, col: m.cols[ac] })
      return
    }
    selectBlock({ r0: 0, c0: c, r1: m.rows.length - 1, c1: c })
  }

  const visibleRows = m.rows.slice(first, last)

  return (
    <div
      ref={gridRef}
      // A treegrid: group rows expand and collapse (aria-level, aria-expanded).
      role="treegrid"
      aria-label={m.label}
      aria-rowcount={m.rows.length + 1}
      aria-colcount={allCols.length}
      aria-multiselectable={m.selection || undefined}
      className={`fx-sheet-grid${m.selection ? ' is-selectable' : ''}`}
      data-sheet-grid=""
      style={{ ['--sheet-cols' as string]: template }}
      onKeyDown={onGridKeyDown}
    >
      <div role="row" aria-rowindex={1} className="fx-sheet-tr is-head">
        <div role="columnheader" className="fx-sheet-th is-frozen-no" aria-label="#"
             onClick={() => { if (m.selection && m.rows.length) selectBlock({ r0: 0, c0: 0, r1: m.rows.length - 1, c1: m.cols.length - 1 }) }} />
        {m.cols.map((col, c) => {
          const h = m.header(col)
          const movable = !!m.onReorder && col !== 'title'
          const on = m.selection && multi && c >= rect.c0 && c <= rect.c1
          return (
            <div key={col} role="columnheader" aria-sort={h.sort} aria-label={h.label}
                 data-col-head={col}
                 draggable={movable || undefined}
                 className={`fx-sheet-th is-${col}${col === 'title' ? ' is-frozen-title' : ''}${h.className ? ` ${h.className}` : ''}${dragCol === col ? ' is-dragging' : ''}${dropBefore === col && dragCol && dragCol !== col ? ' is-drop-before' : ''}${on ? ' is-sel-head' : ''}`}
                 onClick={e => headerClick(col, e)}
                 onContextMenu={m.contextMenu ? e => { e.preventDefault(); const cc = m.cols.indexOf(col); if (!inRect(rect.r0, cc) || rect.r1 - rect.r0 + 1 < m.rows.length) selectBlock({ r0: 0, c0: cc, r1: Math.max(0, m.rows.length - 1), c1: cc }); openMenu({ kind: 'col', c: cc, rect }, e.currentTarget, { x: e.clientX, y: e.clientY }) } : undefined}
                 onDragStart={movable ? e => { setDragCol(col); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col) } : undefined}
                 onDragOver={m.onReorder && dragCol && col !== 'title' ? e => { e.preventDefault(); if (dropBefore !== col) setDropBefore(col) } : undefined}
                 onDrop={m.onReorder && dragCol ? e => { e.preventDefault(); const from = dragCol; setDragCol(null); setDropBefore(null); if (from !== col && col !== 'title') m.onReorder?.(from, col) } : undefined}
                 onDragEnd={() => { setDragCol(null); setDropBefore(null) }}>
              <span className="fx-sheet-th-name">{h.text}</span>
              {m.headerMenu && (
                <button type="button" className="fx-sheet-th-menu" tabIndex={-1} data-col-menu={col} aria-haspopup="menu"
                        aria-label={m.headerName ? m.headerName(col) : undefined}
                        onClick={e => { e.stopPropagation(); m.headerMenu?.(col, e.currentTarget) }} />
              )}
              {m.onResize && (
                <span className="fx-sheet-th-rz" aria-hidden="true" data-col-resize={col}
                      onPointerDown={e => startResize(col, e)}
                      onClick={e => e.stopPropagation()}
                      onDoubleClick={e => { e.stopPropagation(); fitWidth(col) }} />
              )}
            </div>
          )
        })}
      </div>
      {windowed && tops && first > 0 && <div className="fx-sheet-spacer" aria-hidden="true" style={{ height: tops[first] }} />}
      {visibleRows.map((row, vi) => {
        const i = first + vi
        const rp = m.rowProps(row, i)
        const own = colsFor(row)
        const spans = own !== allCols && own.length < allCols.length
        const h = heightOf(row)
        const rowOn = m.selection && multi && i >= rect.r0 && i <= rect.r1
        return (
          <div
            key={row.key}
            role="row"
            aria-rowindex={i + 2}
            aria-level={rp.level}
            aria-expanded={rp.expanded}
            className={`fx-sheet-tr ${rp.className}${active?.key === row.key ? ' is-active-row' : ''}${h ? ' is-tall' : ''}`}
            data-row={row.key}
            data-task={rp.taskId}
            style={h ? ({ ['--row-h' as string]: `${h}px` }) : undefined}
          >
            {own.map((col, ci) => {
              const key = cellKey(row.key, col)
              const isActive = active?.key === row.key && active.col === col
              const isEditing = editing?.key === row.key && editing.col === col
              const note = notes[key]
              const text = m.isText(row, col), menu = m.isMenu(row, col)
              const span = spans && ci === own.length - 1
              const c = m.cols.indexOf(col)
              const selected = m.selection && multi && c >= 0 && inRect(i, c)
              const isNo = col === 'rowNo'
              return (
                <div
                  key={col}
                  ref={el => { if (el) cells.current.set(key, el); else cells.current.delete(key) }}
                  role={m.cellRole(row, col)}
                  tabIndex={isActive && !isEditing ? 0 : -1}
                  className={`${m.cellClass(row, col)}${isActive ? ' is-active' : ''}${selected && !isActive ? ' is-selected' : ''}${selected && isActive ? ' is-anchor' : ''}${cutIn(i, c) ? ' is-cut' : ''}${isNo && rowOn ? ' is-sel-head' : ''}${note ? ' has-note' : ''}${span ? ' is-span' : ''}`}
                  style={span ? { gridColumn: `${allCols.indexOf(col) + 1} / -1` } : undefined}
                  data-cell={key}
                  data-row-key={row.key}
                  data-col={col}
                  aria-selected={m.selection ? (selected || isActive) : undefined}
                  aria-haspopup={menu && col !== 'drop' && col !== 'archive' ? 'menu' : undefined}
                  aria-readonly={!text && !menu ? true : undefined}
                  aria-describedby={[m.describedBy?.(row, col) ?? '', note ? `${key}-note` : ''].filter(Boolean).join(' ') || undefined}
                  onFocus={() => { if (!isActive) setActive({ key: row.key, col }) }}
                  onPointerDown={m.selection ? e => {
                    if (isEditing || e.button !== 0 || (e.target as HTMLElement).closest('[data-row-resize], a, button')) return
                    if (isNo) {
                      // A row number selects its row; Shift extends from the active row (FR-010).
                      e.preventDefault()
                      if (e.shiftKey && active) { setFocusEnd({ key: row.key, col: m.cols[m.cols.length - 1] }); setActive({ key: active.key, col: m.cols[0] }) }
                      else selectBlock({ r0: i, c0: 0, r1: i, c1: m.cols.length - 1 })
                      return
                    }
                    if (e.shiftKey && active) { e.preventDefault(); setFocusEnd({ key: row.key, col }); return }
                    dragging.current = true
                    setFocusEnd(null)
                    if (!isActive) { wantFocus.current = true; setActive({ key: row.key, col }) }
                  } : undefined}
                  onClick={e => {
                    if (isEditing) return
                    if (m.selection && (e.shiftKey || isNo)) return
                    if (!isActive) setActive({ key: row.key, col })
                    if (activate(row, col)) return
                    if (menu) m.onOpen(row, col, e.currentTarget)
                  }}
                  onContextMenu={m.contextMenu ? e => {
                    e.preventDefault()
                    if (isNo) { if (!(rowOn && rect.c0 === 0 && rect.c1 === m.cols.length - 1)) selectBlock({ r0: i, c0: 0, r1: i, c1: m.cols.length - 1 }); openMenu({ kind: 'row', r: i, rect: rectRef.current }, e.currentTarget, { x: e.clientX, y: e.clientY }); return }
                    if (c >= 0 && !inRect(i, c)) { setFocusEnd(null); setActive({ key: row.key, col }) }
                    openMenu({ kind: 'cell', r: i, c, rect: inRect(i, c) ? rectRef.current : { r0: i, c0: c, r1: i, c1: c } }, e.currentTarget, { x: e.clientX, y: e.clientY })
                  } : undefined}
                  onDoubleClick={e => { if (!isEditing && !isNo) startEdit(row, col, undefined, caretAt(e.currentTarget, e.clientX, e.clientY)) }}
                >
                  {isEditing
                    ? (m.multiline
                      ? (
                        <textarea
                          className="fx-sheet-input is-multi"
                          autoFocus
                          value={editing.value}
                          rows={Math.max(1, editing.value.split('\n').length)}
                          aria-label={m.inputLabel(row, col)}
                          dir="auto"
                          onFocus={e => {
                            const el = e.currentTarget
                            const at = editing.caret ?? el.value.length
                            el.setSelectionRange(at, at)
                          }}
                          onChange={e => setEditing({ ...(editingRef.current ?? editing), value: e.target.value, caret: undefined })}
                          onKeyDown={e => {
                            e.stopPropagation()
                            if (e.key === 'Enter' && (e.altKey || e.ctrlKey || e.metaKey)) {
                              // Alt+Enter: a line break inside the cell (FR-003).
                              e.preventDefault()
                              const el = e.currentTarget, s = el.selectionStart, end = el.selectionEnd
                              const v = el.value.slice(0, s) + '\n' + el.value.slice(end)
                              setEditing({ ...(editingRef.current ?? editing), value: v, caret: s + 1 })
                              requestAnimationFrame(() => el.setSelectionRange(s + 1, s + 1))
                            }
                            else if (e.key === 'Enter') { e.preventDefault(); void commit(e.shiftKey ? 'up' : 'down') }
                            else if (e.key === 'Tab') { e.preventDefault(); void commit(e.shiftKey ? 'left' : 'right') }
                            else if (e.key === 'Escape') { e.preventDefault(); cancel() }
                          }}
                          onBlur={() => { if (editingRef.current) void commit('none') }}
                        />
                      )
                      : (
                        <input
                          className="fx-sheet-input"
                          autoFocus
                          value={editing.value}
                          aria-label={m.inputLabel(row, col)}
                          placeholder={m.inputPlaceholder?.(row, col)}
                          dir={m.inputDir?.(col)}
                          onFocus={e => {
                            const el = e.currentTarget
                            if (!el.value) return
                            if (editing.select) el.select()
                            else { const at = editing.caret ?? el.value.length; el.setSelectionRange(at, at) }
                          }}
                          onChange={e => setEditing({ ...(editingRef.current ?? editing), value: e.target.value, caret: undefined })}
                          onKeyDown={e => {
                            e.stopPropagation()
                            if (e.key === 'Enter') { e.preventDefault(); void commit(e.shiftKey ? 'up' : 'down') }
                            else if (e.key === 'Tab') { e.preventDefault(); void commit(e.shiftKey ? 'left' : 'right') }
                            else if (e.key === 'Escape') { e.preventDefault(); cancel() }
                          }}
                          onBlur={() => {
                            if (!editing) return
                            if (m.isDraft(row) && !editing.value.trim()) { cancel(); return }
                            void commit('none')
                          }}
                        />
                      ))
                    : (isNo && m.rowLabel ? m.rowLabel(row, i) : m.render(row, col, () => cells.current.get(key)))}
                  {isNo && m.onRowResize && (
                    <span className="fx-sheet-row-rz" aria-hidden="true" data-row-resize={row.key}
                          onPointerDown={e => startRowResize(row, e)}
                          onDoubleClick={e => { e.stopPropagation(); m.onRowResize?.(row, null) }} />
                  )}
                  {note && <span className="fx-sheet-cellnote" id={`${key}-note`} role="note">{note}</span>}
                </div>
              )
            })}
          </div>
        )
      })}
      {windowed && tops && last < m.rows.length && <div className="fx-sheet-spacer" aria-hidden="true" style={{ height: tops[m.rows.length] - tops[last] }} />}
    </div>
  )
}
