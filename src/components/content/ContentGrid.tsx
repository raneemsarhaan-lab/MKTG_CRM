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
import { useLocale, useTranslations } from 'next-intl'
import type { ContentTheme, Member, Task, TaskAttachment, TaskField, WordField } from '@/types/index'
import { GridCore, type ActiveCell, type GridCol, type GridModel } from '@/components/sheet/GridCore'
import { StatusContent, useStageNames } from '@/components/sheet/StatusCell'
import type { StageId } from '@/types/index'
import { EditorContent } from '@/components/sheet/EditorCell'
import { siteName } from '@/lib/content-plan'
import { regroupContent, type ContentRow } from './rows'
import { STAGE_META } from '@/lib/stage-meta'
import { matchStage, normTitle, shownWord, wordValue } from '@/lib/sheet-links'
import { FieldIcon } from '@/components/sheets/links/FieldCells'
import { FIELDS_OPEN, PresetFieldsDrawer, ValuesDialog, type PresetRow } from '@/components/sheets/links/FieldsPanel'
import { SheetMenu, type MenuItem } from '@/components/sheet/SheetMenu'
import { cadence } from './summary'
import { contentTypeColor } from '@/lib/tokens'
import { intlLocale } from '@/lib/sheet-format'
import type { SheetColumnsHook } from '@/components/sheet/useSheetColumns'
import { useLinkedEditing } from '@/components/sheet/useLinkedEditing'
import { nodeText, useLinkedView, type LinkedView } from '@/components/sheet/useLinkedView'
import { useGridTips } from '@/components/sheet/useGridTips'
import { useLinkedFormats } from '@/components/sheet/useLinkedFormats'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLinkedMenu } from '@/components/sheet/useLinkedMenu'

export const CONTENT_COLS = ['title', 'type', 'status', 'assignee', 'doc', 'design', 'task', 'post', 'published', 'pillar', 'date', 'archive'] as const
export type ContentCol = typeof CONTENT_COLS[number]
const WIDTHS: Record<string, number> = {
  title: 300, type: 130, status: 156, assignee: 130,
  doc: 124, design: 116, task: 104, post: 120, published: 128, pillar: 120, date: 104, archive: 80,
}
export const LINK_COLS = ['doc', 'design', 'post', 'published'] as const
/** Spec 019 stage 2: each built-in column as a task field (its icon and, for Stage and Type, its words). */
const FIELD_OF: Record<string, TaskField> = {
  type: 'type', status: 'stage', assignee: 'assignee', doc: 'link:doc', design: 'link:design', task: 'task',
  post: 'link:post', published: 'link:published', pillar: 'pillar', date: 'due',
}
const STAGE_ORDER = Object.keys(STAGE_META)

/** A piece's link for a column, from its attachments (working doc, design) or its own fields. */
export function pieceLink(task: Task, col: typeof LINK_COLS[number]): string | null {
  if (col === 'post') return task.post_url ?? null
  if (col === 'published') return task.published_url ?? null
  const role = col === 'doc' ? 'working_doc' : 'design'
  const a = (task.attachments ?? []).filter((x: TaskAttachment) => x.link_role === role)
  return a.length ? a[a.length - 1].url ?? null : null
}

/**
 * "3 Nov", "3 نوفمبر": the month in the reader's language, the day in Western
 * digits in every language (spec 009: counts and dates stay in Western digits).
 */
