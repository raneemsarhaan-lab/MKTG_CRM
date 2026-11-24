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
 * Spec 017: several areas at once (Ctrl/Cmd+click and drag, Shift+F8). The
 * newest area is the one above (active cell + far corner); earlier ones are
 * kept by key in `extra`. Hosts get every area through `onSelect`.
 *
 * What a cell is and shows comes from the model; this file knows nothing about
 * clips, pieces, themes or blank sheets.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { parseClipboard, pastePlan, serialise, toGrid, toStyles } from '@/lib/sheet-clipboard'
import { edge as dataEdge, subtract, unionCells, copyLayout, MAX_AREAS, colLetters } from '@/lib/sheet-selection'
import type { CellCss } from '@/lib/sheet-format'
import type { CellStyle } from '@/types/index'
import type { FillMode } from '@/lib/sheet-fill'

export type GridCol = string
export interface ActiveCell { key: string; col: GridCol }

/** One cell a write touches: a row index into `rows`, a column index into `cols`. */
export interface CellWrite {
  r: number; c: number; value: string
  /** Spec 015: the pasted cell's look (null = none); absent for a text paste, which leaves formatting alone. */
  style?: CellStyle | null
}
export type WriteWhy = 'paste' | 'clear' | 'cut' | 'fill'
/** What a write didn't change, by reason (shown under the toolbar, FR-025). */
export type WriteResult = { skipped: Partial<Record<string, number>>; refused?: { r: number; c: number; value: string; note: string }[]; done?: number } | null
/** Spec 020: a border drag's drop. `to` is the block's new top-left; `shift` inserts (Shift); `only` is a right-drag's Values / Formats Only. */
export interface MoveRequest { from: GridRect; to: { r: number; c: number }; kind: 'move' | 'copy'; shift: 'down' | 'right' | null; only?: 'values' | 'formats' }

/** Where a context menu was asked for (FR-040). Indexes into `rows` and `cols`. */
export type MenuTarget =
  | { kind: 'cell'; r: number; c: number; rect: GridRect }
  | { kind: 'row'; r: number; rect: GridRect }
  | { kind: 'col'; c: number; rect: GridRect }
export interface GridRect { r0: number; c0: number; r1: number; c1: number }
/** Spec 017: what the grid can refuse with several areas. */
export type AreasNotice = 'cantCopy' | 'cantCut' | 'pasteBlock' | 'max'
/** Spec 020: a fill from one block into a larger one (the fill handle), or a drag back that clears. */
export interface FillRequest { from: GridRect; to: GridRect; mode: FillMode | 'clear'; insert: boolean; dir: 'down' | 'up' | 'right' | 'left' }
/** Spec 020: what a fill from this block can do, for the drag's tip and the menus. */
export interface FillInfo { def: 'copy' | 'series'; modes: FillMode[]; preview(mode: FillMode, to: GridRect): string }
const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
/** Ctrl+click on Windows and Linux, Cmd+click on a Mac (where Ctrl+click is the menu). */
const addKey = (e: { ctrlKey: boolean; metaKey: boolean }) => (IS_MAC ? e.metaKey : e.ctrlKey || e.metaKey)

export interface GridModel<R extends { key: string }> {
  rows: R[]
  /** Columns after the row number. */
  cols: GridCol[]
  widths: Record<GridCol, number>
  rowNoWidth: number
  label: string
  header(col: GridCol): { text: ReactNode; label?: string; className?: string; sort?: 'ascending' }
  /** Spec 015 stage 3: something after a heading's name (the linked sheets' filter button). */
  headerExtra?(col: GridCol): ReactNode
  /** Columns a row actually has; null = every column. A two-entry list spans its last cell. */
  colsOf?(row: R): GridCol[] | null
  rowProps(row: R, index: number): { className: string; level: number; expanded?: boolean; taskId?: string }
  cellRole(row: R, col: GridCol): 'rowheader' | 'gridcell'
  cellClass(row: R, col: GridCol): string
  isText(row: R, col: GridCol): boolean
  textValue(row: R, col: GridCol): string
  isMenu(row: R, col: GridCol): boolean
  /**
   * What Enter on the cell opens, for `aria-haspopup`: a menu, a list, a
   * dialog (a link prompt), or null for nothing (it opens a link or the task).
   * Absent, or undefined for a cell: every menu cell says "menu", as before.
   */
  popupKind?(row: R, col: GridCol): 'menu' | 'listbox' | 'dialog' | null | undefined
  render(row: R, col: GridCol, cellEl: () => HTMLElement | undefined): ReactNode
  describedBy?(row: R, col: GridCol): string | undefined
  isDraft(row: R): boolean
  inputLabel(row: R, col: GridCol): string
  inputPlaceholder?(row: R, col: GridCol): string | undefined
  inputDir?(col: GridCol): 'ltr' | undefined
  /** A code-like column (file names, sources, times): its editor neither spellchecks nor gets translated. */
  inputCode?(col: GridCol): boolean
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
  /**
   * A blank sheet's conventions: a row number selects its row (never takes
   * focus), Home goes to column A, and Tab just moves. The linked sheets keep
   * their row-number menu, Home onto the number, and Tab into the next field.
   */
  spreadsheet?: boolean
  /** Each heading shows its column letter (A, B, C…) above its name, like a spreadsheet. */
  letters?: boolean
  /** The text a copy takes from a cell (default: `textValue`, or the cell's shown text). */
  copyText?(row: R, col: GridCol): string
  /** Write many cells at once: paste, clear, cut. Indexes may run past the end on sheets that grow. */
  writeCells?(writes: CellWrite[], why: WriteWhy): Promise<WriteResult>
  /** A paste the sheet wants to read as new rows instead of filling cells (FR-026). */
  pasteAsRows?(grid: string[][], row: R | null, col: GridCol | null): boolean
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
  /** Tells the host what is selected, for the toolbar and screen readers. `areas` lists every area, the newest (`rect`) last (spec 017). */
  onSelect?(rect: GridRect, areas: GridRect[]): void
  /** Spec 017: something the grid refused with several areas, for the host to say. */
  onAreasNotice?(key: AreasNotice): void
  /** Spec 017: Add to selection (Shift+F8) turned on or off. */
  onAddMode?(on: boolean): void
  /** Spec 019: a heading after the last column (the ＋ that adds a field or a column). */
  tailHeader?: ReactNode
  /** Spec 019: a group heading drawn above a row (rows grouped by theme, stage…), or null. */
  rowBand?(row: R, index: number): ReactNode | null
  /** A band's height (default 30): a theme and its first pillar take two lines. */
  rowBandHeight?(row: R, index: number): number
  /** Row-number labels, when they aren't 1, 2, 3 (the linked sheets show clip numbers). */
  rowLabel?(row: R, index: number): ReactNode

  // ── spec 015 ──
  /**
   * A cell's formatting, as `toCss` gives it (cached per style): the cell's
   * font, colours and alignment, rotated text, and a border overlay. The
   * value the model renders stays its own (number formats are applied there).
   */
  cellStyle?(row: R, col: GridCol): CellCss | null
  /** Spec 020 tips 13, 107–111: dragging the selection's border moves or copies it. */
  onMove?(req: MoveRequest): GridRect | null | void
  /** A right-drag's drop: the host's menu (Move Here, Copy Here, … with Excel's keys). */
  onMoveMenu?(req: MoveRequest, at: { x: number; y: number }, anchor: HTMLElement): void
  /** Shift inserts (team sheets); without it, Shift is ignored. */
  moveShift?: boolean
  /** What the drag's tip says ("E2:F5", "Insert copy: A6:C6"). */
  moveTip?(req: MoveRequest): string
  /** Alt held over a sheet tab: the host carries the block to that sheet. */
  onMoveToTab?(tab: string, from: GridRect, grab: { r: number; c: number }, copy: boolean): void
  /** A block carried here from another sheet: follow the pointer, then drop it (null: cancelled). */
  incoming?: { h: number; w: number; dr: number; dc: number; n: number } | null
  onIncoming?(to: { r: number; c: number } | null): void
  /** Spec 020 tip 80: what the top-left corner shows (the outline's level buttons). */
  corner?(): ReactNode
  /** Spec 020: what was just copied here (Paste Special › Validation and Column widths need the cells it came from). */
  onCopied?(rect: GridRect, grid: string[][]): void
  /** Spec 020 tip 28: a conditional-format icon drawn before the value; `only` shows the icon without the value. */
  cellIcon?(row: R, col: GridCol): { node: ReactNode; only: boolean } | null
  /** The look a copy carries to Excel and Google Sheets, and the text as shown (EGP 12,500.00). */
  copyStyle?(row: R, col: GridCol): CellStyle | null
  copyShown?(row: R, col: GridCol): string
  /**
   * Merged cells (blank sheets): the top-left cell is drawn over the area,
   * `{ width, height }` in px; the cells under it are 'covered'.
   */
  cellSpan?(row: R, col: GridCol): { width: number; height: number } | 'covered' | null
  /** The cell has open comments: a corner marker; hovering it shows the thread. */
  marked?(row: R, col: GridCol): boolean
  /** Spec 015 stage 2: Freeze Panes. The first N rows and columns stay in view while scrolling. */
  frozenRows?: number
  frozenCols?: number

