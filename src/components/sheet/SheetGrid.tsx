'use client'

/**
 * The grid (spec 008 FR-003, FR-037–FR-039, FR-082, contracts/sheet-ui.md §4–§5).
 *
 * A div-based ARIA grid: 24 px rows, a sticky header row, sticky row-number and
 * title columns (logical insets, so they mirror in Arabic), one roving
 * tabindex. Arrow keys move as seen on screen; Enter, F2 or typing edits a
 * text cell, Enter saves and moves down, Tab saves and moves on, Esc cancels.
 * Menu cells (status, editor, type, files, published, drop, row number) ask the
 * sheet to open their menu.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { Member, SheetColumn, Task } from '@/types/index'
import { COLUMN_WIDTHS, ROW_NO_WIDTH } from './columns'
import type { SheetRow } from './rows'
import { clipLength, formatClipTime } from './time'
import { StatusContent } from './StatusCell'
import { EditorContent } from './EditorCell'
import { FilesContent, type FilesCellState } from './FilesCell'
import { PublishedContent } from './PublishedCell'

export type GridCol = 'rowNo' | SheetColumn
export interface ActiveCell { key: string; col: GridCol }

/** Columns typed into, per row kind. */
const TEXT_COLS: GridCol[] = ['title', 'clipNo', 'source', 'fileName', 'in', 'out']

export interface SheetGridProps {
  rows: SheetRow[]
  cols: SheetColumn[]
  me: Member
  members: Member[]
  label: string
  /** Showing every video: each video row offers "open on its own". */
  allVideos: boolean
  active: ActiveCell | null
  setActive(a: ActiveCell): void
  /** Whether the member may edit this task (owner, assignee, admin, superuser). */
  canEdit(task: Task): boolean
  filesState: Record<string, FilesCellState | undefined>
  highlightId: string | null
  /** A draft row to start typing in. */
  editDraft: string | null
  notes: Record<string, string | undefined>
  onCommit(row: SheetRow, col: GridCol, value: string): Promise<string | null>
  onCancelDraft(key: string): void
  onOpen(row: SheetRow, col: GridCol, anchor: HTMLElement): void
  onToggle(videoId: string): void
  onAddClip(videoId: string): void
  onOpenVideo(videoId: string): void
  onDelete(row: SheetRow, anchor: HTMLElement): void
  onPaste(e: React.ClipboardEvent, row: SheetRow | null, col: GridCol | null): void
  onRetry(taskId: string): void
  onLinkInstead(taskId: string, anchor: HTMLElement): void
  onNote(cellKey: string, note: string | null): void
}

const cellKey = (rowKey: string, col: GridCol) => `${rowKey}|${col}`

