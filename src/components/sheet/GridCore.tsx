'use client'

/**
 * The sheets' grid core (spec 008 FR-003, FR-037–FR-039, FR-082; spec 009
 * research R10). Shared by the video sheet and the Content sheet so the two
 * keep one keyboard model, one editing model and one set of ARIA rules.
 *
 * A div-based treegrid: sticky header row, sticky row-number and title
 * columns (logical insets, so they mirror in Arabic), one roving tabindex.
 * Arrow keys move as seen on screen; Enter, F2 or typing edits a text cell,
 * Enter saves and moves down, Tab saves and moves on, Esc cancels. Menu cells
 * ask the sheet to open their menu. A row may span its title across every
 * column (`colsOf`), as the Content sheet's theme and pillar rows do.
 *
 * What a cell is and shows comes from the model; this file knows nothing about
 * clips, pieces or themes.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type GridCol = string
export interface ActiveCell { key: string; col: GridCol }

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
  onPaste(e: React.ClipboardEvent, row: R | null, col: GridCol | null): void
}

export interface GridCoreProps<R extends { key: string }> {
  model: GridModel<R>
  active: ActiveCell | null
  setActive(a: ActiveCell): void
  /** A draft row key to start typing in. */
  editDraft: string | null
  notes: Record<string, string | undefined>
  onNote(cellKey: string, note: string | null): void
}

export const cellKey = (rowKey: string, col: GridCol) => `${rowKey}|${col}`