  // ── spec 020 ──
  /** The fill handle: what a fill from `from` toward `dir` can do; null = no handle here. */
  fillInfo?(from: GridRect, dir: FillRequest['dir']): FillInfo | null
  /** A fill (drag, double-click), or Auto Fill Options' pick (`again` replaces the last fill). */
  onFill?(f: FillRequest, again: boolean): void
  /** The right-drag menu and the Auto Fill Options button: the host shows its menu here. */
  onFillMenu?(f: FillRequest, at: { x: number; y: number }, anchor: HTMLElement, kind: 'right' | 'options' | 'flash', run: (mode: FillMode) => void): void
  /** F4 (and Ctrl+Y with nothing to redo, decided by the host): repeat the last action. */
  onRepeat?(): void
  /** Ctrl+E: Flash Fill the active column. */
  onFlashFill?(): void
  /** Alt+↓ on a text cell, or a click on the validation ▾: the host opens its list. True when handled. */
  pickList?(row: R, col: GridCol, anchor: HTMLElement, from: 'keys' | 'button'): boolean
  /** A validated cell: show the ▾ beside it when selected (a list with In-cell dropdown), and its input message. */
  validation?(row: R, col: GridCol): { dropdown: boolean; input: { title: string; msg: string } | null } | null
  /** The grid's zoom (1 = 100%); Ctrl+wheel and Ctrl+= / − / 0 ask for another (50%–200%). */
  zoom?: number
  onZoom?(z: number): void
  /** What Ctrl+; and Ctrl+Shift+; type (today's date, the time), in the sheet's style. */
  nowText?(kind: 'date' | 'time'): string
  /** Names for the grid's own controls (the fill handle, Auto Fill Options, the validation ▾). */
  controlLabels?: { handle: string; options: string; dropdown: string }
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
  /** Spec 020: select these areas after the next render (Go To Special's result). */
  selectAreas?: GridRect[] | null
  /** Spec 020: edit this cell again with this text (a validation alert's Retry); `n` makes each ask new. */
  editAgain?: { key: string; col: GridCol; value: string; n: number } | null
  /** Spec 020: show the options button for this block (Flash Fill Options), until the next action. */
  optionsAt?: { to: GridRect; n: number } | null
}

export const cellKey = (rowKey: string, col: GridCol) => `${rowKey}|${col}`
/** Spec 020: the workbook's zoom for the open sheet, for grids it doesn't render (the Content and Video sheets). */
export const ZOOM_EVENT = 'momentum:sheet-zoom'
/** The zoom as the workbook last set it (a linked grid that mounts later reads it here), and how to change it. */
export const zoomBus: { z: number; set: ((z: number) => void) | null } = { z: 1, set: null }
/** The workspace's custom lists for the fill handle, as the workbook loaded them. */
export const tipsBus: { lists: string[][] } = { lists: [] }
/** A linked grid's status-bar news: the mode text (undefined = unchanged, null = Ready) and the selection's figures. */
export const STATUS_EVENT = 'momentum:sheet-status'

export const ROW_H = 24
/** Rows beyond which only the visible part is rendered (R7). */
const WINDOW_AT = 150
/** Spec 019: a group heading's height. */
const BAND_H = 30
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