export function SheetGrid(p: SheetGridProps) {
  const t = useTranslations('sheet')
  const gridRef = useRef<HTMLDivElement>(null)
  const cells = useRef(new Map<string, HTMLElement>())
  const wantFocus = useRef(false)
  const [editing, setEditing] = useState<{ key: string; col: GridCol; value: string } | null>(null)
  const committing = useRef(false)

  const allCols: GridCol[] = ['rowNo', ...p.cols]
  const template = `${ROW_NO_WIDTH}px ${p.cols.map(c => `${COLUMN_WIDTHS[c]}px`).join(' ')}`
  const membersById = new Map(p.members.map(m => [m.id, m]))

  // Keep the active cell valid when rows or columns change.
  const active = p.active && p.rows.some(r => r.key === p.active!.key) && allCols.includes(p.active.col)
    ? p.active
    : p.rows[0] ? { key: p.rows[0].key, col: (p.cols[0] ?? 'rowNo') as GridCol } : null

  useLayoutEffect(() => {
    if (!wantFocus.current || !active || editing) return
    wantFocus.current = false
    const el = cells.current.get(cellKey(active.key, active.col))
    el?.focus({ preventScroll: false })
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  })

  // A new draft row starts in edit mode.
  useEffect(() => {
    if (!p.editDraft) return
    const key = `d:${p.editDraft}`
    if (p.rows.some(r => r.key === key)) {
      p.setActive({ key, col: 'title' })
      setEditing({ key, col: 'title', value: '' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.editDraft])

  function focusCell(key: string, col: GridCol) {
    wantFocus.current = true
    p.setActive({ key, col })
  }

  function rowTask(row: SheetRow): Task | null {
    return row.kind === 'clip' || row.kind === 'video' ? row.task : null
  }

  function isText(row: SheetRow, col: GridCol): boolean {
    if (row.kind === 'draft') return col === 'title'
    if (row.kind === 'video') return col === 'title' && p.canEdit(row.task)
    if (row.kind !== 'clip' || row.task.dropped_at) return false
    return TEXT_COLS.includes(col) && p.canEdit(row.task)
  }

  function textValue(row: SheetRow, col: GridCol): string {
    const task = rowTask(row)
    if (!task) return ''
    switch (col) {
      case 'title':    return task.name
      case 'clipNo':   return task.clip?.clip_no == null ? '' : String(task.clip.clip_no)
      case 'source':   return task.clip?.source ?? ''
      case 'fileName': return task.clip?.file_name ?? ''
      case 'in':       return formatClipTime(task.clip?.in_ms)
      case 'out':      return formatClipTime(task.clip?.out_ms)
      default:         return ''
    }
  }

  /** Cells that open something on Enter or click. */
  function isMenu(row: SheetRow, col: GridCol): boolean {
    if (row.kind === 'add' || row.kind === 'draft') return false
    if (col === 'rowNo') return true
    if (row.kind === 'video') return ['status', 'editor', 'type', 'files'].includes(col)
    return ['status', 'editor', 'type', 'files', 'published', 'drop'].includes(col)
  }

  async function commit(next: 'down' | 'right' | 'left' | 'stay' | 'none') {
    if (!editing || committing.current) return
    const { key, col, value } = editing
    const row = p.rows.find(r => r.key === key)
    committing.current = true
    setEditing(null)
    if (row) {
      const before = textValue(row, col)
      if (row.kind === 'draft' || value.trim() !== before.trim()) {
        const note = await p.onCommit(row, col, value)
        p.onNote(cellKey(key, col), note)
      }
    }
    committing.current = false
    move(key, col, next)
  }

  function cancel() {
    if (!editing) return
    const { key, col } = editing
    setEditing(null)
    if (key.startsWith('d:')) p.onCancelDraft(key.slice(2))
    else focusCell(key, col)
  }

  function startEdit(row: SheetRow, col: GridCol, initial?: string) {
    if (!isText(row, col)) {
      if (rowTask(row) && TEXT_COLS.includes(col) && col !== 'title' || (row.kind === 'clip' && col === 'title' && !p.canEdit(row.task))) {
        p.onNote(cellKey(row.key, col), t('readOnly'))
      }
      return
    }
    setEditing({ key: row.key, col, value: initial ?? textValue(row, col) })
  }

  function move(key: string, col: GridCol, how: 'down' | 'right' | 'left' | 'stay' | 'none') {
    if (how === 'none') return
    const ri = p.rows.findIndex(r => r.key === key)
    if (ri < 0) return
    if (how === 'stay') return focusCell(key, col)
    if (how === 'down') {
      const next = p.rows[Math.min(ri + 1, p.rows.length - 1)]
      return focusCell(next.key, col)
    }
    // Tab / Shift+Tab: the next or previous typed-into cell, across rows.
    const step = how === 'right' ? 1 : -1
    let r = ri, c = allCols.indexOf(col)
    for (let guard = 0; guard < p.rows.length * allCols.length; guard++) {
      c += step
      if (c >= allCols.length) { c = 0; r++ }
      if (c < 0) { c = allCols.length - 1; r-- }
      if (r < 0 || r >= p.rows.length) break
      if (isText(p.rows[r], allCols[c])) {
        focusCell(p.rows[r].key, allCols[c])
        setEditing({ key: p.rows[r].key, col: allCols[c], value: textValue(p.rows[r], allCols[c]) })
        return
      }
    }
    focusCell(key, col)
  }

  function onGridKeyDown(e: React.KeyboardEvent) {
    if (editing || !active) return
    const target = e.target as HTMLElement
    if (!target.matches('[data-cell]')) return
    const ri = p.rows.findIndex(r => r.key === active.key)
    const ci = allCols.indexOf(active.col)
    const row = p.rows[ri]
    if (!row) return
    const rtl = gridRef.current ? getComputedStyle(gridRef.current).direction === 'rtl' : false
    const go = (r: number, c: number) => {
      e.preventDefault()
      const rr = Math.max(0, Math.min(p.rows.length - 1, r))
      const cc = Math.max(0, Math.min(allCols.length - 1, c))
      focusCell(p.rows[rr].key, allCols[cc])
    }
    const ctrl = e.ctrlKey || e.metaKey
    switch (e.key) {
      case 'ArrowDown':  return go(ri + 1, ci)
      case 'ArrowUp':    return go(ri - 1, ci)
      case 'ArrowRight': return go(ri, ci + (rtl ? -1 : 1))
      case 'ArrowLeft':  return go(ri, ci + (rtl ? 1 : -1))
      case 'Home':       return ctrl ? go(0, 0) : go(ri, 0)
      case 'End':        return ctrl ? go(p.rows.length - 1, allCols.length - 1) : go(ri, allCols.length - 1)
      case 'PageDown':   return go(ri + 15, ci)
      case 'PageUp':     return go(ri - 15, ci)
    }
    if (e.key === ' ' && row.kind === 'video' && (active.col === 'title' || active.col === 'rowNo')) {
      e.preventDefault(); p.onToggle(row.task.id); return
    }
    if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      if (row.kind === 'add') { p.onAddClip(row.video.id); return }
      if (isMenu(row, active.col)) { p.onOpen(row, active.col, target); return }
      startEdit(row, active.col)
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && row.kind === 'clip' && !isText(row, active.col)) {
      e.preventDefault(); p.onDelete(row, target); return
    }
    if (e.key === 'Delete' && row.kind === 'clip' && isText(row, active.col) && active.col !== 'title') {
      // Delete on a detail cell clears it, like a spreadsheet.
      e.preventDefault()
      void p.onCommit(row, active.col, '').then(note => p.onNote(cellKey(row.key, active.col), note))
      return
    }
    if (e.key.length === 1 && !ctrl && !e.altKey && e.key !== ' ' && isText(row, active.col)) {
      e.preventDefault()
      startEdit(row, active.col, e.key)
    }
  }

  function header(col: SheetColumn) {
    const cls = ['fx-sheet-th', `is-${col}`, col === 'title' ? 'is-frozen-title' : ''].join(' ')
    return (
      <div key={col} role="columnheader" className={cls} aria-sort={col === 'clipNo' ? 'ascending' : undefined}
           aria-label={col === 'drop' ? t('col.drop') : undefined}>
        {col === 'drop' ? '' : t(`col.${col}`)}
      </div>
    )
  }

  function content(row: SheetRow, col: GridCol): React.ReactNode {
    if (row.kind === 'add') {
      return col === 'title' ? <span className="fx-sheet-plus">{t('addClip')}</span> : null
    }
    if (row.kind === 'draft') {
      return col === 'rowNo' ? row.n : col === 'title' ? <span className="fx-sheet-muted">{t('newClip.placeholder')}</span> : null
    }
    const task = row.task
    const isVideo = row.kind === 'video'
    const can = p.canEdit(task)
    switch (col) {
      case 'rowNo': return row.n
      case 'title':
        return (
          <span className="fx-sheet-title">
            {isVideo
              ? <span className="fx-sheet-caret" role="button" tabIndex={-1} aria-hidden="true"
                      onClick={e => { e.stopPropagation(); p.onToggle(task.id) }}>{row.collapsed ? '▸' : '▾'}</span>
              : <span className="fx-sheet-indent" aria-hidden="true" />}
            <span className="fx-sheet-ellipsis" title={task.name}>{task.name}</span>
            {isVideo && row.collapsed && <span className="fx-sheet-count">{t('summary.clips', { count: row.clips.filter(c => !c.dropped_at).length })}</span>}
            {row.kind === 'clip' && task.dropped_at && <span className="fx-sheet-sr">, {t('drop.droppedSr')}</span>}
            {isVideo && p.allVideos && <span className="fx-sheet-open" role="link" tabIndex={-1} title={t('openOnItsOwn', { name: task.name })}
                              onClick={e => { e.stopPropagation(); p.onOpenVideo(task.id) }} aria-hidden="true">↗</span>}
          </span>
        )
      case 'clipNo': return isVideo || task.clip?.clip_no == null ? '' : String(task.clip.clip_no).padStart(2, '0')
      case 'type':   return <span className="fx-sheet-ellipsis">{task.content_type_label}</span>
      case 'status': return <StatusContent task={task} me={p.me} tipId={`fx-tip-${row.key}`} />
      case 'editor': return <EditorContent member={task.assignee_id ? membersById.get(task.assignee_id) : undefined} t={t} />
      case 'source': return isVideo ? '' : <span className="fx-sheet-ellipsis">{task.clip?.source ?? ''}</span>
      case 'fileName': return isVideo ? '' : <span className="fx-sheet-ellipsis" title={task.clip?.file_name ?? undefined}>{task.clip?.file_name ?? ''}</span>
      case 'in':     return isVideo ? '' : formatClipTime(task.clip?.in_ms)
      case 'out':    return isVideo ? '' : formatClipTime(task.clip?.out_ms)
      case 'length': return isVideo ? '' : formatClipTime(clipLength(task.clip?.in_ms, task.clip?.out_ms))
      case 'files':
        return <FilesContent attachments={task.attachments} state={p.filesState[task.id]} canEdit={can} t={t}
                             onRetry={() => p.onRetry(task.id)}
                             onLinkInstead={() => { const el = cells.current.get(cellKey(row.key, 'files')); if (el) p.onLinkInstead(task.id, el) }} />
      case 'published': return isVideo ? null : <PublishedContent task={task} canEdit={can} t={t} />
      case 'drop':
        return isVideo || !can ? null : <span className="fx-sheet-dropb">{task.dropped_at ? t('drop.restore') : t('drop.drop')}</span>
    }
    return null
  }

  function cellClass(row: SheetRow, col: GridCol): string {
    const c = ['fx-sheet-td', `is-${col}`]
    if (col === 'rowNo') c.push('is-frozen-no')
    if (col === 'title') c.push('is-frozen-title')
    if (['clipNo', 'in', 'out', 'length'].includes(col)) c.push('fx-sheet-num')
    if (['source', 'fileName'].includes(col)) c.push('fx-sheet-mono')
    if (isMenu(row, col) || row.kind === 'add') c.push('is-action')
    return c.join(' ')
  }

  const rowCount = p.rows.length + 1
  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={p.label}
      aria-rowcount={rowCount}
      aria-colcount={allCols.length}
      className="fx-sheet-grid"
      data-sheet-grid=""
      style={{ ['--sheet-cols' as string]: template }}
      onKeyDown={onGridKeyDown}
      onPaste={e => {
        if (editing) return
        const row = active ? p.rows.find(r => r.key === active.key) ?? null : null
        p.onPaste(e, row, active?.col ?? null)
      }}
    >
      <div role="row" aria-rowindex={1} className="fx-sheet-tr is-head">
        <div role="columnheader" className="fx-sheet-th is-frozen-no" aria-label="#" />
        {p.cols.map(header)}
      </div>
      {p.rows.map((row, i) => {
        const task = rowTask(row)
        const dropped = row.kind === 'clip' && !!row.task.dropped_at
        const cls = [
          'fx-sheet-tr',
          row.kind === 'video' ? 'is-video' : '',
          row.kind === 'add' ? 'is-add' : '',
          row.kind === 'draft' ? 'is-draft' : '',
          dropped ? 'is-dropped' : '',
          task && task.id === p.highlightId ? 'is-hl' : '',
          active?.key === row.key ? 'is-active-row' : '',
        ].filter(Boolean).join(' ')
        return (
          <div
            key={row.key}
            role="row"
            aria-rowindex={i + 2}
            aria-level={row.kind === 'video' ? 1 : 2}
            aria-expanded={row.kind === 'video' ? !row.collapsed : undefined}
            aria-disabled={dropped || undefined}
            className={cls}
            data-row={row.key}
            data-task={task?.id}
          >
            {allCols.map(col => {
              const key = cellKey(row.key, col)
              const isActive = active?.key === row.key && active.col === col
              const isEditing = editing?.key === row.key && editing.col === col
              const note = p.notes[key]
              return (
                <div
                  key={col}
                  ref={el => { if (el) cells.current.set(key, el); else cells.current.delete(key) }}
                  role={col === 'title' && row.kind !== 'add' ? 'rowheader' : 'gridcell'}
                  tabIndex={isActive && !isEditing ? 0 : -1}
                  className={`${cellClass(row, col)}${isActive ? ' is-active' : ''}${note ? ' has-note' : ''}`}
                  data-cell={key}
                  data-col={col}
                  aria-haspopup={isMenu(row, col) && col !== 'drop' ? 'menu' : undefined}
                  aria-readonly={!isText(row, col) && !isMenu(row, col) ? true : undefined}
                  aria-describedby={[col === 'status' && row.kind !== 'add' && row.kind !== 'draft' ? `fx-tip-${row.key}` : '', note ? `${key}-note` : ''].filter(Boolean).join(' ') || undefined}
                  onFocus={() => { if (!isActive) p.setActive({ key: row.key, col }) }}
                  onClick={e => {
                    if (isEditing) return
                    if (!isActive) p.setActive({ key: row.key, col })
                    if (row.kind === 'add' && col === 'title') { p.onAddClip(row.video.id); return }
                    if (isMenu(row, col)) p.onOpen(row, col, e.currentTarget)
                  }}
                  onDoubleClick={() => { if (!isEditing) startEdit(row, col) }}
                >
                  {isEditing
                    ? (
                      <input
                        className="fx-sheet-input"
                        autoFocus
                        value={editing.value}
                        aria-label={row.kind === 'draft' ? t('newClip.label') : t(`col.${col as SheetColumn}`)}
                        placeholder={row.kind === 'draft' ? t('newClip.placeholder') : undefined}
                        dir={['in', 'out', 'clipNo', 'fileName'].includes(col) ? 'ltr' : undefined}
                        onFocus={e => { if (editing.value.length > 1) e.currentTarget.select() }}
                        onChange={e => setEditing({ ...editing, value: e.target.value })}
                        onKeyDown={e => {
                          e.stopPropagation()
                          if (e.key === 'Enter') { e.preventDefault(); void commit('down') }
                          else if (e.key === 'Tab') { e.preventDefault(); void commit(e.shiftKey ? 'left' : 'right') }
                          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
                        }}
                        onBlur={() => {
                          if (!editing) return
                          if (row.kind === 'draft' && !editing.value.trim()) { cancel(); return }
                          void commit('none')
                        }}
                      />
                    )
                    : content(row, col)}
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