export function shortDate(ymd: string | null | undefined, lang = 'en'): string {
  if (!ymd) return ''
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat(intlLocale(lang), { day: 'numeric', month: 'short' }).format(d)
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
  /** Spec 019 stage 2: the workspace's content types (the Values table for Type). */
  contentTypes?: { label: string }[]
  /** Spec 019 stage 2: how rows are grouped now ('theme' is the sheet's own order). */
  onGroupMode?(by: string): void
  /** Spec 013: whether a paste is a content plan (Paste plan) rather than cells to fill. */
  pasteAsRows?(grid: string[][], row: ContentRow | null, col: GridCol | null): boolean
  /** Spec 013: what a paste, clear or undo didn't change, by reason. */
  onSkipped?(skipped: Partial<Record<string, number>>): void
  /** The bulk bar (design/content-sheet-bulk-bar.html): the piece rows in the selection, and what this sheet calls each stage. */
  onSelectPieces?(taskIds: string[], stageWord: (id: StageId) => string): void
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
  const stageNames = useStageNames('content')
  const tf = useTranslations('sheets.fields')
  const locale = useLocale()
  /** Spec 019 stage 2: the sheet's view (group by, words); read through a ref, since the view loads after the model is built. */
  const viewRef = useRef<LinkedView>({})
  const boardName = (id: string) => { const m = STAGE_META[id as StageId]; return m ? (locale.startsWith('ar') ? m.label_ar : m.label_en) : id }
  /** A piece's stage as this sheet calls it: its own word, the Content sheet's word, or the board's name. */
  const stageWord = (id: string) => {
    const v = viewRef.current
    if (v.show === 'board') return boardName(id)
    return v.words?.stage?.[id]?.[0] ?? stageNames.video(id as StageId)
  }
  const typeWord = (label: string) => shownWord(label, viewRef.current.words?.type, viewRef.current.show, label)
  /** Typed or pasted text in Status or Type, as the value it stands for (null: not one). */
  function readWord(col: 'status' | 'type', text: string): string | null {
    const v = viewRef.current
    if (!text.trim()) return col === 'type' ? '' : null
    if (col === 'status') {
      const own = wordValue(text, v.words?.stage)
      if (own) return own
      const k = normTitle(text)
      const content = STAGE_ORDER.find(id => normTitle(stageNames.video(id as StageId)) === k)
      return content ?? matchStage(text, STAGE_ORDER.map(id => ({ id, names: [STAGE_META[id as StageId].label_en, STAGE_META[id as StageId].label_ar] })))
    }
    const own = wordValue(text, v.words?.type)
    if (own) return own
    return (p.contentTypes ?? []).find(x => normTitle(x.label) === normTitle(text))?.label ?? null
  }
  const byId = new Map(p.members.map(m => [m.id, m]))
  const taskOf = (row: ContentRow): Task | null => (row.kind === 'piece' || row.kind === 'clip' ? row.task : null)

  const cl = p.columns
  const isCustom = (col: GridCol) => cl.custom.is(col)
  const isText = (row: ContentRow, col: GridCol) => {
    if (row.kind === 'draft') return col === 'title'
    if (isCustom(col)) return (row.kind === 'piece' || row.kind === 'clip') && cl.custom.isText(row.task, col)
    // Spec 019 stage 2: Status and Type take typed and pasted words too (the menus stay on click and Enter).
    if (col === 'status' && (row.kind === 'piece' || row.kind === 'clip')) return !row.task.dropped_at
    if (row.kind !== 'piece' || row.task.dropped_at || !p.canEdit(row.task)) return false
    return col === 'title' || col === 'date' || col === 'type'
  }
  const isMenu = (row: ContentRow, col: GridCol) => {
    if (row.kind === 'add' || row.kind === 'draft' || row.kind === 'group') return false
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
        {/* A mouse shortcut only: the row's own aria-expanded and Space (onToggle) are the keyboard's way. */}
        <span className="fx-sheet-caret" aria-hidden="true"
              onClick={e => { e.stopPropagation(); p.onToggleTheme(th.id) }}>{row.collapsed ? '▸' : '▾'}</span>
        <span className="fx-content-theme-name">{th.name}</span>
        <span className="fx-sheet-muted"> · {row.pieces.filter(x => !x.dropped_at).length}</span>
      </span>
    )
  }

  /** The type as a filled pill, one colour per content type. */
  function typePill(label: string | null | undefined) {
    if (!label) return null
    return <span className="fx-content-type" style={{ background: contentTypeColor(label) }}>{typeWord(label)}</span>
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

  /** Status and Type read typed and pasted words as the value they stand for; the rest goes to the sheet as before. */
  function commitWord(row: ContentRow, col: GridCol, value: string): Promise<string | null> {
    if ((col === 'status' || col === 'type') && (row.kind === 'piece' || row.kind === 'clip')) {
      const v = readWord(col, value)
      if (v === null) return Promise.resolve(tf(col === 'status' ? 'notAStage' : 'notAType', { text: value.trim() }))
      if (col === 'status' && v === row.task.status) return Promise.resolve(null)
      if (col === 'type' && v === (row.task.content_type_label ?? '')) return Promise.resolve(null)
      return p.onCommit(row, col, v)
    }
    return p.onCommit(row, col, value)
  }

  // ── spec 019 stage 2: ⚙ Fields, ＋ and Values ──
  const tc = useTranslations('sheet.columns')
  const [drawer, setDrawer] = useState(false)
  const [valuesFor, setValuesFor] = useState<WordField | null>(null)
  const [addAt, setAddAt] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const on = () => setDrawer(true)
    document.addEventListener(FIELDS_OPEN, on)
    return () => document.removeEventListener(FIELDS_OPEN, on)
  }, [])
  const colLabel = (key: string) => cl.nameOf(key) || (isCustom(key) ? '' : t(`col.${key as ContentCol}`))

  const model: GridModel<ContentRow> = {
    rows: p.rows,
    cols: cl.cols,
    widths: { ...WIDTHS, ...cl.widths },
    rowNoWidth: 40,
    label: t('gridLabel'),
    header: col => {
      const named = cl.laid.find(c => c.key === col)?.name
      const text = col === 'archive' && !named ? '' : (named ?? (isCustom(col) ? '' : t(`col.${col as ContentCol}`)))
      // Spec 019 stage 2: a task field's heading has its icon before the name.
      const f = FIELD_OF[col]
      return {
        text: f && text ? <><FieldIcon field={f} />{text}</> : text,
        label: col === 'archive' && !named ? t('col.archive') : f && text ? text : undefined,
      }
    },
    ...cl.grid,
    tailHeader: <button type="button" className="fx-fd-plus" data-add-field="" aria-haspopup="menu" aria-label={tf('addTitle')} title={tf('addTitle')}
                        onPointerDown={e => e.stopPropagation()} onClick={e => setAddAt(e.currentTarget)}>＋</button>,
    onTypeAhead: (row, col, ch, anchor) => {
      if (row.kind !== 'piece' && row.kind !== 'clip') return false
      if (col === 'type') return p.onTypeAhead(row, ch, anchor)
      return isCustom(col) ? cl.custom.typeAhead(row.task, col, ch, anchor, row.key) : false
    },
    colsOf: row => (row.kind === 'theme' || row.kind === 'pillar' || row.kind === 'group' ? ['rowNo', 'title'] : null),
    rowProps: row => ({
      className: [
        row.kind === 'theme' ? 'is-video fx-content-theme-row' : '',
        row.kind === 'pillar' || row.kind === 'group' ? 'fx-content-pillar-row' : '',
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
      if (col === 'status') return row.kind === 'clip' ? stageNames.video(task.status as StageId) : stageWord(task.status)
      if (col === 'type') return task.content_type_label ? typeWord(task.content_type_label) : ''
      return ''
    },
    describedBy: (row, col) => (col === 'status' && (row.kind === 'piece' || row.kind === 'clip') ? `fx-tip-${row.key}` : undefined),
    isDraft: row => row.kind === 'draft',
    inputLabel: (row, col) => (row.kind === 'draft' ? t('newPiece.label') : isCustom(col) ? cl.nameOf(col) : t(`col.${col as 'title'}`)),
    inputPlaceholder: (row, col) => (row.kind === 'draft' ? t('newPiece.placeholder') : col === 'date' ? '2026-11-20…' : undefined),
    inputDir: col => (col === 'date' ? 'ltr' : undefined),
    readOnlyNote: (row, col) => {
      const task = taskOf(row)
      if (task && isCustom(col)) return cl.custom.readOnlyNote(task, col)
      return row.kind === 'piece' && task && !task.dropped_at && (col === 'title' || col === 'date') && !p.canEdit(task) ? t('readOnly') : null
    },
    onCommit: (row, col, v) => commitWord(row, col, v),
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
      if (row.kind === 'group') {
        return col === 'rowNo' ? row.n : (
          <span className="fx-content-pillar" data-group-row={row.label}>{row.label}<span className="fx-sheet-muted"> · {row.count}</span></span>
        )
      }
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
                <span className="fx-sheet-caret" aria-hidden="true"
                      onClick={e => { e.stopPropagation(); p.onToggleVideo(task.id) }}>{row.expanded ? '▾' : '▸'}</span>
              )}
              <span className="fx-sheet-ellipsis" title={task.name}>{task.name}</span>
              {task.dropped_at && <span className="fx-sheet-sr">, {t('archive.archivedSr')}</span>}
            </span>
          )
        }
        case 'type':     return typePill(task.content_type_label)
        case 'status':   return <StatusContent task={task} me={p.me} tipId={`fx-tip-${row.key}`} ns={isClip ? 'sheet' : 'content'} name={isClip ? undefined : stageWord(task.status)} />
        case 'assignee': return <EditorContent member={task.assignee_id ? byId.get(task.assignee_id) : undefined} t={ts} />
        case 'pillar': {
          if (isClip) return null
          const pl = row.theme.pillars.find((x: ContentTheme['pillars'][number]) => x.id === task.pillar_id)
          return pl ? <span className="fx-sheet-ellipsis">{pl.name}</span> : <span className="fx-sheet-muted">{t('pillar.none')}</span>
        }
        case 'doc': case 'design': case 'post': case 'published':
          return isClip ? null : linkCell(task, col, can)
        case 'task':
          // Every piece is a task: its link is always there (FR: the team sheet's Task Link).
          return isClip ? null : (
            <a className="fx-sheet-link fx-sheet-ellipsis" href={`/board?task=${task.id}`} tabIndex={-1}
               // Cmd/Ctrl-click (and the middle button) open the task the browser's way, in a new tab; a plain click opens it here, through the cell.
               onPointerDown={e => { if (e.metaKey || e.ctrlKey) e.stopPropagation() }}
               onClick={e => { if (e.metaKey || e.ctrlKey) e.stopPropagation(); else e.preventDefault() }}>{t('links.openTask')}</a>
          )
        case 'date':
          if (isClip) return null
          if (task.status === 'publish') return <span className="fx-sheet-ellipsis fx-cs-tnum">{t('date.published', { date: shortDate(task.stage_date, locale) })}</span>
          return task.due_date ? <span className="fx-sheet-ellipsis fx-cs-tnum">{t('date.due', { date: shortDate(task.due_date, locale) })}</span> : null
        case 'archive':
          return isClip || !can ? null : <span className="fx-sheet-dropb">{task.dropped_at ? t('archive.restore') : t('archive.archive')}</span>
      }
      return null
    },
  }

  // Spec 013: ranges, paste into cells, clear and undo, each cell through its own save.
  // Spec 015: formatting by task and column; undo through the sheet's own stack.
  const leRef = useRef<{ recordFormats(label: string, items: import('@/lib/sheet-format').FormatItem[]): void; record(label: string, changes: import('@/lib/sheet-undo').LinkedChange[]): void; writeCells(w: import('@/components/sheet/GridCore').CellWrite[], why: import('@/components/sheet/GridCore').WriteWhy): Promise<import('@/components/sheet/GridCore').WriteResult> } | null>(null)
  // Stage 3: the sheet's sort and filter (inside each group) and its rules; the grid shows the arranged rows.
  // They read what a cell shows: its text, or a pill's label.
  const shownText = (row: ContentRow, col: GridCol) => {
    const task = taskOf(row)
    if (task && !isCustom(col)) {
      switch (col) {
        case 'status': return row.kind === 'clip' ? stageNames.video(task.status as StageId) : stageWord(task.status)
        case 'assignee': return task.assignee_id ? byId.get(task.assignee_id)?.name ?? '' : ''
        case 'type': return task.content_type_label ? typeWord(task.content_type_label) : ''
        case 'pillar': return row.kind === 'piece' ? row.theme.pillars.find((x: ContentTheme['pillars'][number]) => x.id === task.pillar_id)?.name ?? '' : ''
        case 'doc': case 'design': case 'post': case 'published': return pieceLink(task, col) ?? ''
        case 'date': return task.status === 'publish' ? task.stage_date ?? '' : task.due_date ?? ''
      }
    }
    return model.textValue(row, col) || (col === 'rowNo' ? '' : nodeText(model.render(row, col, () => undefined)).trim())
  }
  const lv = useLinkedView<ContentRow>({
    enabled: !!p.linked, sheetKey: 'linked_content', rows: p.rows,
    kind: row => (row.kind === 'piece' ? 'item' : row.kind === 'clip' ? 'child' : 'fixed'),
    taskOf: row => taskOf(row)?.id ?? null, textValue: shownText, say: text => p.linked?.say(text),
  })
  viewRef.current = lv.store.view
  const by = lv.store.view.groupBy?.by ?? 'theme'
  useEffect(() => { p.onGroupMode?.(by) }, [by]) // eslint-disable-line react-hooks/exhaustive-deps
  /** Spec 019 stage 2: Group by Stage, Assignee or Type, or None, instead of Theme › Pillar. */
  const rows = useMemo(() => {
    if (by === 'theme' || by === 'col') return lv.rows
    if (by === 'none') return regroupContent(lv.rows, null)
    return regroupContent(lv.rows, task => {
      if (by === 'stage') return { key: task.status, label: stageWord(task.status), order: String(STAGE_ORDER.indexOf(task.status)).padStart(3, '0') }
      if (by === 'assignee') { const n = task.assignee_id ? byId.get(task.assignee_id)?.name ?? '' : ''; return n ? { key: `a${task.assignee_id}`, label: n, order: `0${n.toLowerCase()}` } : { key: 'none', label: tf('bandUnassigned'), order: '1' } }
      const ty = task.content_type_label ?? ''
      return ty ? { key: `t${ty}`, label: typeWord(ty), order: `0${ty.toLowerCase()}` } : { key: 'none', label: tf('bandNoType'), order: '1' }
    })
  }, [lv.rows, by, lv.store.view.words, lv.store.view.show]) // eslint-disable-line react-hooks/exhaustive-deps
  model.rows = rows
  const colName = (col: GridCol) => { const h = model.header(col); return h.label ?? (typeof h.text === 'string' ? h.text : col) }
  const cellName = (row: ContentRow, col: GridCol) => {
    if (col === 'rowNo') return ''
    const h = model.header(col)
    const colName = h.label ?? (typeof h.text === 'string' ? h.text : col)
    const task = taskOf(row)
    return task ? `${task.name} · ${colName}` : colName
  }
  const lf = useLinkedFormats<ContentRow>({
    enabled: !!p.linked, sheetKey: 'linked_content', rows, cols: model.cols, active: p.active,
    store: lv.store, ruleLooks: lv.ruleLooks, colName, shownText, rawRows: p.rows, isItem: row => row.kind === 'piece',
    record: (label, changes) => leRef.current?.record(label, changes),
    taskOf: row => taskOf(row)?.id ?? null, cellName, textValue: model.textValue,
    recordFormats: (label, items) => leRef.current?.recordFormats(label, items),
    writeCells: (w, why) => leRef.current?.writeCells(w, why) ?? Promise.resolve(null),
    say: text => p.linked?.say(text),
    select: (taskId, col) => {
      const row = rows.find(r => taskOf(r)?.id === taskId)
      if (row) { p.setActive({ key: row.key, col }); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cell="${row.key}|${col}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })) }
    },
  })
  const le = useLinkedEditing<ContentRow>({
    applyFormats: lf.applyFormats,
    applyExtra: ch => (ch.kind === 'rules' ? lv.store.saveRules(ch.after) : lv.store.saveView(ch.after as LinkedView)),
    rows, cols: model.cols, isText: model.isText, textValue: model.textValue, commit: (row, col, v) => commitWord(row, col, v),
    readOnlyNote: (row, col) => model.readOnlyNote?.(row, col) ?? null,
    isCellRow: row => row.kind === 'piece' || row.kind === 'clip',
    onSkipped: p.onSkipped,
    drop: p.linked?.drop, restore: p.linked?.restore,
  })
  const lm = useLinkedMenu<ContentRow>({
    areas: lf.areasNow,
    rows, cols: model.cols, widths: model.widths, columns: cl, removal: 'archive',
    taskOf,
    canRemove: row => row.kind === 'piece' && !row.task.dropped_at && p.canEdit(row.task),
    insertRow: row => p.linked?.insertRow(row) ?? false,
    writeCells: le.writeCells, dropRows: le.dropRows, onSkipped: p.onSkipped,
    say: text => p.linked?.say(text),
    heights: p.linked?.heights, saveHeights: p.linked?.saveHeights,
  })
  leRef.current = le
  Object.assign(model, {
    cellStyle: lf.cellStyle, cellIcon: lf.cellIcon, onSelect: lf.onSelect, onAreasNotice: lf.onAreasNotice, marked: lf.marked, headerExtra: lf.headerExtra,
    selection: true, onCommit: le.onCommit, writeCells: le.writeCells, onUndo: le.onUndo, onRedo: le.onRedo,
    pasteAsRows: p.pasteAsRows, onSkipped: p.onSkipped,
    ...(p.linked ? { contextMenu: lm.contextMenu, rowHeight: lm.rowHeight, onRowResize: lm.onRowResize } : {}),
  } satisfies Partial<GridModel<ContentRow>>)
  // Spec 020: zoom, the fill handle, Alt+↓ pick list and Ctrl+; on the board's sheets in the workbook.
  const tips = useGridTips(model, { enabled: !!p.linked, writeCells: le.writeCells, onUndo: le.onUndo, onSkipped: p.onSkipped, say: text => p.linked?.say(text) })
  Object.assign(model, tips.model)
  // The bulk bar (design/content-sheet-bulk-bar.html): which pieces the selection covers.
  const selectFmt = model.onSelect
  const lastPieces = useRef('')
  model.onSelect = (q, list) => {
    selectFmt?.(q, list)
    if (!p.onSelectPieces) return
    const ids: string[] = []
    for (const a of list?.length ? list : [q]) {
      for (let r = Math.max(0, a.r0); r <= a.r1 && r < model.rows.length; r++) {
        const row = model.rows[r]
        if (row.kind === 'piece' && !ids.includes(row.task.id)) ids.push(row.task.id)
      }
    }
    const sig = ids.join(',')
    if (sig !== lastPieces.current) { lastPieces.current = sig; p.onSelectPieces(ids, id => stageWord(id)) }
  }

  const view = lv.store.view
  const saveView = (patch: Partial<LinkedView>) => void lv.store.saveView({ ...view, ...patch })
  const laid = cl.laid
  const asRow = (c: (typeof laid)[number]): PresetRow => {
    const i = laid.indexOf(c), name = colLabel(c.key) || t('col.archive')
    return {
      key: c.key, name, icon: c.kind ? 'regular' : FIELD_OF[c.key] ?? null, shown: c.shown, who: cl.changedBy(c), locked: c.key === 'title',
      values: c.key === 'status' ? 'stage' : c.key === 'type' ? 'type' : undefined,
      up: i > 1 && c.key !== 'title', down: c.key !== 'title' && i < laid.length - 1,
      upLabel: tc('moveUp', { name }), downLabel: tc('moveDown', { name }),
    }
  }
  const closeBack = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-content-sheet] .fx-sheet-td.is-active, [data-content-sheet] [data-cell][tabindex="0"]')?.focus())
  const addItems: MenuItem[] = addAt ? [
    ...laid.filter(c => c.builtIn && !c.shown).map(c => ({
      key: c.key, text: colLabel(c.key) || t('col.archive'), group: tf('fieldsTitle'),
      label: <span className="fx-fd-mi">{FIELD_OF[c.key] && <FieldIcon field={FIELD_OF[c.key]} />}{colLabel(c.key) || t('col.archive')}</span>,
      onSelect: () => { setAddAt(null); void cl.setShown(c.key, true) },
    })),
    { key: 'regular', text: tf('spreadsheetCol'), group: tf('regularTitle'), label: <span className="fx-fd-mi"><FieldIcon field="regular" />{tf('spreadsheetCol')}</span>,
      onSelect: () => { const a = addAt; setAddAt(null); cl.openAdd(a) } },
  ] : []

  return (
    <>
    <GridCore model={model} active={p.active} setActive={p.setActive}
              editDraft={p.editDraft ? `d:${p.editDraft}` : null} notes={p.notes} onNote={p.onNote}
              selectAreas={tips.grid.selectAreas} optionsAt={tips.grid.optionsAt} />
    {lm.node}
    {lf.node}
    {tips.node}
    {addAt && <SheetMenu anchor={addAt} label={tf('addTitle')} items={addItems} onClose={() => setAddAt(null)} />}
    {drawer && (
      <PresetFieldsDrawer
        rowsName={tf('rowsContent')} rowsHelp={tf('rowsContentHelp')}
        groups={[
          { value: 'theme', label: tf('groupTheme') }, { value: 'stage', label: tf('names.stage') },
          { value: 'assignee', label: tf('names.assignee') }, { value: 'type', label: tf('names.type') }, { value: 'none', label: tf('groupNone') },
        ]}
        group={by}
        onGroup={v => saveView({ groupBy: v === 'theme' ? null : { by: v as 'stage' | 'assignee' | 'type' | 'none' } })}
        fields={laid.filter(c => !c.kind).map(asRow)}
        regular={laid.filter(c => c.kind).map(asRow)}
        onToggle={(key, on) => void cl.setShown(key, on)}
        onMove={(key, dir) => { const i = laid.findIndex(c => c.key === key); void cl.move(key, dir < 0 ? laid[i - 1]?.key ?? null : laid[i + 2]?.key ?? null) }}
        onValues={f => setValuesFor(f)}
        onAddRegular={a => cl.openAdd(a)}
        onClose={() => { setDrawer(false); closeBack() }} />
    )}
    {valuesFor && (
      <ValuesDialog field={valuesFor} map={{ words: view.words, show: view.show }} types={(p.contentTypes ?? []).map(x => x.label)}
                    defaults={valuesFor === 'stage' ? Object.fromEntries(STAGE_ORDER.map(id => [id, stageNames.video(id as StageId)])) : undefined}
                    onSave={(words, show) => {
                      const all = { ...(view.words ?? {}), [valuesFor]: words }
                      if (!Object.keys(words).length) delete all[valuesFor]
                      saveView({ words: all, show })
                      setValuesFor(null); closeBack()
                    }}
                    onClose={() => { setValuesFor(null); closeBack() }} />
    )}
    </>
  )
}
