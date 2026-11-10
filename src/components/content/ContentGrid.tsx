'use client'

/**
 * The Content sheet's grid (spec 009): the content model over the shared
 * GridCore. Theme and pillar rows span the columns and read simply, "Strategy
 * · 5". Pieces carry title, a coloured type, status in content words,
 * assignee, the team sheet's link columns (Working Doc, Design Link, Task
 * Link, LinkedIn Link, Published Link), pillar, date and archive; an expanded
 * video piece shows its clips. There is no Owner column: a theme's owner
 * (Samaa for the content plan) owns its pieces, and the sheet works by
 * assignee.
 */
import { useTranslations } from 'next-intl'
import type { ContentTheme, Member, Task, TaskAttachment } from '@/types/index'
import { GridCore, type ActiveCell, type GridCol, type GridModel } from '@/components/sheet/GridCore'
import { StatusContent } from '@/components/sheet/StatusCell'
import { EditorContent } from '@/components/sheet/EditorCell'
import { siteName } from '@/lib/content-plan'
import type { ContentRow } from './rows'
import { cadence } from './summary'
import { contentTypeColor } from '@/lib/tokens'
import type { SheetColumnsHook } from '@/components/sheet/useSheetColumns'
import { useLinkedEditing } from '@/components/sheet/useLinkedEditing'
import { useLinkedFormats } from '@/components/sheet/useLinkedFormats'
import { useRef } from 'react'
import { useLinkedMenu } from '@/components/sheet/useLinkedMenu'

export const CONTENT_COLS = ['title', 'type', 'status', 'assignee', 'doc', 'design', 'task', 'post', 'published', 'pillar', 'date', 'archive'] as const
export type ContentCol = typeof CONTENT_COLS[number]
const WIDTHS: Record<string, number> = {
  title: 300, type: 130, status: 156, assignee: 130,
  doc: 124, design: 116, task: 104, post: 120, published: 128, pillar: 120, date: 104, archive: 80,
}
export const LINK_COLS = ['doc', 'design', 'post', 'published'] as const

/** A piece's link for a column, from its attachments (working doc, design) or its own fields. */
export function pieceLink(task: Task, col: typeof LINK_COLS[number]): string | null {
  if (col === 'post') return task.post_url ?? null
  if (col === 'published') return task.published_url ?? null
  const role = col === 'doc' ? 'working_doc' : 'design'
  const a = (task.attachments ?? []).filter((x: TaskAttachment) => x.link_role === role)
  return a.length ? a[a.length - 1].url ?? null : null
}

