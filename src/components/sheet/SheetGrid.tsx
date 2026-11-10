'use client'

/**
 * The video sheet's grid (spec 008): the clip model over the shared GridCore.
 * Video rows group their clips; "+ Clip" rows add one; drafts are clips not
 * saved yet. Keyboard, focus, editing and ARIA live in GridCore.
 */
import { useTranslations } from 'next-intl'
import type { Member, SheetColumn, Task } from '@/types/index'
import { COLUMN_WIDTHS, ROW_NO_WIDTH } from './columns'
import type { SheetRow } from './rows'
import { clipLength, formatClipTime } from './time'
import { StatusContent } from './StatusCell'
import { EditorContent } from './EditorCell'
import { FilesContent, type FilesCellState } from './FilesCell'
import { PublishedContent } from './PublishedCell'
import { GridCore, type GridModel, type GridCol, type ActiveCell } from './GridCore'
import type { SheetColumnsHook } from './useSheetColumns'
import { useLinkedEditing } from './useLinkedEditing'
import { useLinkedFormats } from './useLinkedFormats'
import { useRef } from 'react'
import { useLinkedMenu } from './useLinkedMenu'

export type { GridCol, ActiveCell }

/** Columns typed into. */
const TEXT_COLS: GridCol[] = ['title', 'clipNo', 'source', 'fileName', 'in', 'out']

export interface SheetGridProps {
  rows: SheetRow[]
  /** The shaped layout (spec 010): columns, widths, names, custom cells. */
  columns: SheetColumnsHook
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
  /** A letter typed on the Type cell: its type-ahead (spec 010). */
  onTypeAhead(row: SheetRow, ch: string, anchor: HTMLElement): boolean
  /** Spec 013: whether a paste is new clips (Paste clips) rather than cells to fill. */
  pasteAsRows?(grid: string[][], row: SheetRow | null, col: GridCol | null): boolean
  /** Spec 013: what a paste, clear or undo didn't change, by reason. */
  onSkipped?(skipped: Partial<Record<string, number>>): void
  /** Spec 013 (T042): the row menu's Insert and Delete, row heights, and messages. */
  linked?: {
    drop(taskId: string): Promise<boolean>
    restore(taskId: string): Promise<boolean>
    insertRow(row: SheetRow): boolean
    heights?: Record<string, number>
    saveHeights?(entries: { taskId: string; height: number | null }[]): Promise<{ success: boolean }>
    say(text: string): void
  }
}

