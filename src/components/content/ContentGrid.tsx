'use client'

/**
 * The Content sheet's grid (spec 009): the content model over the shared
 * GridCore. Theme and pillar rows span the columns; pieces carry title, type,
 * status in content words, owner, assignee, pillar, four links, date and
 * archive; an expanded video piece shows its clips.
 */
import { useTranslations } from 'next-intl'
import type { AudienceKey, ContentTheme, Member, Task, TaskAttachment } from '@/types/index'
import { GridCore, type ActiveCell, type GridCol, type GridModel } from '@/components/sheet/GridCore'
import { StatusContent } from '@/components/sheet/StatusCell'
import { EditorContent } from '@/components/sheet/EditorCell'
import { siteName } from '@/lib/content-plan'
import type { ContentRow } from './rows'
import { cadence } from './summary'

export const CONTENT_COLS = ['title', 'type', 'status', 'owner', 'assignee', 'pillar', 'doc', 'design', 'post', 'published', 'date', 'archive'] as const
export type ContentCol = typeof CONTENT_COLS[number]
const WIDTHS: Record<string, number> = {
  title: 300, type: 112, status: 136, owner: 112, assignee: 120, pillar: 120,
  doc: 120, design: 110, post: 110, published: 124, date: 104, archive: 80,
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
}

export function ContentGrid(p: ContentGridProps) {
  const t = useTranslations('content')
  const ts = useTranslations('sheet')
  const byId = new Map(p.members.map(m => [m.id, m]))
  const taskOf = (row: ContentRow): Task | null => (row.kind === 'piece' || row.kind === 'clip' ? row.task : null)

  const isText = (row: ContentRow, col: GridCol) => {
    if (row.kind === 'draft') return col === 'title'
    if (row.kind !== 'piece' || row.task.dropped_at || !p.canEdit(row.task)) return false
    return col === 'title' || col === 'date'
  }
  const isMenu = (row: ContentRow, col: GridCol) => {
    if (row.kind === 'add' || row.kind === 'draft') return false
    if (row.kind === 'theme' || row.kind === 'pillar') return col === 'title' || col === 'rowNo'
    if (row.kind === 'clip') return ['rowNo', 'status', 'assignee'].includes(col)
    return ['rowNo', 'type', 'status', 'assignee', 'pillar', 'doc', 'design', 'post', 'published', 'archive'].includes(col)
  }

  function themeLine(row: Extract<ContentRow, { kind: 'theme' }>) {
    const th = row.theme
    const c = cadence(th, row.pieces, p.now)
    const owner = th.owner_id ? byId.get(th.owner_id)?.name : null
    return (
      <span className="fx-content-theme">
        <span className="fx-sheet-caret" role="button" tabIndex={-1} aria-hidden="true"
              onClick={e => { e.stopPropagation(); p.onToggleTheme(th.id) }}>{row.collapsed ? '▸' : '▾'}</span>
        <span className="fx-content-theme-name">{th.name}</span>
        {row.collapsed && <span className="fx-sheet-count">{t('theme.pieces', { count: row.pieces.filter(x => !x.dropped_at).length })}</span>}
        <span className="fx-content-meta">{owner ?? t('theme.noOwner')}</span>
        <span className="fx-content-meta">
          {th.frequency_count
            ? <>
                {t(th.frequency_period === 'month' ? 'theme.perMonth' : 'theme.perWeek', { n: th.frequency_count })}
                {c && <> · <span className={c.met ? 'fx-content-ok' : 'fx-content-behind'} data-cadence="">
                  {t(c.period === 'month' ? 'theme.cadenceMonth' : 'theme.cadenceWeek', { done: c.done, target: c.target })}{c.met ? ' ✓' : ''}
                </span></>}
              </>
            : t('theme.noFrequency')}
        </span>
        {th.audience.length > 0 && (
          <span className="fx-content-meta fx-sheet-ellipsis">{th.audience.map((a: AudienceKey) => t(`audience.${a}`)).join(' · ')}</span>
        )}
      </span>
    )
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
    cols: [...CONTENT_COLS],
    widths: WIDTHS,
    rowNoWidth: 40,
    label: t('gridLabel'),
    header: col => ({
      text: col === 'archive' ? '' : t(`col.${col}`),
      label: col === 'archive' ? t('col.archive') : undefined,
    }),
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
      return c.join(' ')
    },
    isText,
    isMenu,
    textValue: (row, col) => {
      const task = taskOf(row)
      if (!task) return ''
      if (col === 'title') return task.name
      if (col === 'date') return task.due_date ?? ''
      return ''
    },
    describedBy: (row, col) => (col === 'status' && (row.kind === 'piece' || row.kind === 'clip') ? `fx-tip-${row.key}` : undefined),
    isDraft: row => row.kind === 'draft',
    inputLabel: (row, col) => (row.kind === 'draft' ? t('newPiece.label') : t(`col.${col as 'title'}`)),
    inputPlaceholder: (row, col) => (row.kind === 'draft' ? t('newPiece.placeholder') : col === 'date' ? '2026-11-20' : undefined),
    inputDir: col => (col === 'date' ? 'ltr' : undefined),
    readOnlyNote: (row, col) => {
      const task = taskOf(row)
      return row.kind === 'piece' && task && !task.dropped_at && (col === 'title' || col === 'date') && !p.canEdit(task) ? t('readOnly') : null
    },
    onCommit: p.onCommit,
    onCancelDraft: row => p.onCancelDraft(row.key.slice(2)),
    onOpen: p.onOpen,
    onActivate: (row, col) => {
      if (row.kind === 'add') { if (col === 'title') p.onAddPiece(row.theme, null); return true }
      return false
    },
    onToggle: row => {
      if (row.kind === 'theme') { p.onToggleTheme(row.theme.id); return true }
      if (row.kind === 'piece' && row.clips.length) { p.onToggleVideo(row.task.id); return true }
      return false
    },
    onDelete: (row, _col, anchor) => { if (row.kind !== 'piece') return false; p.onDelete(row, anchor); return true },
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
        case 'type':     return <span className="fx-sheet-ellipsis">{task.content_type_label}</span>
        case 'status':   return <StatusContent task={task} me={p.me} tipId={`fx-tip-${row.key}`} ns={isClip ? 'sheet' : 'content'} />
        case 'owner':    return <span className="fx-sheet-ellipsis">{byId.get(task.task_owner_id)?.name ?? ''}</span>
        case 'assignee': return <EditorContent member={task.assignee_id ? byId.get(task.assignee_id) : undefined} t={ts} />
        case 'pillar': {
          if (isClip) return null
          const pl = row.theme.pillars.find(x => x.id === task.pillar_id)
          return pl ? <span className="fx-sheet-ellipsis">{pl.name}</span> : <span className="fx-sheet-muted">{t('pillar.none')}</span>
        }
        case 'doc': case 'design': case 'post': case 'published':
          return isClip ? null : linkCell(task, col, can)
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

  return (
    <GridCore model={model} active={p.active} setActive={p.setActive}
              editDraft={p.editDraft ? `d:${p.editDraft}` : null} notes={p.notes} onNote={p.onNote} />
  )
}