export function GridCore<R extends { key: string }>({ model: m, active: activeIn, setActive, editDraft, notes, onNote }: GridCoreProps<R>) {
  const gridRef = useRef<HTMLDivElement>(null)
  const cells = useRef(new Map<string, HTMLElement>())
  const wantFocus = useRef(false)
  type Editing = { key: string; col: GridCol; value: string; select?: boolean }
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

  const allCols: GridCol[] = ['rowNo', ...m.cols]
  const template = `${m.rowNoWidth}px ${m.cols.map(c => `${m.widths[c]}px`).join(' ')}`
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

  useLayoutEffect(() => {
    if (!wantFocus.current || !active || editing) return
    wantFocus.current = false
    const el = cells.current.get(cellKey(active.key, active.col))
    el?.focus({ preventScroll: false })
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  // A new draft row starts in edit mode.
  useEffect(() => {
    if (!editDraft) return
    const row = m.rows.find(r => r.key === editDraft)
    if (row) {
      setActive({ key: row.key, col: 'title' })
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

  function focusCell(row: R, col: GridCol) {
    wantFocus.current = true
    setActive({ key: row.key, col: fit(row, col) })
  }

  async function commit(next: 'down' | 'right' | 'left' | 'none') {
    const cur = editingRef.current
    if (!cur || committing.current) return
    const { key, col, value } = cur
    const row = m.rows.find(r => r.key === key)
    committing.current = true
    setEditing(null)
    if (row) {
      const before = m.textValue(row, col)
      if (m.isDraft(row) || value.trim() !== before.trim()) {
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

  function startEdit(row: R, col: GridCol, initial?: string) {
    if (!m.isText(row, col)) {
      const note = m.readOnlyNote?.(row, col)
      if (note) onNote(cellKey(row.key, col), note)
      return
    }
    // Typing a character replaces the value; Enter, F2 and double-click edit it, caret at the end.
    setEditing({ key: row.key, col, value: initial ?? m.textValue(row, col) })
  }

  function move(key: string, col: GridCol, how: 'down' | 'right' | 'left' | 'none') {
    if (how === 'none') return
    const ri = m.rows.findIndex(r => r.key === key)
    if (ri < 0) return
    if (how === 'down') return focusCell(m.rows[Math.min(ri + 1, m.rows.length - 1)], col)
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
        // Arriving by Tab selects the cell's text, like a form field: typing replaces it.
        setEditing({ key: row.key, col: cc, value: m.textValue(row, cc), select: true })
        return
      }
    }
    focusCell(m.rows[ri], col)
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
    const go = (r: number, c: number) => {
      e.preventDefault()
      const rr = Math.max(0, Math.min(m.rows.length - 1, r))
      const cc = Math.max(0, Math.min(allCols.length - 1, c))
      focusCell(m.rows[rr], allCols[cc])
    }
    /** Left/right on a spanning row: step over the span. */
    const sideways = (dir: 1 | -1) => {
      const own = colsFor(row)
      const at = own.indexOf(active.col)
      const next = own[at + dir]
      if (next) { e.preventDefault(); focusCell(row, next) } else e.preventDefault()
    }
    const ctrl = e.ctrlKey || e.metaKey
    switch (e.key) {
      case 'ArrowDown':  return go(ri + 1, ci)
      case 'ArrowUp':    return go(ri - 1, ci)
      case 'ArrowRight': return colsFor(row) === allCols ? go(ri, ci + (rtl ? -1 : 1)) : sideways(rtl ? -1 : 1)
      case 'ArrowLeft':  return colsFor(row) === allCols ? go(ri, ci + (rtl ? 1 : -1)) : sideways(rtl ? 1 : -1)
      case 'Home':       return ctrl ? go(0, 0) : go(ri, 0)
      case 'End':        return ctrl ? go(m.rows.length - 1, allCols.length - 1) : go(ri, allCols.length - 1)
      case 'PageDown':   return go(ri + 15, ci)
      case 'PageUp':     return go(ri - 15, ci)
    }
    if (e.key === ' ' && (active.col === 'title' || active.col === 'rowNo') && m.onToggle?.(row)) {
      e.preventDefault(); return
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      if (activate(row, active.col)) return
      if (m.isMenu(row, active.col)) { m.onOpen(row, active.col, target); return }
      startEdit(row, active.col)
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
      startEdit(row, active.col, e.key)
      return
    }
    // Typing on a "+ Clip" / "+ Piece" row starts the new row with that character.
    if (e.key.length === 1 && !ctrl && !e.altKey && e.key !== ' ' && active.col === 'title') {
      pendingChar.current = e.key
      if (activate(row, active.col)) e.preventDefault()
      else pendingChar.current = ''
    }
  }

  return (
    <div
      ref={gridRef}
      // A treegrid: group rows expand and collapse (aria-level, aria-expanded).
      role="treegrid"
      aria-label={m.label}
      aria-rowcount={m.rows.length + 1}
      aria-colcount={allCols.length}
      className="fx-sheet-grid"
      data-sheet-grid=""
      style={{ ['--sheet-cols' as string]: template }}
      onKeyDown={onGridKeyDown}
      onPaste={e => {
        if (editing) return
        m.onPaste(e, activeRow ?? null, active?.col ?? null)
      }}
    >
      <div role="row" aria-rowindex={1} className="fx-sheet-tr is-head">
        <div role="columnheader" className="fx-sheet-th is-frozen-no" aria-label="#" />
        {m.cols.map(col => {
          const h = m.header(col)
          return (
            <div key={col} role="columnheader" aria-sort={h.sort} aria-label={h.label}
                 className={`fx-sheet-th is-${col}${col === 'title' ? ' is-frozen-title' : ''}${h.className ? ` ${h.className}` : ''}`}>
              {h.text}
            </div>
          )
        })}
      </div>
      {m.rows.map((row, i) => {
        const rp = m.rowProps(row, i)
        const own = colsFor(row)
        const spans = own !== allCols && own.length < allCols.length
        return (
          <div
            key={row.key}
            role="row"
            aria-rowindex={i + 2}
            aria-level={rp.level}
            aria-expanded={rp.expanded}
            className={`fx-sheet-tr ${rp.className}${active?.key === row.key ? ' is-active-row' : ''}`}
            data-row={row.key}
            data-task={rp.taskId}
          >
            {own.map((col, ci) => {
              const key = cellKey(row.key, col)
              const isActive = active?.key === row.key && active.col === col
              const isEditing = editing?.key === row.key && editing.col === col
              const note = notes[key]
              const text = m.isText(row, col), menu = m.isMenu(row, col)
              const span = spans && ci === own.length - 1
              return (
                <div
                  key={col}
                  ref={el => { if (el) cells.current.set(key, el); else cells.current.delete(key) }}
                  role={m.cellRole(row, col)}
                  tabIndex={isActive && !isEditing ? 0 : -1}
                  className={`${m.cellClass(row, col)}${isActive ? ' is-active' : ''}${note ? ' has-note' : ''}${span ? ' is-span' : ''}`}
                  style={span ? { gridColumn: `${allCols.indexOf(col) + 1} / -1` } : undefined}
                  data-cell={key}
                  data-col={col}
                  aria-haspopup={menu && col !== 'drop' && col !== 'archive' ? 'menu' : undefined}
                  aria-readonly={!text && !menu ? true : undefined}
                  aria-describedby={[m.describedBy?.(row, col) ?? '', note ? `${key}-note` : ''].filter(Boolean).join(' ') || undefined}
                  onFocus={() => { if (!isActive) setActive({ key: row.key, col }) }}
                  onClick={e => {
                    if (isEditing) return
                    if (!isActive) setActive({ key: row.key, col })
                    if (activate(row, col)) return
                    if (menu) m.onOpen(row, col, e.currentTarget)
                  }}
                  onDoubleClick={() => { if (!isEditing) startEdit(row, col) }}
                >
                  {isEditing
                    ? (
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
                          else el.setSelectionRange(el.value.length, el.value.length)
                        }}
                        onChange={e => setEditing({ ...(editingRef.current ?? editing), value: e.target.value })}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Enter') { e.preventDefault(); void commit('down') }
                          else if (e.key === 'Tab') { e.preventDefault(); void commit(e.shiftKey ? 'left' : 'right') }
                          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
                        }}
                        onBlur={() => {
                          if (!editing) return
                          if (m.isDraft(row) && !editing.value.trim()) { cancel(); return }
                          void commit('none')
                        }}
                      />
                    )
                    : m.render(row, col, () => cells.current.get(key))}
                  {note && <span className="fx-sheet-cellnote" id={`${key}-note`} role="note">{note}</span>}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