export function GridCore<R extends { key: string }>({ model: m, active: activeIn, setActive, editDraft, notes, onNote, selectRect, selectAreas, editAgain, optionsAt }: GridCoreProps<R>) {
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
  const template = `${m.rowNoWidth}px ${m.cols.map(c => `${widthOf(c)}px`).join(' ')}${m.tailHeader ? ' 40px' : ''}`
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

  /** A cell's `aria-haspopup`: the model's own answer, or "menu" for a menu cell (Drop and Archive just act). */
  const popupOf = (row: R, col: GridCol, menu: boolean) => {
    const kind = m.popupKind?.(row, col)
    if (kind !== undefined) return kind ?? undefined
    return menu && col !== 'drop' && col !== 'archive' ? 'menu' as const : undefined
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

  // ── several areas (spec 017) ──────────────────────────────────────────────
  /** Earlier areas, by key so they survive re-renders; the newest area is `rect`. */
  const [extra, setExtraState] = useState<{ a: ActiveCell; b: ActiveCell }[]>([])
  const extraRef = useRef(extra)
  const setExtra = (v: { a: ActiveCell; b: ActiveCell }[]) => { if (v.length || extraRef.current.length) { extraRef.current = v; setExtraState(v) } }
  /** Shift+F8, Add to selection: moves keep the areas; `fresh` = the newest area is just the cursor. */
  const [adding, setAddingState] = useState(false)
  const addingRef = useRef(false), fresh = useRef(false)
  const setAdding = (on: boolean) => { addingRef.current = on; fresh.current = false; setAddingState(on) }
  /** A Ctrl+drag that started on selected cells takes them out (FR-006). */
  const [unsel, setUnselState] = useState<GridRect | null>(null)
  const unselRef = useRef<GridRect | null>(null)
  const setUnsel = (q: GridRect | null) => { unselRef.current = q; setUnselState(q) }
  const removeFrom = useRef<{ r: number; c: number } | null>(null)
  const extraRects: GridRect[] = []
  if (m.selection) for (const x of extra) {
    const r0 = rowIndex.get(x.a.key), r1 = rowIndex.get(x.b.key), c0 = m.cols.indexOf(x.a.col), c1 = m.cols.indexOf(x.b.col)
    if (r0 === undefined || r1 === undefined || c0 < 0 || c1 < 0) continue
    extraRects.push({ r0: Math.min(r0, r1), c0: Math.min(c0, c1), r1: Math.max(r0, r1), c1: Math.max(c0, c1) })
  }
  const areas = [...extraRects, rect]
  const many = areas.length > 1
  const showSel = multi || many
  const areasRef = useRef(areas)
  areasRef.current = areas
  const inAreas = (r: number, c: number) => { for (const q of areas) if (r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1) return true; return false }
  const keysOf = (q: GridRect) => ({ a: { key: m.rows[q.r0].key, col: m.cols[q.c0] }, b: { key: m.rows[q.r1].key, col: m.cols[q.c1] } })
  /** Keep the newest area and start another (Ctrl+click): false at the cap. */
  function pushCurrent(): boolean {
    if (!m.rows[rect.r1] || !m.cols[rect.c1]) return false
    if (areasRef.current.length >= MAX_AREAS) { m.onAreasNotice?.('max'); return false }
    setExtra([...extraRef.current, keysOf(rect)])
    return true
  }
  /** Make these areas the selection: the last becomes the newest (active at its top-left). */
  function setAreas(list: GridRect[]) {
    const last = list[list.length - 1]
    if (!last) return
    setExtra(list.slice(0, -1).map(keysOf))
    wantFocus.current = true
    setActive({ key: m.rows[last.r0].key, col: m.cols[last.c0] })
    setFocusEnd({ key: m.rows[last.r1].key, col: m.cols[last.c1] })
  }

  // The document-level drag handlers read these, so they always see this render's rows.
  const live = useRef({ rowIndex, cols: m.cols, setAreas })
  live.current = { rowIndex, cols: m.cols, setAreas }

  const sig = areas.map(q => `${q.r0},${q.c0},${q.r1},${q.c1}`).join(';')
  useEffect(() => { m.onSelect?.(rectRef.current, areasRef.current) }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { m.onAddMode?.(adding) }, [adding]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Select a block by indexes: the active cell is its top-left (or `anchor` when given). `keep` adds it as a new area. */
  const selectBlock = useCallback((q: GridRect, anchor?: { r: number; c: number }, keep = false) => {
    const ar = anchor?.r ?? q.r0, acc = anchor?.c ?? q.c0
    const a = m.rows[Math.min(ar, m.rows.length - 1)], b = m.rows[Math.min(ar === q.r0 ? q.r1 : q.r0, m.rows.length - 1)]
    if (!a || !b) return
    if (!keep) { extraRef.current = []; setExtraState(x => (x.length ? [] : x)) }
    wantFocus.current = true
    setActive({ key: a.key, col: m.cols[Math.min(acc, m.cols.length - 1)] })
    setFocusEnd({ key: b.key, col: m.cols[Math.min(acc === q.c0 ? q.c1 : q.c0, m.cols.length - 1)] })
  }, [m.rows, m.cols, setActive])

  // A paste's result becomes the selection (FR-025), once its rows exist.
  useEffect(() => {
    if (!selectRect || !m.selection || selectRect.r1 >= m.rows.length) return
    selectBlock(selectRect)
  }, [selectRect, m.rows.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // Spec 020: Go To Special's areas become the selection.
  useEffect(() => {
    if (!selectAreas?.length || !m.selection || selectAreas.some(q => q.r1 >= m.rows.length || q.c1 >= m.cols.length)) return
    setAreas(selectAreas)
  }, [selectAreas]) // eslint-disable-line react-hooks/exhaustive-deps

  const dragging = useRef(false)
  const cutRect = useRef<GridRect | null>(null)
  const [cutMark, setCutMark] = useState<GridRect | null>(null)

  // ── windowing (spec 013 R7) ───────────────────────────────────────────────
  const windowed = m.rows.length > WINDOW_AT
  const tops = useMemo(() => {
    if (!windowed) return null
    const t = new Array<number>(m.rows.length + 1)
    t[0] = 0
    for (let i = 0; i < m.rows.length; i++) t[i + 1] = t[i] + (heightOf(m.rows[i]) ?? ROW_H) + (m.rowBand?.(m.rows[i], i) ? (m.rowBandHeight?.(m.rows[i], i) ?? BAND_H) : 0)
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
  const z = m.zoom && m.zoom > 0 ? m.zoom : 1
  /** The sticky heading row; its height (26px, 46px with column letters) is measured, not assumed. */
  const headRef = useRef<HTMLDivElement>(null)
  const headH = () => headRef.current?.getBoundingClientRect().height ?? (m.letters ? 46 : 26) * z
  const first = windowed ? Math.max(0, find(view.top / z - (m.letters ? 46 : 26)) - OVERSCAN) : 0
  const last = windowed ? Math.min(m.rows.length, find((view.top + view.height) / z) + OVERSCAN + 1) : m.rows.length

  useLayoutEffect(() => {
    if (!wantFocus.current || !active || editing) return
    const el = cells.current.get(cellKey(active.key, active.col))
    if (!el) {
      // Off-screen in a windowed sheet: scroll it into view; the next render focuses it.
      const i = rowIndex.get(active.key)
      const sc = scroller()
      if (windowed && tops && i !== undefined && sc) {
        // Rows sit under the heading row; frozen rows stick below it and cover what scrolls under them.
        const head = headH(), frozen = F && i >= F ? (tops[F] - tops[0]) * z : 0
        const y = head + tops[i] * z, h = (tops[i + 1] - tops[i]) * z
        if (y < sc.scrollTop + head + frozen) sc.scrollTop = Math.max(0, y - head - frozen)
        else if (y + h > sc.scrollTop + sc.clientHeight) sc.scrollTop = y + h - sc.clientHeight + 4
        setView({ top: sc.scrollTop, height: sc.clientHeight })
      }
      return
    }
    wantFocus.current = false
    el.focus({ preventScroll: true })
    reveal(el)
  })

  /**
   * Scroll a cell fully into view: past the edges, as scrollIntoView does, and
   * out from under what sticks (the heading row, frozen rows, the row number,
   * the title and frozen columns), which scrollIntoView can't see.
   */
  function reveal(el: HTMLElement) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const sc = scroller(), grid = gridRef.current
    if (!sc || !grid) return
    const b = el.getBoundingClientRect()
    const rowEl = el.parentElement
    let top = headRef.current?.getBoundingClientRect().bottom ?? b.top
    if (rowEl && !rowEl.classList.contains('is-frozen-row')) {
      grid.querySelectorAll<HTMLElement>(':scope > .is-frozen-row').forEach(r => { top = Math.max(top, r.getBoundingClientRect().bottom) })
    }
    if (b.top < top) sc.scrollTop -= top - b.top
    // Sideways: only a cell that scrolls can be covered by the sticky cells beside it.
    if (!rowEl || getComputedStyle(el).position === 'sticky') return
    const rtl = getComputedStyle(grid).direction === 'rtl'
    let edge: number | null = null
    for (const c of Array.from(rowEl.children) as HTMLElement[]) {
      if (c === el || getComputedStyle(c).position !== 'sticky') continue
      const r = c.getBoundingClientRect()
      edge = rtl ? Math.min(edge ?? r.left, r.left) : Math.max(edge ?? r.right, r.right)
    }
    if (edge === null) return
    if (!rtl && b.left < edge) sc.scrollLeft -= edge - b.left
    if (rtl && b.right > edge) sc.scrollLeft += b.right - edge
  }

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
    if (!keepRange) {
      // Add to selection (Shift+F8): the first move keeps the area just made; the cursor is a new one.
      if (addingRef.current) { if (!fresh.current && pushCurrent()) fresh.current = true }
      else setExtra([])
      setFocusEnd(null)
    }
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
    const ri = m.rows.findIndex(r => r.key === key)
    const row = m.rows[ri]
    if (!row) return
    if (m.isDraft(row)) {
      m.onCancelDraft(row)
      // Focus goes back where the draft came from: its "+ Clip" / "+ Piece" row below, else the row above.
      const next = m.rows.slice(ri + 1).find(r => !m.isDraft(r)) ?? m.rows.slice(0, ri).reverse().find(r => !m.isDraft(r))
      if (next) focusCell(next, col)
    }
    else focusCell(row, col)
  }

  /** The multi-line editor grows to show all its text (never shorter than its cell), as in Excel. */
  const fitEditor = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.parentElement?.clientHeight ?? 0, el.scrollHeight)}px`
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
        if (!m.spreadsheet) setEditing({ key: row.key, col: cc, value: m.textValue(row, cc), select: true })
        return
      }
    }
    focusCell(m.rows[ri], col)
  }

  // ── notes, said aloud ───────────────────────────────────────────────────────
  const liveRef = useRef<HTMLDivElement>(null)
  const [said, setSaid] = useState('')
  const notesBefore = useRef(notes)
  useEffect(() => {
    const before = notesBefore.current
    notesBefore.current = notes
    const fresh = Object.entries(notes).find(([k, v]) => v && before[k] !== v)?.[1]
    if (!fresh) return
    // The sheet may already be saying it ("Not saved: …" in its toast): once is enough.
    const elsewhere = Array.from(document.querySelectorAll('[aria-live], [role="status"], [role="alert"]'))
      .some(el => el !== liveRef.current && !gridRef.current?.contains(el) && !!el.textContent?.includes(fresh))
    // The same note twice in a row still changes the region's text, so it is said again.
    if (!elsewhere) setSaid(s => (s === fresh ? `${fresh}\u00a0` : fresh))
  }, [notes])

  // ── clipboard (spec 013 R4, FR-020–FR-026) ────────────────────────────────
  const readText = (row: R, col: GridCol) => {
    if (m.copyText) return m.copyText(row, col)
    if (m.isText(row, col)) return m.textValue(row, col)
    return cells.current.get(cellKey(row.key, col))?.innerText.trim() ?? ''
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
      // Several areas (FR-011): one block when they share rows (side by side) or columns (stacked).
      const list = areasRef.current
      const layout = copyLayout(list)
      if (list.length > 1 && (cut || !layout)) { e.preventDefault(); m.onAreasNotice?.(cut ? 'cantCut' : 'cantCopy'); return }
      const one = <T,>(a: GridRect, fn: (row: R, col: GridCol) => T, empty: T): T[][] => {
        const out: T[][] = []
        for (let r = a.r0; r <= a.r1; r++) {
          const row = m.rows[r], own = row ? colsFor(row) : []
          const line: T[] = []
          for (let c = a.c0; c <= a.c1; c++) line.push(row && own.includes(m.cols[c]) ? fn(row, m.cols[c]) : empty)
          out.push(line)
        }
        return out
      }
      const each = <T,>(fn: (row: R, col: GridCol) => T, empty: T): T[][] => {
        if (!layout || layout.kind === 'one') return one(q, fn, empty)
        const parts = layout.order.map(a => one(a, fn, empty))
        return layout.kind === 'cols' ? parts.flat() : parts[0].map((_, r) => parts.flatMap(p => p[r]))
      }
      const { html, text } = serialise(each(readText, ''), {
        styles: m.copyStyle ? each(m.copyStyle, null) : undefined,
        shown: m.copyShown ? each(m.copyShown, '') : undefined,
      })
      e.clipboardData.setData('text/plain', text)
      e.clipboardData.setData('text/html', html)
      e.preventDefault()
      if (list.length === 1) m.onCopied?.(q, each(readText, ''))
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
      const clip = parseClipboard({ html, text }, new DOMParser())
      const g = toGrid(clip)
      if (!g.length) return
      if (m.pasteAsRows?.(g, row, col)) { m.onPaste(e, row, col); return }
      e.preventDefault()
      const styles = toStyles(clip)
      const one = g.length === 1 && g[0].length === 1
      // Several areas (FR-012): one copied cell fills every selected cell; a block needs one area.
      if (areasRef.current.length > 1) {
        cutRect.current = null; setCutMark(null)
        if (!one) { m.onAreasNotice?.('pasteBlock'); return }
        const fillAll: CellWrite[] = unionCells(areasRef.current).map(({ r, c }) => {
          const w: CellWrite = { r, c, value: g[0][0] }
          if (styles) w.style = styles[0]?.[0] ?? null
          return w
        })
        reportSkips(await writes.current(fillAll, 'paste'))
        return
      }
      const plan = pastePlan(g, q)
      const list: CellWrite[] = []
      for (let r = 0; r < plan.rows; r++) for (let c = 0; c < plan.cols; c++) {
        const w: CellWrite = { r: q.r0 + r, c: q.c0 + c, value: plan.value(r, c) }
        if (styles) w.style = (one ? styles[0]?.[0] : styles[r]?.[c]) ?? null
        list.push(w)
      }
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
    if (!writes.current) return false
    // Every selected cell once, across every area (FR-009): one write, one undo step.
    const list: CellWrite[] = unionCells(areasRef.current).map(({ r, c }) => ({ r, c, value: '' }))
    reportSkips(await writes.current(list, 'clear'))
    return true
  }

  /** Ctrl/Cmd+Enter (FR-010): the value being typed goes into every selected cell. */
  async function fillSelection() {
    const cur = editingRef.current
    if (!cur || committing.current) return
    const list = unionCells(areasRef.current)
    if (!writes.current || list.length <= 1) { void commit('none'); return }
    committing.current = true
    setEditing(null)
    const res = await writes.current(list.map(({ r, c }) => ({ r, c, value: cur.value })), 'paste')
    committing.current = false
    reportSkips(res)
    wantFocus.current = true
    setTick(t => t + 1)
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
    if (lastFill && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) setLastFill(null)
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
    // Shift+F8 (spec 017 FR-015): Add to selection on and off.
    if (e.key === 'F8' && e.shiftKey && m.selection) { e.preventDefault(); setAdding(!addingRef.current); return }
    if (e.key === 'Escape' && addingRef.current) { e.preventDefault(); setAdding(false); return }
    // Select all (FR-010).
    if (ctrl && (e.key === 'a' || e.key === 'A') && m.selection && m.rows.length && m.cols.length) {
      e.preventDefault()
      selectBlock({ r0: 0, c0: 0, r1: m.rows.length - 1, c1: m.cols.length - 1 })
      return
    }
    // Spec 020: Shift+Space the row, Ctrl+Space the column, Ctrl+Shift+Space everything (tip 2).
    if (e.key === ' ' && m.selection && (e.shiftKey || ctrl) && !e.altKey && m.rows.length && m.cols.length) {
      e.preventDefault()
      const cc = Math.max(0, m.cols.indexOf(active.col))
      if (e.shiftKey && ctrl) selectBlock({ r0: 0, c0: 0, r1: m.rows.length - 1, c1: m.cols.length - 1 })
      else if (e.shiftKey) selectBlock({ r0: ri, c0: 0, r1: ri, c1: m.cols.length - 1 })
      else selectBlock({ r0: 0, c0: cc, r1: m.rows.length - 1, c1: cc })
      return
    }
    // F4: repeat the last action (tip 93).
    if (e.key === 'F4' && !ctrl && !e.altKey && m.onRepeat) { e.preventDefault(); m.onRepeat(); return }
    // Ctrl+E: Flash Fill (tip 14).
    if (ctrl && !e.altKey && !e.shiftKey && (e.key === 'e' || e.key === 'E') && m.onFlashFill) { e.preventDefault(); m.onFlashFill(); return }
    // Ctrl+; today's date, Ctrl+Shift+; the time (tip 16): typed into the cell, not yet saved.
    if (ctrl && !e.altKey && (e.code === 'Semicolon' || e.key === ';' || e.key === ':') && m.nowText) {
      e.preventDefault()
      if (m.isText(row, active.col)) startEdit(row, active.col, m.nowText(e.shiftKey || e.key === ':' ? 'time' : 'date'))
      return
    }
    // Ctrl+= / Ctrl+− / Ctrl+0: zoom in, out, back to 100%.
    if (ctrl && !e.altKey && m.onZoom && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
      e.preventDefault()
      m.onZoom(e.key === '0' ? 1 : Math.round(Math.max(0.5, Math.min(2, z + (e.key === '-' ? -0.1 : 0.1))) * 100) / 100)
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
      fresh.current = false
      const rr = Math.max(0, Math.min(m.rows.length - 1, r))
      const cc = Math.max(0, Math.min(m.cols.length - 1, c))
      setFocusEnd({ key: m.rows[rr].key, col: m.cols[cc] })
      const el = cells.current.get(cellKey(m.rows[rr].key, m.cols[cc]))
      if (el) reveal(el)
    }
    /** Left/right on a spanning row: step over the span. */
    const sideways = (dir: 1 | -1) => {
      const own = colsFor(row)
      const at = own.indexOf(active.col)
      const next = own[at + dir]
      if (next) { e.preventDefault(); focusCell(row, next) } else e.preventDefault()
    }
    // Spec 020: Alt+↓ on a text cell picks from the column's values (Excel's Pick From Drop-down List).
    if (e.altKey && e.key === 'ArrowDown' && m.pickList && active.col !== 'rowNo' && m.isText(row, active.col) && m.pickList(row, active.col, target, 'keys')) {
      e.preventDefault()
      return
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
      const from = e.shiftKey && fi !== undefined && fc >= 0 ? { r: fi, c: fc } : { r: ri, c: m.cols.indexOf(active.col) }
      const filled = (r: number, c: number) => { const rw = m.rows[r]; return !!rw && readText(rw, m.cols[c]) !== '' }
      const dr = dir === 'down' ? 1 : dir === 'up' ? -1 : 0, dc = dir === 'right' ? 1 : dir === 'left' ? -1 : 0
      // Ctrl/Cmd+arrow: the edge of the data (FR-004).
      const to = ctrl ? dataEdge({ r: from.r, c: Math.max(0, from.c) }, dir, m.rows.length, m.cols.length, filled) : { r: from.r + dr, c: from.c + dc }
      if (e.shiftKey) { extendTo(to.r, Math.max(0, to.c)); return }
      if (active.col === 'rowNo' && dir === 'left') { e.preventDefault(); return }
      // A blank sheet's row numbers aren't cells: Left stops at column A.
      if (m.spreadsheet && to.c < 0) { e.preventDefault(); return }
      return go(to.r, to.c + 1)
    }
    switch (e.key) {
      case 'ArrowDown':  return go(ri + 1, ci)
      case 'ArrowUp':    return go(ri - 1, ci)
      case 'ArrowRight': return colsFor(row) === allCols ? go(ri, ci + (rtl ? -1 : 1)) : sideways(rtl ? -1 : 1)
      case 'ArrowLeft':  return colsFor(row) === allCols ? go(ri, ci + (rtl ? 1 : -1)) : sideways(rtl ? 1 : -1)
      case 'Home':       return ctrl ? go(0, m.spreadsheet ? 1 : 0) : go(ri, m.spreadsheet ? 1 : 0)
      case 'End':        return ctrl ? go(m.rows.length - 1, allCols.length - 1) : go(ri, allCols.length - 1)
      case 'PageDown': {
        const page = Math.max(1, Math.floor((scroller()?.clientHeight ?? 400) / (ROW_H * z)) - 1)
        return go(ri + (m.selection ? page : 15), ci)
      }
      case 'PageUp': {
        const page = Math.max(1, Math.floor((scroller()?.clientHeight ?? 400) / (ROW_H * z)) - 1)
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
    // On a linked sheet, Delete on a title or a non-text cell keeps its own meaning (drop a clip, clear a choice).
    const ownDelete = !!m.onDelete && (active.col === 'title' || !m.isText(row, active.col))
    if ((e.key === 'Delete' || e.key === 'Backspace') && m.writeCells && active.col !== 'rowNo' && (showSel || (m.selection && !ownDelete))) {
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
      // The selection stays while typing, so Ctrl+Enter can fill it (spec 017 FR-010).
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
      return
    }
    // Spec 020: typing into a cell that can't take it (a locked cell on a protected sheet) says why, as Excel does.
    if (e.key.length === 1 && !ctrl && !e.altKey && m.spreadsheet && active.col !== 'rowNo' && !m.isText(row, active.col)) {
      const note = m.readOnlyNote?.(row, active.col)
      if (note) { e.preventDefault(); onNote(cellKey(row.key, active.col), note) }
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
      const from = removeFrom.current
      if (from) {
        // Ctrl+drag over selected cells: the dashed block they leave (FR-006).
        const r = live.current.rowIndex.get(key), c = live.current.cols.indexOf(col)
        if (r === undefined || c < 0) return
        const q = { r0: Math.min(from.r, r), c0: Math.min(from.c, c), r1: Math.max(from.r, r), c1: Math.max(from.c, c) }
        const u = unselRef.current
        if (!u || u.r0 !== q.r0 || u.c0 !== q.c0 || u.r1 !== q.r1 || u.c1 !== q.c1) setUnsel(q)
        return
      }
      setFocusEnd(f => (f && f.key === key && f.col === col ? f : { key, col }))
    }
    const up = () => {
      dragging.current = false; cancelAnimationFrame(raf); raf = 0
      const from = removeFrom.current
      if (!from) return
      removeFrom.current = null
      const cut = unselRef.current ?? { r0: from.r, c0: from.c, r1: from.r, c1: from.c }
      setUnsel(null)
      const left = subtract(areasRef.current, cut)
      // Nothing left: the clicked cell becomes the selection.
      live.current.setAreas(left.length ? left : [{ r0: from.r, c0: from.c, r1: from.r, c1: from.c }])
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); cancelAnimationFrame(raf) }
  }, [m.selection]) // eslint-disable-line react-hooks/exhaustive-deps


  // ── spec 020: the fill handle (research R4) ──────────────────────────────
  type FillDrag = FillRequest & { right: boolean; info: FillInfo; ctrl: boolean }
  const [fillDrag, setFillDragState] = useState<FillDrag | null>(null)
  const fillRef = useRef<FillDrag | null>(null)
  const setFillDrag = (v: FillDrag | null) => { fillRef.current = v; setFillDragState(v) }
  /** The last fill, for the Auto Fill Options button; gone with the next action. */
  const [lastFill, setLastFill] = useState<FillRequest | null>(null)
  const lastFillRef = useRef(lastFill)
  lastFillRef.current = lastFill
  useEffect(() => {
    const lf = lastFillRef.current
    if (lf && (rect.r0 !== lf.to.r0 || rect.r1 !== lf.to.r1 || rect.c0 !== lf.to.c0 || rect.c1 !== lf.to.c1 || many)) setLastFill(null)
  }, [sig]) // eslint-disable-line react-hooks/exhaustive-deps
  const canFill = !!m.onFill && !!m.fillInfo && !!m.selection && !many && !editing
  const swap = (d: 'copy' | 'series'): FillMode => (d === 'copy' ? 'series' : 'copy')
  /** Where a pointer over cell (r, c) takes a fill from `from`: out along the longer way, or back inside to clear. */
  function fillTarget(from: GridRect, r: number, c: number): { to: GridRect; dir: FillRequest['dir']; clear: boolean } {
    const dDown = r - from.r1, dUp = from.r0 - r, dRight = c - from.c1, dLeft = from.c0 - c
    const outV = Math.max(dDown, dUp), outH = Math.max(dRight, dLeft)
    if (outV <= 0 && outH <= 0) {
      const backV = from.r1 - r, backH = from.c1 - c
      if (backV > 0 && backV >= backH) return { to: { ...from, r1: r }, dir: 'up', clear: true }
      if (backH > 0) return { to: { ...from, c1: c }, dir: 'left', clear: true }
      return { to: from, dir: 'down', clear: false }
    }
    if (outV >= outH) return dDown > 0 ? { to: { ...from, r1: r }, dir: 'down', clear: false } : { to: { ...from, r0: r }, dir: 'up', clear: false }
    return dRight > 0 ? { to: { ...from, c1: c }, dir: 'right', clear: false } : { to: { ...from, c0: c }, dir: 'left', clear: false }
  }
  /** Run a fill and select what it filled (as Excel); `again` replaces the last fill (Auto Fill Options). */
  function doFill(req: FillRequest, again: boolean) {
    m.onFill?.(req, again)
    if (req.mode === 'clear') { setLastFill(null); selectBlock(req.to); return }
    lastFillRef.current = req
    setLastFill(req)
    selectBlock(req.to)
  }
  const fillRun = (req: FillRequest, again: boolean) => (mode: FillMode) => doFill({ ...req, mode }, again)
  // Flash Fill Options: the host's button over the cells Ctrl+E filled ('flash' marks it).
  useEffect(() => {
    if (!optionsAt) return
    const req: FillRequest = { from: optionsAt.to, to: optionsAt.to, mode: 'flash', insert: false, dir: 'down' }
    lastFillRef.current = req
    setLastFill(req)
  }, [optionsAt?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  // A validation alert's Retry: back into the cell with what was typed.
  useEffect(() => {
    if (!editAgain) return
    const row = m.rows.find(r => r.key === editAgain.key)
    if (!row) return
    setActive({ key: row.key, col: editAgain.col })
    setEditing({ key: row.key, col: editAgain.col, value: editAgain.value, select: true })
  }, [editAgain?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  function startFill(e: React.PointerEvent<HTMLElement>) {
    if (!canFill || (e.button !== 0 && e.button !== 2)) return
    e.preventDefault(); e.stopPropagation()
    const from = rectRef.current
    const info = m.fillInfo?.(from, 'down')
    if (!info) return
    setLastFill(null)
    setFillDrag({ from, to: from, dir: 'down', mode: info.def, insert: false, right: e.button === 2, info, ctrl: addKey(e) })
  }
  useEffect(() => {
    if (!fillDrag) return
    let raf = 0, lastX = 0, lastY = 0
    const tickScroll = () => {
      const sc = scroller()
      if (!fillRef.current || !sc) return
      const b = sc.getBoundingClientRect()
      const dy = lastY < b.top + 30 ? -18 : lastY > b.bottom - 20 ? 18 : 0
      const dx = lastX < b.left + 20 ? -18 : lastX > b.right - 20 ? 18 : 0
      if (dx || dy) sc.scrollBy(dx, dy)
      raf = requestAnimationFrame(tickScroll)
    }
    const move = (e: PointerEvent) => {
      const cur = fillRef.current
      if (!cur) return
      lastX = e.clientX; lastY = e.clientY
      if (!raf) raf = requestAnimationFrame(tickScroll)
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-cell]')
      if (!el || !gridRef.current?.contains(el)) return
      const r = live.current.rowIndex.get(el.dataset.rowKey ?? ''), c = live.current.cols.indexOf(el.dataset.col ?? '')
      if (r === undefined || c < 0) return
      const t = fillTarget(cur.from, r, c)
      const ctrl = IS_MAC ? e.metaKey : e.ctrlKey || e.metaKey
      const mode: FillRequest['mode'] = t.clear ? 'clear' : ctrl !== cur.ctrl ? swap(cur.info.def) : cur.info.def
      const same = cur.to.r0 === t.to.r0 && cur.to.r1 === t.to.r1 && cur.to.c0 === t.to.c0 && cur.to.c1 === t.to.c1 && cur.mode === mode && cur.insert === e.shiftKey
      if (!same) setFillDrag({ ...cur, to: t.to, dir: t.dir, mode, insert: e.shiftKey && !t.clear })
    }
    const up = (e: PointerEvent) => {
      cancelAnimationFrame(raf); raf = 0
      const cur = fillRef.current
      setFillDrag(null)
      if (!cur) return
      const req: FillRequest = { from: cur.from, to: cur.to, mode: cur.mode, insert: cur.insert, dir: cur.dir }
      const unchanged = cur.to.r0 === cur.from.r0 && cur.to.r1 === cur.from.r1 && cur.to.c0 === cur.from.c0 && cur.to.c1 === cur.from.c1
      if (unchanged) return
      if (cur.right && cur.mode !== 'clear' && m.onFillMenu) {
        const anchor = cells.current.get(cellKey(m.rows[cur.to.r1]?.key ?? '', m.cols[cur.to.c1] ?? '')) ?? gridRef.current
        if (anchor) m.onFillMenu(req, { x: e.clientX, y: e.clientY }, anchor, 'right', fillRun(req, false))
        return
      }
      doFill(req, false)
    }
    // The right-drag's own context menu would cover ours.
    const noMenu = (e: Event) => { if (fillRef.current?.right) e.preventDefault() }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('contextmenu', noMenu, true)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('contextmenu', noMenu, true); cancelAnimationFrame(raf) }
  }, [!!fillDrag]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Double-click the handle: down as far as the column beside it has data. */
  function fillDownToEnd() {
    if (!canFill) return
    const from = rectRef.current
    const info = m.fillInfo?.(from, 'down')
    if (!info) return
    const has = (r: number, c: number) => { const rw = m.rows[r]; return c >= 0 && c < m.cols.length && !!rw && readText(rw, m.cols[c]) !== '' }
    let side = from.c0 - 1
    if (!has(from.r1 + 1, side)) side = from.c1 + 1
    let end = from.r1
    while (end + 1 < m.rows.length && has(end + 1, side)) end++
    if (end > from.r1) doFill({ from, to: { ...from, r1: end }, mode: info.def, insert: false, dir: 'down' }, false)
  }
  // ── spec 020: dragging the selection's border (tips 13, 107–111) ────────
  type MoveDrag = { from: GridRect; grab: { r: number; c: number }; to: { r: number; c: number }; kind: 'move' | 'copy'; shift: 'down' | 'right' | null; right: boolean; moved: boolean; sx: number; sy: number; foreign?: boolean }
  const [moveDrag, setMoveDragState] = useState<MoveDrag | null>(null)
  const moveRef = useRef<MoveDrag | null>(null)
  const setMoveDrag = (v: MoveDrag | null) => { moveRef.current = v; setMoveDragState(v) }
  const canMove = !!m.onMove && !!m.selection && !editing
  /** A pointer within 4 px of the selection's outline, on one of its edge cells. */
  function onEdge(e: { clientX: number; clientY: number }, el: HTMLElement, r: number, c: number): boolean {
    const q = rectRef.current
    if (r < q.r0 || r > q.r1 || c < q.c0 || c > q.c1) return false
    const b = el.getBoundingClientRect(), rtl = getComputedStyle(el).direction === 'rtl'
    const leftCol = rtl ? q.c1 : q.c0, rightCol = rtl ? q.c0 : q.c1
    return (r === q.r0 && e.clientY - b.top <= 4) || (r === q.r1 && b.bottom - e.clientY <= 4)
      || (c === leftCol && e.clientX - b.left <= 4) || (c === rightCol && b.right - e.clientX <= 4)
  }
  function startMove(e: React.PointerEvent<HTMLElement>, r: number, c: number) {
    const from = rectRef.current
    setLastFill(null)
    setMoveDrag({ from, grab: { r, c }, to: { r: from.r0, c: from.c0 }, kind: 'move', shift: null, right: e.button === 2, moved: false, sx: e.clientX, sy: e.clientY })
  }
  /** The cell under the pointer, as grid indexes. */
  const cellUnder = (x: number, y: number) => {
    // Through anything floating over the grid (a comment's card, a note): the cell under the pointer.
    const el = document.elementsFromPoint(x, y).map(e => (e as HTMLElement).closest<HTMLElement>('[data-cell]')).find(e => !!e && !!gridRef.current?.contains(e)) ?? null
    if (!el) return null
    const r = live.current.rowIndex.get(el.dataset.rowKey ?? ''), c = live.current.cols.indexOf(el.dataset.col ?? '')
    return r === undefined || c < 0 ? null : { r, c, el }
  }
  // A block carried here from another sheet (Alt+drag over this sheet's tab): it follows the pointer until it's dropped.
  useEffect(() => {
    const inc = m.incoming
    if (!inc) return
    setMoveDrag({ from: { r0: 0, c0: 0, r1: inc.h - 1, c1: inc.w - 1 }, grab: { r: inc.dr, c: inc.dc }, to: { r: 0, c: 0 }, kind: 'move', shift: null, right: false, moved: true, sx: 0, sy: 0, foreign: true })
  }, [m.incoming?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!moveDrag) return
    let raf = 0, lastX = 0, lastY = 0
    const tickScroll = () => {
      const sc = scroller()
      if (!moveRef.current || !sc) return
      const b = sc.getBoundingClientRect()
      const dy = lastY < b.top + 30 ? -18 : lastY > b.bottom - 20 ? 18 : 0
      const dx = lastX < b.left + 20 ? -18 : lastX > b.right - 20 ? 18 : 0
      if (dx || dy) sc.scrollBy(dx, dy)
      raf = requestAnimationFrame(tickScroll)
    }
    const move = (e: PointerEvent) => {
      const cur = moveRef.current
      if (!cur) return
      if (!cur.moved && Math.hypot(e.clientX - cur.sx, e.clientY - cur.sy) < 4) return
      lastX = e.clientX; lastY = e.clientY
      if (!raf) raf = requestAnimationFrame(tickScroll)
      // Alt over a sheet tab: the block goes to that sheet (Ctrl+Alt leaves a copy here).
      if (e.altKey && !cur.foreign && m.onMoveToTab) {
        const tab = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-sheet-tab]')
        const id = tab?.dataset.sheetTab
        if (id) {
          cancelAnimationFrame(raf); raf = 0
          setMoveDrag(null)
          m.onMoveToTab(id, cur.from, { r: cur.grab.r - cur.from.r0, c: cur.grab.c - cur.from.c0 }, addKey(e))
          return
        }
      }
      const at = cellUnder(e.clientX, e.clientY)
      if (!at) { if (!cur.moved) setMoveDrag({ ...cur, moved: true }); return }
      const dr = at.r - cur.grab.r, dc = at.c - cur.grab.c
      const to = cur.foreign ? { r: Math.max(0, at.r - cur.grab.r), c: Math.max(0, at.c - cur.grab.c) } : { r: Math.max(0, cur.from.r0 + dr), c: Math.max(0, cur.from.c0 + dc) }
      const kind: 'move' | 'copy' = !cur.foreign && addKey(e) ? 'copy' : 'move'
      const shift = !cur.foreign && e.shiftKey && m.moveShift ? (Math.abs(dr) >= Math.abs(dc) ? 'down' : 'right') : null
      if (!cur.moved || cur.to.r !== to.r || cur.to.c !== to.c || cur.kind !== kind || cur.shift !== shift) setMoveDrag({ ...cur, moved: true, to, kind, shift })
    }
    const finish = (e: PointerEvent | null) => {
      cancelAnimationFrame(raf); raf = 0
      const cur = moveRef.current
      setMoveDrag(null)
      if (!cur) return
      if (cur.foreign) {
        const at = e ? cellUnder(e.clientX, e.clientY) : null
        m.onIncoming?.(at ? cur.to : null)
        if (at) selectBlock({ r0: cur.to.r, c0: cur.to.c, r1: cur.to.r + cur.from.r1, c1: cur.to.c + cur.from.c1 })
        return
      }
      if (!e || !cur.moved) return
      const same = cur.to.r === cur.from.r0 && cur.to.c === cur.from.c0 && !cur.shift
      if (same && !cur.right) return
      const req: MoveRequest = { from: cur.from, to: cur.to, kind: cur.kind, shift: cur.shift }
      if (cur.right && m.onMoveMenu) {
        const anchor = cells.current.get(cellKey(m.rows[cur.to.r]?.key ?? '', m.cols[cur.to.c] ?? '')) ?? gridRef.current
        if (anchor) m.onMoveMenu(req, { x: e.clientX, y: e.clientY }, anchor)
        return
      }
      const res = m.onMove?.(req)
      if (res) selectBlock(res)
    }
    const up = (e: PointerEvent) => finish(e)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && moveRef.current) { e.preventDefault(); e.stopPropagation(); finish(null) } }
    const noMenu = (e: Event) => { if (moveRef.current?.right) e.preventDefault() }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
    document.addEventListener('keydown', key, true)
    document.addEventListener('contextmenu', noMenu, true)
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('keydown', key, true); document.removeEventListener('contextmenu', noMenu, true); cancelAnimationFrame(raf) }
  }, [!!moveDrag]) // eslint-disable-line react-hooks/exhaustive-deps
  const moving = moveDrag && moveDrag.moved ? moveDrag : null
  const moveH = moving ? moving.from.r1 - moving.from.r0 : 0, moveW = moving ? moving.from.c1 - moving.from.c0 : 0
  /** Where the drag would drop: a dashed block, or an insertion bar (Shift). */
  const moveGhost = moving && !moving.shift ? { r0: moving.to.r, c0: moving.to.c, r1: moving.to.r + moveH, c1: moving.to.c + moveW } : null
  const moveBar = moving?.shift ? moving : null
  const inBar = (i: number, c: number) => !!moveBar && (moveBar.shift === 'down'
    ? i === moveBar.to.r && c >= moveBar.to.c && c <= moveBar.to.c + moveW
    : c === moveBar.to.c && i >= moveBar.to.r && i <= moveBar.to.r + moveH)
  const moveTipText = moving && m.moveTip ? m.moveTip({ from: moving.from, to: moving.to, kind: moving.kind, shift: moving.shift }) : null
  const fillTip = fillDrag && fillDrag.mode !== 'clear' && !(fillDrag.to.r0 === fillDrag.from.r0 && fillDrag.to.r1 === fillDrag.from.r1 && fillDrag.to.c0 === fillDrag.from.c0 && fillDrag.to.c1 === fillDrag.from.c1)
    ? { text: fillDrag.info.preview(fillDrag.mode as FillMode, fillDrag.to), r: fillDrag.dir === 'up' ? fillDrag.to.r0 : fillDrag.to.r1, c: fillDrag.dir === 'left' ? fillDrag.to.c0 : fillDrag.to.c1 }
    : null
  const ghost = fillDrag && fillDrag.mode !== 'clear' ? fillDrag.to : moveGhost
  const inQ = (q: GridRect | null, r: number, c: number) => !!q && r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1

  // ── spec 020: zoom (Ctrl+wheel) and Shift+wheel ──────────────────────────
  const zoomRef = useRef({ z, on: m.onZoom })
  zoomRef.current = { z, on: m.onZoom }
  useEffect(() => {
    const sc = scroller()
    if (!sc) return
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && zoomRef.current.on) {
        e.preventDefault()
        acc += e.deltaY
        if (Math.abs(acc) < 40) return
        const step = acc < 0 ? 0.1 : -0.1
        acc = 0
        zoomRef.current.on(Math.round(Math.max(0.5, Math.min(2, zoomRef.current.z + step)) * 100) / 100)
        return
      }
      if (e.shiftKey && !e.deltaX && e.deltaY) {
        e.preventDefault()
        const rtl = getComputedStyle(sc).direction === 'rtl'
        sc.scrollLeft += rtl ? -e.deltaY : e.deltaY
      }
    }
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => sc.removeEventListener('wheel', onWheel)
  }, [])

  const inUnsel = (r: number, c: number) => !!unsel && r >= unsel.r0 && r <= unsel.r1 && c >= unsel.c0 && c <= unsel.c1
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
    // Ctrl/Cmd+click a letter: the column becomes one more area (FR-003).
    const keep = addKey(e) && pushCurrent()
    selectBlock({ r0: 0, c0: c, r1: m.rows.length - 1, c1: c }, undefined, keep)
  }

  // Frozen panes (spec 015 stage 2): the first rows always render and stick under the
  // headings; the first columns stick after the row numbers. Offsets add up the sizes before.
  const F = Math.min(m.frozenRows ?? 0, m.rows.length)
  const FC = Math.min(m.frozenCols ?? 0, m.cols.length)
  const frozenTop: number[] = []
  for (let i = 0, y = m.letters ? 46 : 26; i < F; i++) { frozenTop.push(y); y += heightOf(m.rows[i]) ?? ROW_H }
  const frozenStart: number[] = []
  for (let c = 0, x = m.rowNoWidth; c < FC; c++) { frozenStart.push(x); x += widthOf(m.cols[c]) }
  const firstW = Math.max(first, F)
  const items: ({ row: R; i: number } | { spacer: number; key: string })[] = []
  for (let i = 0; i < F; i++) items.push({ row: m.rows[i], i })
  if (windowed && tops && tops[firstW] - tops[F] > 0) items.push({ spacer: tops[firstW] - tops[F], key: 'sp-top' })
  for (let i = firstW; i < last; i++) items.push({ row: m.rows[i], i })
  const frozenCell = (c: number): React.CSSProperties | undefined =>
    c >= 0 && c < FC ? { position: 'sticky', insetInlineStart: frozenStart[c], zIndex: 2 } : undefined

  return (
    <>
    <div
      ref={gridRef}
      // A treegrid: group rows expand and collapse (aria-level, aria-expanded).
      role="treegrid"
      aria-label={m.label}
      aria-rowcount={m.rows.length + 1}
      // The ＋ heading after the last column is a column too.
      aria-colcount={allCols.length + (m.tailHeader ? 1 : 0)}
      aria-multiselectable={m.selection || undefined}
      className={`fx-sheet-grid${m.selection ? ' is-selectable' : ''}${fillDrag ? ' is-filling' : ''}${moving ? ` is-moving${moving.kind === 'copy' ? ' is-copying' : ''}` : ''}`}
      onPointerMove={canMove && !moveDrag && !fillDrag ? e => {
        // The pointer turns into the move arrows over the selection's outline.
        const el = (e.target as HTMLElement).closest<HTMLElement>('[data-cell]')
        const r = el ? live.current.rowIndex.get(el.dataset.rowKey ?? '') : undefined, c = el ? live.current.cols.indexOf(el.dataset.col ?? '') : -1
        const on = !!el && r !== undefined && c >= 0 && !many && onEdge(e, el, r, c)
        gridRef.current?.classList.toggle('is-move-edge', on)
      } : undefined}
      data-sheet-grid=""
      data-zoom={z !== 1 ? Math.round(z * 100) : undefined}
      style={{ ['--sheet-cols' as string]: template, ...(z !== 1 ? { zoom: z } : {}) }}
      onKeyDown={onGridKeyDown}
    >
      <div ref={headRef} role="row" aria-rowindex={1} className={`fx-sheet-tr is-head${m.letters ? ' is-lettered' : ''}`}>
        <div role="columnheader" className="fx-sheet-th is-frozen-no" aria-label="#"
             onClick={() => { if (m.selection && m.rows.length) selectBlock({ r0: 0, c0: 0, r1: m.rows.length - 1, c1: m.cols.length - 1 }) }}>{m.corner?.()}</div>
        {m.cols.map((col, c) => {
          const h = m.header(col)
          const movable = !!m.onReorder && col !== 'title'
          const on = m.selection && showSel && areas.some(q => c >= q.c0 && c <= q.c1)
          return (
            <div key={col} role="columnheader" aria-sort={h.sort} aria-label={h.label}
                 data-col-head={col}
                 data-letter={m.letters ? colLetters(c) : undefined}
                 style={c < FC ? { position: 'sticky', insetInlineStart: frozenStart[c], zIndex: 5 } : undefined}
                 draggable={movable || undefined}
                 className={`fx-sheet-th is-${col}${col === 'title' ? ' is-frozen-title' : ''}${h.className ? ` ${h.className}` : ''}${dragCol === col ? ' is-dragging' : ''}${dropBefore === col && dragCol && dragCol !== col ? ' is-drop-before' : ''}${on ? ' is-sel-head' : ''}${c === FC - 1 ? ' is-frozen-edge-col' : ''}`}
                 onClick={e => headerClick(col, e)}
                 onContextMenu={m.contextMenu ? e => {
                   e.preventDefault()
                   const cc = m.cols.indexOf(col)
                   // Inside whole selected columns, the menu acts on them all; otherwise on this one.
                   const whole = areas.some(q => cc >= q.c0 && cc <= q.c1) && areas.every(q => q.r0 === 0 && q.r1 - q.r0 + 1 >= m.rows.length)
                   const q = whole ? rect : { r0: 0, c0: cc, r1: Math.max(0, m.rows.length - 1), c1: cc }
                   if (!whole) selectBlock(q)
                   openMenu({ kind: 'col', c: cc, rect: q }, e.currentTarget, { x: e.clientX, y: e.clientY })
                 } : undefined}
                 onDragStart={movable ? e => { setDragCol(col); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', col) } : undefined}
                 onDragOver={m.onReorder && dragCol && col !== 'title' ? e => { e.preventDefault(); if (dropBefore !== col) setDropBefore(col) } : undefined}
                 onDrop={m.onReorder && dragCol ? e => { e.preventDefault(); const from = dragCol; setDragCol(null); setDropBefore(null); if (from !== col && col !== 'title') m.onReorder?.(from, col) } : undefined}
                 onDragEnd={() => { setDragCol(null); setDropBefore(null) }}>
              <span className="fx-sheet-th-name">{h.text}</span>
              {m.headerExtra?.(col)}
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
        {m.tailHeader && (
          <div role="columnheader" className={`fx-sheet-th is-tail${dropBefore === '\u0000end' && dragCol ? ' is-drop-before' : ''}`} data-tail-head=""
               onDragOver={m.onReorder && dragCol ? e => { e.preventDefault(); if (dropBefore !== '\u0000end') setDropBefore('\u0000end') } : undefined}
               onDrop={m.onReorder && dragCol ? e => { e.preventDefault(); const from = dragCol; setDragCol(null); setDropBefore(null); m.onReorder?.(from, null) } : undefined}>
            {m.tailHeader}
          </div>
        )}
      </div>
      {items.map(item => {
        if ('spacer' in item) return <div key={item.key} className="fx-sheet-spacer" aria-hidden="true" style={{ height: item.spacer }} />
        const { row, i } = item
        const rp = m.rowProps(row, i)
        const own = colsFor(row)
        const spans = own !== allCols && own.length < allCols.length
        const h = heightOf(row)
        const rowOn = m.selection && showSel && areas.some(q => i >= q.r0 && i <= q.r1)
        // A group heading drawn above the row isn't a cell, so screen readers would skip it:
        // it is hidden from them and read as the description of the row's cells instead.
        const band = m.rowBand?.(row, i)
        const bandId = band ? `${row.key}-band` : ''
        return (
          <div
            key={row.key}
            role="row"
            aria-rowindex={i + 2}
            aria-level={rp.level}
            aria-expanded={rp.expanded}
            className={`fx-sheet-tr ${rp.className}${active?.key === row.key ? ' is-active-row' : ''}${h ? ' is-tall' : ''}${i < F ? ' is-frozen-row' : ''}${i === F - 1 ? ' is-frozen-edge' : ''}`}
            data-row={row.key}
            data-task={rp.taskId}
            style={{ ...(h ? { ['--row-h' as string]: `${h}px` } : {}), ...(i < F ? { position: 'sticky', top: frozenTop[i], zIndex: 3 } : {}) }}
          >
            {band ? <div className="fx-sheet-band" id={bandId} aria-hidden="true" data-band="" style={{ height: m.rowBandHeight?.(row, i) ?? BAND_H }}>{band}</div> : null}
            {own.map((col, ci) => {
              const key = cellKey(row.key, col)
              const isActive = active?.key === row.key && active.col === col
              const isEditing = editing?.key === row.key && editing.col === col
              const note = notes[key]
              const text = m.isText(row, col), menu = m.isMenu(row, col)
              const span = spans && ci === own.length - 1
              const c = m.cols.indexOf(col)
              const selected = m.selection && showSel && c >= 0 && inAreas(i, c)
              const unselecting = !!unsel && c >= 0 && inUnsel(i, c)
              const isNo = col === 'rowNo'
              const fx = !isNo && m.cellStyle ? m.cellStyle(row, col) : null
              const icon = !isNo && !isEditing && m.cellIcon ? m.cellIcon(row, col) : null
              const merge = !isNo && m.cellSpan ? m.cellSpan(row, col) : null
              const covered = merge === 'covered'
              const freezeStyle = frozenCell(c)
              // Spec 020: the fill handle, the drag's dashed target and its tip, Auto Fill Options, the validation ▾.
              // Kept in place while dragging (hidden by CSS), so a double-click's second press still finds it.
              const hasHandle = canFill && !isNo && i === rect.r1 && c === rect.c1 && c >= 0
              const inGhost = !!ghost && c >= 0 && inQ(ghost, i, c)
              const fgEdges = inGhost ? `${i === ghost!.r0 ? ' is-fg-t' : ''}${i === ghost!.r1 ? ' is-fg-b' : ''}${c === ghost!.c0 ? ' is-fg-s' : ''}${c === ghost!.c1 ? ' is-fg-e' : ''}` : ''
              const clearing = !!fillDrag && fillDrag.mode === 'clear' && c >= 0 && inQ(fillDrag.from, i, c) && !inQ(fillDrag.to, i, c)
              const tipHere = (!!fillTip && fillTip.r === i && fillTip.c === c) || (!!moveTipText && !!moving && i === moving.to.r + moveH && c === moving.to.c + moveW)
              const barHere = inBar(i, c) ? ` is-mvbar-${moveBar!.shift === 'down' ? 't' : 's'}` : ''
              const afoHere = !!lastFill && !fillDrag && !isEditing && !!m.onFillMenu && i === lastFill.to.r1 && c === lastFill.to.c1
              const dv = isActive && !isEditing && !isNo && m.validation ? m.validation(row, col) : null
              const spanStyle = span ? { gridColumn: `${allCols.indexOf(col) + 1} / -1` }
                // A merge reaching into the rows below overlaps them; its own row keeps its height (negative bottom margin).
                : merge && merge !== 'covered' ? { width: merge.width, height: merge.height, justifySelf: 'start' as const, alignSelf: 'start' as const, zIndex: 2, marginBottom: Math.min(0, (heightOf(row) ?? 24) - merge.height) }
                : undefined
              if (covered) return <div key={col} className="fx-sheet-td is-covered" aria-hidden="true" data-covered={key} />
              return (
                <div
                  key={col}
                  ref={el => { if (el) cells.current.set(key, el); else cells.current.delete(key) }}
                  role={m.cellRole(row, col)}
                  tabIndex={isActive && !isEditing ? 0 : -1}
                  className={`${m.cellClass(row, col)}${barHere}${inGhost ? ` is-fg${fgEdges}` : ''}${clearing ? ' is-fclr' : ''}${hasHandle || afoHere || tipHere ? ' has-fill-ui' : ''}${dv ? ' has-dv' : ''}${isActive ? ' is-active' : ''}${isEditing ? ' is-editing' : ''}${selected && !isActive ? ' is-selected' : ''}${selected && isActive ? ' is-anchor' : ''}${cutIn(i, c) ? ' is-cut' : ''}${unselecting ? ' is-unsel' : ''}${isNo && rowOn ? ' is-sel-head' : ''}${note ? ' has-note' : ''}${span ? ' is-span' : ''}${merge ? ' is-merged' : ''}${fx?.cell.backgroundColor ? ' has-fill' : ''}${freezeStyle ? ' is-frozen-cell' : ''}${c === FC - 1 ? ' is-frozen-edge-col' : ''}`}
                  style={fx || freezeStyle ? { ...spanStyle, ...fx?.cell, ...freezeStyle } : spanStyle}
                  data-cell={key}
                  data-row-key={row.key}
                  data-col={col}
                  aria-selected={m.selection ? (selected || isActive) : undefined}
                  aria-haspopup={popupOf(row, col, menu)}
                  aria-readonly={!text && !menu ? true : undefined}
                  aria-describedby={[bandId, m.describedBy?.(row, col) ?? '', note ? `${key}-note` : ''].filter(Boolean).join(' ') || undefined}
                  // Only the cell itself: a button inside it (Auto Fill Options) taking focus mustn't move the selection.
                  onFocus={e => { if (e.target === e.currentTarget && !isActive) setActive({ key: row.key, col }) }}
                  onPointerDown={m.selection ? e => {
                    // Spec 020: the selection's border starts a move (left or right button).
                    if (canMove && !isNo && c >= 0 && !many && !isEditing && (e.button === 0 || e.button === 2) && !(e.target as HTMLElement).closest('[data-row-resize], a, button') && onEdge(e, e.currentTarget, i, c)) {
                      e.preventDefault(); startMove(e, i, c); return
                    }
                    if (isEditing || e.button !== 0 || (e.target as HTMLElement).closest('[data-row-resize], a, button')) return
                    if (isNo && !m.spreadsheet) return
                    if (isNo) {
                      // A row number selects its row; Shift extends from the active row (FR-010); Ctrl/Cmd adds it (spec 017).
                      e.preventDefault()
                      if (e.shiftKey && active) { setFocusEnd({ key: row.key, col: m.cols[m.cols.length - 1] }); setActive({ key: active.key, col: m.cols[0] }) }
                      else selectBlock({ r0: i, c0: 0, r1: i, c1: m.cols.length - 1 }, undefined, addKey(e) && pushCurrent())
                      return
                    }
                    if (e.shiftKey && active) { e.preventDefault(); fresh.current = false; setFocusEnd({ key: row.key, col }); return }
                    if (addKey(e) || addingRef.current) {
                      e.preventDefault()
                      // Ctrl/Cmd on a selected cell: take cells out (FR-006); elsewhere: a new area (FR-001, FR-002).
                      if (addKey(e) && showSel && inAreas(i, c)) {
                        removeFrom.current = { r: i, c }
                        dragging.current = true
                        setUnsel({ r0: i, c0: c, r1: i, c1: c })
                        return
                      }
                      if (!pushCurrent()) return
                      fresh.current = false
                      dragging.current = true
                      setFocusEnd(null)
                      wantFocus.current = true
                      setActive({ key: row.key, col })
                      return
                    }
                    dragging.current = true
                    setFocusEnd(null)
                    setExtra([])
                    if (!isActive) { wantFocus.current = true; setActive({ key: row.key, col }) }
                  } : undefined}
                  onClick={e => {
                    if (isEditing) return
                    if (m.selection && (e.shiftKey || (isNo && m.spreadsheet) || addKey(e) || addingRef.current)) return
                    if (!isActive) setActive({ key: row.key, col })
                    if (activate(row, col)) return
                    if (menu) m.onOpen(row, col, e.currentTarget)
                  }}
                  onContextMenu={m.contextMenu ? e => {
                    e.preventDefault()
                    if (isNo) {
                      // Inside whole selected rows, the menu acts on them all; otherwise on this one.
                      const whole = areas.some(q => i >= q.r0 && i <= q.r1) && areas.every(q => q.c0 === 0 && q.c1 === m.cols.length - 1)
                      const q = whole ? rect : { r0: i, c0: 0, r1: i, c1: Math.max(0, m.cols.length - 1) }
                      if (!whole) selectBlock(q)
                      openMenu({ kind: 'row', r: i, rect: q }, e.currentTarget, { x: e.clientX, y: e.clientY })
                      return
                    }
                    if (c >= 0 && !inAreas(i, c)) { setFocusEnd(null); setExtra([]); setActive({ key: row.key, col }) }
                    openMenu({ kind: 'cell', r: i, c, rect: inAreas(i, c) ? rectRef.current : { r0: i, c0: c, r1: i, c1: c } }, e.currentTarget, { x: e.clientX, y: e.clientY })
                  } : undefined}
                  onDoubleClick={e => {
                    if (isEditing || isNo) return
                    // Spec 020 (tip 95): a double-click on the active cell's edge jumps like Ctrl+arrow.
                    if (m.selection && isActive && c >= 0) {
                      const b = e.currentTarget.getBoundingClientRect(), rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
                      const near = e.clientY > b.bottom - 4 ? 'down' : e.clientY < b.top + 3 ? 'up' : e.clientX > b.right - 4 ? (rtl ? 'left' : 'right') : e.clientX < b.left + 3 ? (rtl ? 'right' : 'left') : null
                      if (near) {
                        const filled = (r: number, cc: number) => { const rw = m.rows[r]; return !!rw && readText(rw, m.cols[cc]) !== '' }
                        const to = dataEdge({ r: i, c }, near, m.rows.length, m.cols.length, filled)
                        const rw = m.rows[to.r]
                        if (rw) focusCell(rw, m.cols[Math.max(0, to.c)])
                        return
                      }
                    }
                    startEdit(row, col, undefined, caretAt(e.currentTarget, e.clientX, e.clientY))
                  }}
                >
                  {isEditing
                    // A tall row (its height set) edits in the multi-line box, so its text wraps as it shows.
                    ? (m.multiline || !!heightOf(row)
                      ? (
                        <textarea
                          className="fx-sheet-input is-multi"
                          autoFocus
                          value={editing.value}
                          rows={Math.max(1, editing.value.split('\n').length)}
                          aria-label={m.inputLabel(row, col)}
                          name={`cell-${col}`}
                          autoComplete="off"
                          spellCheck={m.inputCode?.(col) ? false : undefined}
                          translate={m.inputCode?.(col) ? 'no' : undefined}
                          dir="auto"
                          onFocus={e => {
                            const el = e.currentTarget
                            const at = editing.caret ?? el.value.length
                            el.setSelectionRange(at, at)
                            fitEditor(el)
                          }}
                          onInput={e => fitEditor(e.currentTarget)}
                          onChange={e => setEditing({ ...(editingRef.current ?? editing), value: e.target.value, caret: undefined })}
                          onKeyDown={e => {
                            e.stopPropagation()
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); void fillSelection() }
                            else if (e.key === 'Enter' && e.altKey) {
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
                          name={`cell-${col}`}
                          autoComplete="off"
                          spellCheck={m.inputCode?.(col) ? false : undefined}
                          translate={m.inputCode?.(col) ? 'no' : undefined}
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
                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && m.writeCells) { e.preventDefault(); void fillSelection() }
                            else if (e.key === 'Enter') { e.preventDefault(); void commit(e.shiftKey ? 'up' : 'down') }
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
                    : (isNo && m.rowLabel ? m.rowLabel(row, i)
                      : icon?.only ? icon.node
                      : fx?.text ? <span style={fx.text}>{icon?.node}{m.render(row, col, () => cells.current.get(key))}</span>
                      : <>{icon?.node}{m.render(row, col, () => cells.current.get(key))}</>)}
                  {fx?.border && !isEditing && <span className="fx-cell-bd" aria-hidden="true" style={fx.border} />}
                  {!isNo && m.marked?.(row, col) && <b className="fx-cmt-mark" data-comment-marker={key} aria-hidden="true" />}
                  {isNo && m.onRowResize && (
                    <span className="fx-sheet-row-rz" aria-hidden="true" data-row-resize={row.key}
                          onPointerDown={e => startRowResize(row, e)}
                          onDoubleClick={e => { e.stopPropagation(); m.onRowResize?.(row, null) }} />
                  )}
                  {note && <span className="fx-sheet-cellnote" id={`${key}-note`} role="note">{note}</span>}
                  {hasHandle && <span className="fx-fill-h" data-fill-handle="" aria-hidden="true" title={m.controlLabels?.handle}
                                      onPointerDown={startFill} onClick={ev => ev.stopPropagation()}
                                      onContextMenu={ev => { ev.preventDefault(); ev.stopPropagation() }}
                                      onDoubleClick={ev => { ev.stopPropagation(); fillDownToEnd() }} />}
                  {tipHere && <span className="fx-fill-tip" data-fill-tip="" role="status">{fillTip ? fillTip.text : moveTipText}</span>}
                  {afoHere && (
                    <button type="button" className="fx-afo" data-autofill-options="" tabIndex={-1} aria-haspopup="menu" aria-label={m.controlLabels?.options} title={m.controlLabels?.options}
                            onPointerDown={ev => ev.stopPropagation()}
                            onClick={ev => {
                              ev.stopPropagation()
                              const lf = lastFill!, b = ev.currentTarget.getBoundingClientRect(), rtl = getComputedStyle(ev.currentTarget).direction === 'rtl'
                              m.onFillMenu?.(lf, { x: rtl ? b.right : b.left, y: b.bottom + 2 }, ev.currentTarget, lf.mode === 'flash' ? 'flash' : 'options', fillRun({ ...lf, from: lf.from }, true))
                            }}>
                      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="3" width="8" height="10.5" rx="2" /><path d="M5 3V2h3v1" /><path d="M13 5.5l-1.6 3h2.2l-1.6 3" className="fx-afo-bolt" /></svg>
                      <span aria-hidden="true" className="fx-afo-chev">▾</span>
                    </button>
                  )}
                  {dv?.dropdown && (
                    <button type="button" className="fx-dv-btn" data-dv-drop="" tabIndex={-1} aria-haspopup="listbox" aria-label={m.controlLabels?.dropdown} title={m.controlLabels?.dropdown}
                            onPointerDown={ev => ev.stopPropagation()}
                            onClick={ev => { ev.stopPropagation(); m.pickList?.(row, col, ev.currentTarget, 'button') }}>▾</button>
                  )}
                  {dv?.input && <span className="fx-dv-msg" data-dv-input="" role="note">{dv.input.title && <b>{dv.input.title}</b>}{dv.input.msg}</span>}
                </div>
              )
            })}
            {m.tailHeader && !spans && <div className="fx-sheet-td is-tail" aria-hidden="true" />}
          </div>
        )
      })}
      {windowed && tops && last < m.rows.length && <div className="fx-sheet-spacer" aria-hidden="true" style={{ height: tops[m.rows.length] - tops[last] }} />}
    </div>
    {/* A cell's note (a refused value, a read-only cell) is said here: the note itself isn't a live region. */}
    <div ref={liveRef} className="sr-only" role="status" aria-live="polite" data-grid-live="">{said}</div>
    </>
  )
}