/** "3 Nov": Western digits in every language. */
export function shortDate(ymd: string | null | undefined): string {
  if (!ymd) return ''
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export interface ContentGridProps {
  rows: ContentRow[]
  me: Member
  members: Member[]
  now: Date
  active: ActiveCell | null
  setActive(a: ActiveCell): void
  canEdit(task: Task): boolean
  editDraft: string | null
  notes: Record<string, string | undefined>
  onNote(cellKey: string, note: string | null): void
  onCommit(row: ContentRow, col: GridCol, value: string): Promise<string | null>
  onCancelDraft(key: string): void
  onOpen(row: ContentRow, col: GridCol, anchor: HTMLElement): void
  onToggleTheme(themeId: string): void
  onToggleVideo(taskId: string): void
  onAddPiece(theme: ContentTheme, pillarId: string | null): void
  onDelete(row: ContentRow, anchor: HTMLElement): void
  onPaste(e: React.ClipboardEvent, row: ContentRow | null, col: GridCol | null): void
  /** The shaped layout (spec 010). */
  columns: SheetColumnsHook
  /** A letter typed on the Type cell: its type-ahead (spec 010). */
  onTypeAhead(row: ContentRow, ch: string, anchor: HTMLElement): boolean
  /** Spec 013: whether a paste is a content plan (Paste plan) rather than cells to fill. */
  pasteAsRows?(grid: string[][], row: ContentRow | null, col: GridCol | null): boolean
  /** Spec 013: what a paste, clear or undo didn't change, by reason. */
  onSkipped?(skipped: Partial<Record<string, number>>): void
  /** Spec 013 (T042): the row menu's Insert and Delete, row heights, and messages. */
  linked?: {
    drop(taskId: string): Promise<boolean>
    restore(taskId: string): Promise<boolean>
    insertRow(row: ContentRow): boolean
    heights?: Record<string, number>
    saveHeights?(entries: { taskId: string; height: number | null }[]): Promise<{ success: boolean }>
    say(text: string): void
  }
}

export function ContentGrid(p: ContentGridProps) {
  const t = useTranslations('content')
  const ts = useTranslations('sheet')
  const byId = new Map(p.members.map(m => [m.id, m]))
  const taskOf = (row: ContentRow): Task | null => (row.kind === 'piece' || row.kind === 'clip' ? row.task : null)

  const cl = p.columns
  const isCustom = (col: GridCol) => cl.custom.is(col)
  const isText = (row: ContentRow, col: GridCol) => {
    if (row.kind === 'draft') return col === 'title'
    if (isCustom(col)) return (row.kind === 'piece' || row.kind === 'clip') && cl.custom.isText(row.task, col)
    if (row.kind !== 'piece' || row.task.dropped_at || !p.canEdit(row.task)) return false
    return col === 'title' || col === 'date'
  }
  const isMenu = (row: ContentRow, col: GridCol) => {
    if (row.kind === 'add' || row.kind === 'draft') return false
    if (row.kind === 'theme' || row.kind === 'pillar') return col === 'title' || col === 'rowNo'
    if (isCustom(col)) return cl.custom.isMenu(col)
    if (row.kind === 'clip') return ['rowNo', 'status', 'assignee'].includes(col)
    return ['rowNo', 'type', 'status', 'assignee', 'pillar', 'doc', 'design', 'task', 'post', 'published', 'archive'].includes(col)
  }

  /**
   * A theme reads like a pillar, "Strategy · 5": its name and its live pieces.
   * Owner, frequency, cadence and audience stay in the theme editor and in the
   * name's tooltip.
   */
  function themeLine(row: Extract<ContentRow, { kind: 'theme' }>) {
    const th = row.theme
    const c = cadence(th, row.pieces, p.now)
    const owner = th.owner_id ? byId.get(th.owner_id)?.name : null
    const tip = [
      owner ?? t('theme.noOwner'),
      th.frequency_count ? t(th.frequency_period === 'month' ? 'theme.perMonth' : 'theme.perWeek', { n: th.frequency_count }) : null,
      c ? t(c.period === 'month' ? 'theme.cadenceMonth' : 'theme.cadenceWeek', { done: c.done, target: c.target }) : null,
      th.audience.length ? th.audience.map(a => t(`audience.${a}`)).join(', ') : null,
    ].filter(Boolean).join(' · ')
    return (
      <span className="fx-content-theme" title={tip} data-cadence={c ? `${c.done}/${c.target}` : undefined}>
        <span className="fx-sheet-caret" role="button" tabIndex={-1} aria-hidden="true"
              onClick={e => { e.stopPropagation(); p.onToggleTheme(th.id) }}>{row.collapsed ? '▸' : '▾'}</span>
        <span className="fx-content-theme-name">{th.name}</span>
        <span className="fx-sheet-muted"> · {row.pieces.filter(x => !x.dropped_at).length}</span>
      </span>
    )
  }

  /** The type as a filled pill, one colour per content type. */
  function typePill(label: string | null | undefined) {
    if (!label) return null
    return <span className="fx-content-type" style={{ background: contentTypeColor(label) }}>{label}</span>
  }

  function linkCell(task: Task, col: typeof LINK_COLS[number], can: boolean) {
    const url = pieceLink(task, col)
    if (url) {
      return <a className="fx-sheet-link fx-sheet-ellipsis" href={url} target="_blank" rel="noopener noreferrer" tabIndex={-1}
                onClick={e => e.stopPropagation()}>{siteName(url) || url}</a>
    }
    if (col === 'published' && task.status === 'publish') return <span className="fx-sheet-missing">{t('links.missing')}</span>
    return can && !task.dropped_at ? <span className="fx-sheet-muted">{t('links.add')}</span> : null
  }

  const model: GridModel<ContentRow> = {
    rows: p.rows,
    cols: cl.cols,
    widths: { ...WIDTHS, ...cl.widths },
    rowNoWidth: 40,
    label: t('gridLabel'),
    header: col => {
      const named = cl.laid.find(c => c.key === col)?.name
      return {
        text: col === 'archive' && !named ? '' : (named ?? (isCustom(col) ? '' : t(`col.${col as ContentCol}`))),
        label: col === 'archive' && !named ? t('col.archive') : undefined,
      }
    },
    ...cl.grid,
    onTypeAhead: (row, col, ch, anchor) => {
      if (row.kind !== 'piece' && row.kind !== 'clip') return false
      if (col === 'type') return p.onTypeAhead(row, ch, anchor)
      return isCustom(col) ? cl.custom.typeAhead(row.task, col, ch, anchor, row.key) : false
    },
    colsOf: row => (row.kind === 'theme' || row.kind === 'pillar' ? ['rowNo', 'title'] : null),
    rowProps: row => ({
      className: [
        row.kind === 'theme' ? 'is-video fx-content-theme-row' : '',
        row.kind === 'pillar' ? 'fx-content-pillar-row' : '',
        row.kind === 'add' ? 'is-add' : '',
        row.kind === 'draft' ? 'is-draft' : '',
        (row.kind === 'piece' || row.kind === 'clip') && row.task.dropped_at ? 'is-dropped' : '',
        row.kind === 'clip' ? 'fx-content-clip-row' : '',
      ].filter(Boolean).join(' '),
      level: row.kind === 'theme' ? 1 : row.kind === 'pillar' ? 2 : row.kind === 'clip' ? 4
        : row.kind === 'piece' || row.kind === 'draft' ? (row.kind === 'piece' ? (row.task.pillar_id ? 3 : 2) : (row.pillarId ? 3 : 2)) : 2,
      expanded: row.kind === 'theme' ? !row.collapsed : row.kind === 'piece' && row.clips.length ? row.expanded : undefined,
      taskId: taskOf(row)?.id,
    }),
    cellRole: (row, col) => (col === 'title' && row.kind !== 'add' ? 'rowheader' : 'gridcell'),
    cellClass: (row, col) => {
      const c = ['fx-sheet-td', `is-${col}`]
      if (col === 'rowNo') c.push('is-frozen-no')
      if (col === 'title') c.push('is-frozen-title')
      if (isMenu(row, col) || row.kind === 'add') c.push('is-action')
      if (isCustom(col)) c.push('is-custom', cl.custom.cellClass(col))
      return c.join(' ')
    },
    isText,
    isMenu,
    textValue: (row, col) => {
      const task = taskOf(row)
      if (!task) return ''
      if (isCustom(col)) return cl.custom.textValue(task, col)
      if (col === 'title') return task.name
      if (col === 'date') return task.due_date ?? ''
      if (col === 'task') return `${typeof window !== 'undefined' ? window.location.origin : ''}/board?task=${task.id}`
      return ''
    },
    describedBy: (row, col) => (col === 'status' && (row.kind === 'piece' || row.kind === 'clip') ? `fx-tip-${row.key}` : undefined),
    isDraft: row => row.kind === 'draft',
    inputLabel: (row, col) => (row.kind === 'draft' ? t('newPiece.label') : isCustom(col) ? cl.nameOf(col) : t(`col.${col as 'title'}`)),
    inputPlaceholder: (row, col) => (row.kind === 'draft' ? t('newPiece.placeholder') : col === 'date' ? '2026-11-20' : undefined),
    inputDir: col => (col === 'date' ? 'ltr' : undefined),
    readOnlyNote: (row, col) => {
      const task = taskOf(row)
      if (task && isCustom(col)) return cl.custom.readOnlyNote(task, col)
      return row.kind === 'piece' && task && !task.dropped_at && (col === 'title' || col === 'date') && !p.canEdit(task) ? t('readOnly') : null
    },
    onCommit: p.onCommit,
    onCancelDraft: row => p.onCancelDraft(row.key.slice(2)),
    onOpen: p.onOpen,
    onActivate: (row, col) => {
      if ((row.kind === 'piece' || row.kind === 'clip') && isCustom(col)) return cl.custom.activate(row.task, col, row.key)
      if (row.kind === 'add') { if (col === 'title') p.onAddPiece(row.theme, null); return true }
      return false
    },
    onToggle: row => {
      if (row.kind === 'theme') { p.onToggleTheme(row.theme.id); return true }
      if (row.kind === 'piece' && row.clips.length) { p.onToggleVideo(row.task.id); return true }
      return false
    },
    onDelete: (row, col, anchor) => {
      if ((row.kind === 'piece' || row.kind === 'clip') && isCustom(col)) { cl.custom.clear(row.task, col, row.key); return true }
      if (row.kind !== 'piece') return false
      p.onDelete(row, anchor); return true
    },
    onPaste: p.onPaste,
    render: (row, col) => {
      if (row.kind === 'add') return col === 'title' ? <span className="fx-sheet-plus">{t('addPiece')}</span> : null
      if (row.kind === 'draft') {
        return col === 'rowNo' ? row.n : col === 'title' ? <span className="fx-sheet-muted">{t('newPiece.placeholder')}</span> : null
      }
      if (row.kind === 'theme') return col === 'rowNo' ? row.n : themeLine(row)
      if (row.kind === 'pillar') {
        return col === 'rowNo' ? row.n : (
          <span className="fx-content-pillar"><span className="fx-sheet-indent" aria-hidden="true" />{row.pillar.name}
            <span className="fx-sheet-muted"> · {row.count}</span></span>
        )
      }
      const task = row.task
      const can = p.canEdit(task)
      const isClip = row.kind === 'clip'
      if (isCustom(col)) return cl.custom.render(task, col)
      switch (col) {
        case 'rowNo': return row.n
        case 'title': {
          const deep = isClip ? 3 : task.pillar_id ? 2 : 1
          return (
            <span className="fx-sheet-title">
              {Array.from({ length: deep - (row.kind === 'piece' && row.clips.length ? 1 : 0) }, (_, i) => <span key={i} className="fx-sheet-indent" aria-hidden="true" />)}
              {row.kind === 'piece' && row.clips.length > 0 && (
                <span className="fx-sheet-caret" role="button" tabIndex={-1} aria-hidden="true"
                      onClick={e => { e.stopPropagation(); p.onToggleVideo(task.id) }}>{row.expanded ? '▾' : '▸'}</span>
              )}
              <span className="fx-sheet-ellipsis" title={task.name}>{task.name}</span>
              {task.dropped_at && <span className="fx-sheet-sr">, {t('archive.archivedSr')}</span>}
            </span>
          )
        }
        case 'type':     return typePill(task.content_type_label)
        case 'status':   return <StatusContent task={task} me={p.me} tipId={`fx-tip-${row.key}`} ns={isClip ? 'sheet' : 'content'} />
        case 'assignee': return <EditorContent member={task.assignee_id ? byId.get(task.assignee_id) : undefined} t={ts} />
        case 'pillar': {
          if (isClip) return null
          const pl = row.theme.pillars.find(x => x.id === task.pillar_id)
          return pl ? <span className="fx-sheet-ellipsis">{pl.name}</span> : <span className="fx-sheet-muted">{t('pillar.none')}</span>
        }
        case 'doc': case 'design': case 'post': case 'published':
          return isClip ? null : linkCell(task, col, can)
        case 'task':
          // Every piece is a task: its link is always there (FR: the team sheet's Task Link).
          return isClip ? null : (
            <a className="fx-sheet-link fx-sheet-ellipsis" href={`/board?task=${task.id}`} tabIndex={-1}
               onClick={e => e.preventDefault()}>{t('links.openTask')}</a>
          )
        case 'date':
          if (isClip) return null
          if (task.status === 'publish') return <span className="fx-sheet-ellipsis">{t('date.published', { date: shortDate(task.stage_date) })}</span>
          return task.due_date ? <span className="fx-sheet-ellipsis">{t('date.due', { date: shortDate(task.due_date) })}</span> : null
        case 'archive':
          return isClip || !can ? null : <span className="fx-sheet-dropb">{task.dropped_at ? t('archive.restore') : t('archive.archive')}</span>
      }
      return null
    },
  }

  // Spec 013: ranges, paste into cells, clear and undo, each cell through its own save.
  // Spec 015: formatting by task and column; undo through the sheet's own stack.
  const leRef = useRef<{ recordFormats(label: string, items: import('@/lib/sheet-format').FormatItem[]): void } | null>(null)
  const cellName = (row: ContentRow, col: GridCol) => {
    const h = model.header(col)
    const colName = h.label ?? (typeof h.text === 'string' ? h.text : col)
    const task = taskOf(row)
    return task ? `${task.name} · ${colName}` : colName
  }
  const lf = useLinkedFormats<ContentRow>({
    enabled: !!p.linked, sheetKey: 'linked_content', rows: p.rows, cols: model.cols, active: p.active,
    taskOf: row => taskOf(row)?.id ?? null, cellName, textValue: model.textValue,
    recordFormats: (label, items) => leRef.current?.recordFormats(label, items),
    say: text => p.linked?.say(text),
  })
  const le = useLinkedEditing<ContentRow>({
    applyFormats: lf.applyFormats,
    rows: p.rows, cols: model.cols, isText: model.isText, textValue: model.textValue, commit: p.onCommit,
    readOnlyNote: (row, col) => model.readOnlyNote?.(row, col) ?? null,
    isCellRow: row => row.kind === 'piece' || row.kind === 'clip',
    onSkipped: p.onSkipped,
    drop: p.linked?.drop, restore: p.linked?.restore,
  })
  const lm = useLinkedMenu<ContentRow>({
    rows: p.rows, cols: model.cols, widths: model.widths, columns: cl, removal: 'archive',
    taskOf,
    canRemove: row => row.kind === 'piece' && !row.task.dropped_at && p.canEdit(row.task),
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
  } satisfies Partial<GridModel<ContentRow>>)

  return (
    <>
    <GridCore model={model} active={p.active} setActive={p.setActive}
              editDraft={p.editDraft ? `d:${p.editDraft}` : null} notes={p.notes} onNote={p.onNote} />
    {lm.node}
    </>
  )
}