export function SheetGrid(p: SheetGridProps) {
  const t = useTranslations('sheet')
  const membersById = new Map(p.members.map(m => [m.id, m]))
  const rowTask = (row: SheetRow): Task | null => (row.kind === 'clip' || row.kind === 'video' ? row.task : null)

  const cl = p.columns
  const isCustom = (col: GridCol) => cl.custom.is(col)
  const isText = (row: SheetRow, col: GridCol) => {
    if (row.kind === 'draft') return col === 'title'
    if (isCustom(col)) return (row.kind === 'clip' || row.kind === 'video') && cl.custom.isText(row.task, col)
    if (row.kind === 'video') return col === 'title' && p.canEdit(row.task)
    if (row.kind !== 'clip' || row.task.dropped_at) return false
    return TEXT_COLS.includes(col) && p.canEdit(row.task)
  }
  const isMenu = (row: SheetRow, col: GridCol) => {
    if (row.kind === 'add' || row.kind === 'draft') return false
    if (col === 'rowNo') return true
    if (isCustom(col)) return cl.custom.isMenu(col)
    if (row.kind === 'video') return ['status', 'editor', 'type', 'files'].includes(col)
    return ['status', 'editor', 'type', 'files', 'published', 'drop'].includes(col)
  }

  const model: GridModel<SheetRow> = {
    rows: p.rows,
    cols: cl.cols,
    widths: { ...COLUMN_WIDTHS, ...cl.widths },
    rowNoWidth: ROW_NO_WIDTH,
    label: p.label,
    header: col => {
      const named = cl.laid.find(c => c.key === col)?.name
      return {
        text: col === 'drop' && !named ? '' : (named ?? (isCustom(col) ? '' : t(`col.${col as SheetColumn}`))),
        label: col === 'drop' && !named ? t('col.drop') : undefined,
        sort: col === 'clipNo' ? 'ascending' : undefined,
      }
    },
    ...cl.grid,
    onTypeAhead: (row, col, ch, anchor) => {
      if (row.kind !== 'clip' && row.kind !== 'video') return false
      if (col === 'type') return p.onTypeAhead(row, ch, anchor)
      return isCustom(col) ? cl.custom.typeAhead(row.task, col, ch, anchor, row.key) : false
    },
    rowProps: row => {
      const task = rowTask(row)
      return {
        className: [
          row.kind === 'video' ? 'is-video' : '',
          row.kind === 'add' ? 'is-add' : '',
          row.kind === 'draft' ? 'is-draft' : '',
          row.kind === 'clip' && row.task.dropped_at ? 'is-dropped' : '',
          task && task.id === p.highlightId ? 'is-hl' : '',
        ].filter(Boolean).join(' '),
        level: row.kind === 'video' ? 1 : 2,
        expanded: row.kind === 'video' ? !row.collapsed : undefined,
        taskId: task?.id,
      }
    },
    cellRole: (row, col) => (col === 'title' && row.kind !== 'add' ? 'rowheader' : 'gridcell'),
    cellClass: (row, col) => {
      const c = ['fx-sheet-td', `is-${col}`]
      if (col === 'rowNo') c.push('is-frozen-no')
      if (col === 'title') c.push('is-frozen-title')
      if (['clipNo', 'in', 'out', 'length'].includes(col)) c.push('fx-sheet-num')
      if (['source', 'fileName'].includes(col)) c.push('fx-sheet-mono')
      if (isMenu(row, col) || row.kind === 'add') c.push('is-action')
      if (isCustom(col)) c.push('is-custom', cl.custom.cellClass(col))
      return c.join(' ')
    },
    isText,
    isMenu,
    textValue: (row, col) => {
      const task = rowTask(row)
      if (!task) return ''
      if (isCustom(col)) return cl.custom.textValue(task, col)
      switch (col) {
        case 'title':    return task.name
        case 'clipNo':   return task.clip?.clip_no == null ? '' : String(task.clip.clip_no)
        case 'source':   return task.clip?.source ?? ''
        case 'fileName': return task.clip?.file_name ?? ''
        case 'in':       return formatClipTime(task.clip?.in_ms)
        case 'out':      return formatClipTime(task.clip?.out_ms)
        default:         return ''
      }
    },
    describedBy: (row, col) => (col === 'status' && row.kind !== 'add' && row.kind !== 'draft' ? `fx-tip-${row.key}` : undefined),
    isDraft: row => row.kind === 'draft',
    inputLabel: (row, col) => (row.kind === 'draft' ? t('newClip.label') : isCustom(col) ? cl.nameOf(col) : t(`col.${col as SheetColumn}`)),
    inputPlaceholder: row => (row.kind === 'draft' ? t('newClip.placeholder') : undefined),
    inputDir: col => (['in', 'out', 'clipNo', 'fileName'].includes(col) ? 'ltr' : undefined),
    readOnlyNote: (row, col) => {
      const task = rowTask(row)
      if (task && isCustom(col)) return cl.custom.readOnlyNote(task, col)
      return task && TEXT_COLS.includes(col) && !(row.kind === 'clip' && task.dropped_at) && !p.canEdit(task) ? t('readOnly') : null
    },
    onCommit: p.onCommit,
    onCancelDraft: row => p.onCancelDraft(row.key.slice(2)),
    onOpen: p.onOpen,
    onActivate: (row, col) => {
      if ((row.kind === 'clip' || row.kind === 'video') && isCustom(col)) return cl.custom.activate(row.task, col, row.key)
      if (row.kind === 'add' && col === 'title') { p.onAddClip(row.video.id); return true }
      return row.kind === 'add'
    },
    onToggle: row => { if (row.kind !== 'video') return false; p.onToggle(row.task.id); return true },
    onDelete: (row, col, anchor) => {
      if ((row.kind === 'clip' || row.kind === 'video') && isCustom(col)) { cl.custom.clear(row.task, col, row.key); return true }
      if (row.kind !== 'clip') return false
      p.onDelete(row, anchor); return true
    },
    onPaste: p.onPaste,
    render: (row, col, cellEl) => {
      if (row.kind === 'add') return col === 'title' ? <span className="fx-sheet-plus">{t('addClip')}</span> : null
      if (row.kind === 'draft') {
        return col === 'rowNo' ? row.n : col === 'title' ? <span className="fx-sheet-muted">{t('newClip.placeholder')}</span> : null
      }
      const task = row.task
      const isVideo = row.kind === 'video'
      const can = p.canEdit(task)
      if (isCustom(col)) return cl.custom.render(task, col)
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
                               onLinkInstead={() => { const el = cellEl(); if (el) p.onLinkInstead(task.id, el) }} />
        case 'published': return isVideo ? null : <PublishedContent task={task} canEdit={can} t={t} />
        case 'drop':
          return isVideo || !can ? null : <span className="fx-sheet-dropb">{task.dropped_at ? t('drop.restore') : t('drop.drop')}</span>
      }
      return null
    },
  }

  // Spec 013: ranges, paste into cells, clear and undo, each cell through its own save.
  // Spec 015: formatting by task and column; undo through the sheet's own stack.
  const leRef = useRef<{ recordFormats(label: string, items: import('@/lib/sheet-format').FormatItem[]): void } | null>(null)
  const cellName = (row: SheetRow, col: GridCol) => {
    const h = model.header(col)
    const colName = h.label ?? (typeof h.text === 'string' ? h.text : col)
    const task = rowTask(row)
    return task ? `${task.name} · ${colName}` : colName
  }
  const lf = useLinkedFormats<SheetRow>({
    enabled: !!p.linked, sheetKey: 'linked_video', rows: p.rows, cols: model.cols, active: p.active,
    taskOf: row => rowTask(row)?.id ?? null, cellName, textValue: model.textValue,
    recordFormats: (label, items) => leRef.current?.recordFormats(label, items),
    say: text => p.linked?.say(text),
  })
  const le = useLinkedEditing<SheetRow>({
    applyFormats: lf.applyFormats,
    rows: p.rows, cols: model.cols, isText, textValue: model.textValue, commit: p.onCommit,
    readOnlyNote: (row, col) => model.readOnlyNote?.(row, col) ?? null,
    isCellRow: row => row.kind === 'clip' || row.kind === 'video',
    onSkipped: p.onSkipped,
    drop: p.linked?.drop, restore: p.linked?.restore,
  })
  const lm = useLinkedMenu<SheetRow>({
    rows: p.rows, cols: model.cols, widths: model.widths, columns: cl, removal: 'drop',
    taskOf: rowTask,
    canRemove: row => row.kind === 'clip' && !row.task.dropped_at && p.canEdit(row.task),
    insertRow: row => p.linked?.insertRow(row) ?? false,
    writeCells: le.writeCells, dropRows: le.dropRows, onSkipped: p.onSkipped,
    say: text => p.linked?.say(text),
    heights: p.linked?.heights, saveHeights: p.linked?.saveHeights,
  })
  leRef.current = le
  Object.assign(model, {
    cellStyle: lf.cellStyle, onSelect: lf.onSelect,
    selection: true, onCommit: le.onCommit, writeCells: le.writeCells, onUndo: le.onUndo, onRedo: le.onRedo,
    pasteAsRows: p.pasteAsRows, onSkipped: p.onSkipped,
    ...(p.linked ? { contextMenu: lm.contextMenu, rowHeight: lm.rowHeight, onRowResize: lm.onRowResize } : {}),
  } satisfies Partial<GridModel<SheetRow>>)

  return (
    <>
    <GridCore
      model={model}
      active={p.active}
      setActive={p.setActive}
      editDraft={p.editDraft ? `d:${p.editDraft}` : null}
      notes={p.notes}
      onNote={p.onNote}
    />
    {lm.node}
    </>
  )
}
