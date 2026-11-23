'use client'

/**
 * The video sheet's grid (spec 008): the clip model over the shared GridCore.
 * Video rows group their clips; "+ Clip" rows add one; drafts are clips not
 * saved yet. Keyboard, focus, editing and ARIA live in GridCore.
 */
import { withNumberFormats } from '@/components/sheet/linkedNumbers'
import { useLocale, useTranslations } from 'next-intl'
import type { SpaceStagesApi } from '@/components/spaces/useSpaceStages'
import type { ContentTheme, Member, SheetColumn, SLAConfig, Task, TaskField, WordField } from '@/types/index'
import type { MutableRefObject } from 'react'
import { contentTypeColor } from '@/lib/tokens'
import { businessDaysBetween } from '@/lib/utils'
import { COLUMN_WIDTHS, ROW_NO_WIDTH } from './columns'
import { regroupVideos, type SheetRow } from './rows'
import { STAGE_META } from '@/lib/stage-meta'
import { matchStage, normTitle, wordValue } from '@/lib/sheet-links'
import { FieldIcon } from '@/components/sheets/links/FieldCells'
import { FIELDS_OPEN, PresetFieldsDrawer, ValuesDialog, type PresetRow } from '@/components/sheets/links/FieldsPanel'
import { SheetMenu, type MenuItem } from './SheetMenu'
import { clipLength, formatClipTime } from './time'
import { StatusContent, useStageNames } from './StatusCell'
import type { StageId } from '@/types/index'
import { EditorContent } from './EditorCell'
import { FilesContent, type FilesCellState } from './FilesCell'
import { PublishedContent } from './PublishedCell'
import { LinkPill, hostOf, linkKind } from './LinkPill'
import { GridCore, type GridModel, type GridCol, type ActiveCell } from './GridCore'
import type { SheetColumnsHook } from './useSheetColumns'
import { useLinkedEditing } from './useLinkedEditing'
import { nodeText, useLinkedView, type LinkedView } from '@/components/sheet/useLinkedView'
import { useGridTips } from '@/components/sheet/useGridTips'
import { gateFeatureCells, gateFeatureStyle, type OffNote } from '@/components/sheet/featureCells'
import { offFeatureFor } from '@/lib/brand-features'
import { useLinkedFormats } from './useLinkedFormats'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLinkedMenu } from './useLinkedMenu'

export type { GridCol, ActiveCell }

/** Spec 019 stage 3: the built-in columns that are task fields (their icon in the heading). */
const FIELD_OF: Record<string, TaskField> = { type: 'type', status: 'stage', editor: 'assignee', files: 'link:doc', published: 'link:published' }
const STAGE_ORDER = Object.keys(STAGE_META)

/** The redesign's stage groups, for a video's band (design/video-sheet-v2.html). */
const BUCKETS = [
  { key: 'todo', stages: ['todo', 'c-prog', 'c-final', 'c-check', 'r-design'], color: 'var(--vs-todo)' },
  { key: 'editing', stages: ['d-prog'], color: 'var(--vs-editing)' },
  { key: 'review', stages: ['d-check', 'final-check'], color: 'var(--vs-review)' },
  { key: 'ready', stages: ['ready-publish', 'scheduled'], color: 'var(--vs-ready)' },
  { key: 'published', stages: ['publish'], color: 'var(--vs-published)' },
] as const
/** The Content sheet's link columns, on a clip: Working Doc and Design are link attachments, LinkedIn its post link. */
export const CLIP_LINK_COLS = ['doc', 'design', 'post'] as const
export function clipLink(task: Task, col: typeof CLIP_LINK_COLS[number]): string | null {
  if (col === 'post') return task.post_url ?? null
  const role = col === 'doc' ? 'working_doc' : 'design'
  const a = (task.attachments ?? []).filter(x => x.link_role === role)
  return a.length ? a[a.length - 1].url ?? null : null
}
/** The board fields a Video sheet column can follow (design/video-sheet-v5.html). */
export const CLIP_FIELDS = ['priority', 'platform', 'theme', 'pillar', 'owner', 'due'] as const
export type ClipField = typeof CLIP_FIELDS[number]
const LINK_ICON = <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.9.9M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.9-.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
/** From Edit Review on, a clip shows who signs it off. */
const REVIEW_FROM = STAGE_ORDER.indexOf('d-check')

/** Columns typed into. */
const TEXT_COLS: GridCol[] = ['title', 'clipNo', 'source', 'fileName', 'in', 'out']

export interface SheetGridProps {
  /** Spec 022 (R19): the Link task cell on a video's row, from the sheet. */
  media?: { render(task: Task): React.ReactNode; open(task: Task, anchor: HTMLElement, typed?: string): void; text(task: Task): string }
  /** Spec 022 (US4): the linked Space's stages — names shown and typed here. */
  stages?: SpaceStagesApi | null
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
  /** Spec 019 stage 3: the column set on show (the drawer's switches act on it). */
  setName?: string
  /** Each stage's time limit (business days) by content type: In stage turns red past it. */
  slaConfig?: SLAConfig
  /** A column linked to a board field saves through this (design/video-sheet-v5.html): null, or why not. */
  boardField?(task: Task, field: string, value: string): Promise<string | null>
  /** Themes, for the names in a column linked to Theme or Pillar. */
  themes?: ContentTheme[]
  /** The clips inside the selection (whole rows or cells across rows), for the bulk bar. */
  /** The clip rows in the selection, and what this sheet calls each stage (for the bulk bar's Stage list). */
  onSelectClips?(taskIds: string[], stageWord: (id: StageId) => string): void
  /** The column menu's extra items, filled in here (the column hook lives in VideoSheet). */
  menuRef?: MutableRefObject<((key: string, anchor: HTMLElement) => MenuItem[]) | null>
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
  const stageNames = useStageNames('sheet')
  const tf = useTranslations('sheets.fields')
  const tc = useTranslations('sheet.columns')
  const locale = useLocale()
  /** Spec 019 stage 3: the sheet's view (group by, words), read through a ref since it loads after the model. */
  const viewRef = useRef<LinkedView>({})
  const boardName = (id: string) => { const m = STAGE_META[id as StageId]; return m ? (locale.startsWith('ar') ? m.label_ar : m.label_en) : id }
  /** A stage as this sheet calls it: its own word, the Video sheet's word, or the board's name. */
  const stageWord = (id: string) => {
    if (p.stages) return p.stages.stageName(id)
    const v = viewRef.current
    if (v.show === 'board') return boardName(id)
    return v.words?.stage?.[id]?.[0] ?? stageNames.video(id as StageId)
  }
  /** A task's stage here: its Space stage (a sub-stage when split), else the stage's word. */
  const stageOf = (task: Task) => (p.stages ? p.stages.name(task) : stageWord(task.status))
  /** Spec 022 (US4): a typed Space stage — a sub-stage move within the stage, else a real move then its sub-stage. */
  function commitSpaceStage(row: { task: Task }, col: GridCol, value: string): Promise<string | null> | null {
    const st = p.stages
    const entry = st?.match(value)
    if (!st || !entry) return null
    const task = row.task
    if (entry.stage_id === task.status) return st.sub(task, entry).then(err => (err ? tf('notAStage', { text: value.trim() }) : null))
    return p.onCommit(row as never, col, entry.stage_id).then(err => {
      if (!err && entry.position > 0) void st.sub({ ...task, status: entry.stage_id }, entry)
      return err
    })
  }
  /** Typed or pasted text in Status, as the stage it stands for (null: not one). */
  function readStage(text: string): string | null {
    const own = wordValue(text, viewRef.current.words?.stage)
    if (own) return own
    const k = normTitle(text)
    return STAGE_ORDER.find(id => normTitle(stageNames.video(id as StageId)) === k)
      ?? matchStage(text, STAGE_ORDER.map(id => ({ id, names: [STAGE_META[id as StageId].label_en, STAGE_META[id as StageId].label_ar] })))
  }
  function commitWord(row: SheetRow, col: GridCol, value: string): Promise<string | null> {
    const lfc = linkedOf(col)
    if (lfc) return row.kind === 'clip' && p.boardField ? p.boardField(row.task, lfc, value) : Promise.resolve(null)
    if (col === 'status' && (row.kind === 'clip' || row.kind === 'video')) {
      const done = commitSpaceStage(row, col, value)
      if (done) return done
      const v = readStage(value)
      if (!v) return Promise.resolve(tf('notAStage', { text: value.trim() }))
      if (v === row.task.status) return Promise.resolve(null)
      return p.onCommit(row, col, v)
    }
    return p.onCommit(row, col, value)
  }
  const membersById = new Map(p.members.map(m => [m.id, m]))
  const dayFmt = new Intl.DateTimeFormat(locale.startsWith('ar') ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const dueText = (d: string | null | undefined) => (d ? dayFmt.format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : '')
  /** Who signs the clip off: its task owner, once it reaches review. */
  const reviewerOf = (task: Task) => (STAGE_ORDER.indexOf(task.status) >= REVIEW_FROM ? membersById.get(task.task_owner_id) : undefined)
  /** How long the clip has been in its stage: hours under a day, else working days; late past the stage's limit. */
  function inStage(task: Task): { text: string; late: boolean } | null {
    if (task.status === 'todo' || task.status === 'publish' || !task.stage_date) return null
    const from = new Date(task.stage_date), now = new Date()
    const hours = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 3_600_000))
    const days = businessDaysBetween(from, now)
    const limit = p.slaConfig?.[task.status]?.[task.content_type_label ?? '']
    return { text: hours < 24 ? `${Math.max(1, hours)}h` : `${days}d`, late: limit != null && days > limit }
  }
  const rowTask = (row: SheetRow): Task | null => (row.kind === 'clip' || row.kind === 'video' ? row.task : null)
  const [drawer, setDrawer] = useState(false)
  const [valuesFor, setValuesFor] = useState<WordField | null>(null)
  const [addAt, setAddAt] = useState<HTMLElement | null>(null)
  /** "Link to a board field…": which column (null: a new one from ＋) and where the field list opens. */
  const [fieldMenu, setFieldMenu] = useState<{ anchor: HTMLElement; key: string | null } | null>(null)
  useEffect(() => {
    const on = () => setDrawer(true)
    document.addEventListener(FIELDS_OPEN, on)
    return () => document.removeEventListener(FIELDS_OPEN, on)
  }, [])

  const cl = p.columns
  const isCustom = (col: GridCol) => cl.custom.is(col)
  /** The board field a custom column follows, if any. */
  const linkedOf = (col: GridCol): ClipField | undefined => {
    const f = isCustom(col) ? viewRef.current.colFields?.[col] : undefined
    return f && (CLIP_FIELDS as readonly string[]).includes(f) ? f as ClipField : undefined
  }
  const themeOf = (task: Task) => p.themes?.find(x => x.id === task.project_id)
  /** A clip's value for a board field, as text (`edit`: as typed back, dates as YYYY-MM-DD). */
  function fieldText(task: Task, f: ClipField, edit = false): string {
    switch (f) {
      case 'priority': return task.priority ?? ''
      case 'platform': return task.platform ?? ''
      case 'theme': return themeOf(task)?.name ?? ''
      case 'pillar': return themeOf(task)?.pillars.find(x => x.id === task.pillar_id)?.name ?? ''
      case 'owner': return membersById.get(task.task_owner_id)?.name ?? ''
      case 'due': return task.due_date ? (edit ? task.due_date.slice(0, 10) : dueText(task.due_date)) : ''
    }
  }
  const isText = (row: SheetRow, col: GridCol) => {
    if (row.kind === 'draft') return col === 'title'
    if (linkedOf(col)) return row.kind === 'clip' && !row.task.dropped_at && p.canEdit(row.task)
    // Spec 019 stage 3: Status takes typed and pasted words too (the menu stays on click and Enter).
    if (col === 'status' && (row.kind === 'clip' || row.kind === 'video')) return !row.task.dropped_at
    if (isCustom(col)) return (row.kind === 'clip' || row.kind === 'video') && cl.custom.isText(row.task, col)
    if (row.kind === 'video') return col === 'title' && p.canEdit(row.task)
    if (row.kind !== 'clip' || row.task.dropped_at) return false
    return TEXT_COLS.includes(col) && p.canEdit(row.task)
  }
  const isMenu = (row: SheetRow, col: GridCol) => {
    if (row.kind === 'add' || row.kind === 'draft' || row.kind === 'group') return false
    if (col === 'rowNo') return true
    if (linkedOf(col)) return false
    if (isCustom(col)) return cl.custom.isMenu(col)
    if (col === 'media') return row.kind === 'video'
    if (row.kind === 'video') return false
    return ['status', 'editor', 'type', 'files', 'published', 'drop', 'doc', 'design', 'post', 'task'].includes(col)
  }

  /** A video's band: name, clip count, a bar and words for its clips' stages, and its due date. */
  function band(row: Extract<SheetRow, { kind: 'video' }>) {
    const task = row.task
    const live = row.clips.filter(c => !c.dropped_at)
    const counts = BUCKETS.map(b => ({ ...b, n: live.filter(c => (b.stages as readonly string[]).includes(c.status)).length }))
    const mix = counts.filter(b => b.n > 0 || b.key === 'todo' || b.key === 'published').map(b => t(`band.${b.key}`, { n: b.n })).join(' · ')
    const due = task.due_date ?? live.map(c => c.due_date).filter(Boolean).sort().pop() ?? null
    const done = counts.find(b => b.key === 'published')!.n
    return (
      <span className="fx-sheet-title fx-vs-band" data-video-band={task.id}>
        <span className="fx-sheet-caret" role="button" tabIndex={-1} aria-hidden="true"
              onClick={e => { e.stopPropagation(); p.onToggle(task.id) }}>{row.collapsed ? '▸' : '▾'}</span>
        <b className="fx-sheet-ellipsis fx-vs-band-name" title={task.name}>{task.name}</b>
        <span className="fx-vs-band-n">{t('band.clips', { n: live.length })}</span>
        {live.length > 0 && (
          <span className="fx-vs-prog" role="img" aria-label={t('band.progress', { done, all: live.length })}>
            {counts.filter(b => b.n).map(b => <span key={b.key} style={{ width: `${(b.n / live.length) * 100}%`, background: b.color }} />)}
          </span>
        )}
        <span className="fx-vs-band-mix">{mix}</span>
        {p.allVideos && <span className="fx-sheet-open" role="link" tabIndex={-1} title={t('openOnItsOwn', { name: task.name })}
                              onClick={e => { e.stopPropagation(); p.onOpenVideo(task.id) }} aria-hidden="true">↗</span>}
        {due && <span className="fx-vs-band-due">{t.rich('band.due', { date: dueText(due), b: c => <b>{c}</b> })}</span>}
      </span>
    )
  }

  const model: GridModel<SheetRow> = {
    rows: p.rows,
    cols: cl.cols,
    widths: { ...COLUMN_WIDTHS, ...cl.widths },
    rowNoWidth: ROW_NO_WIDTH,
    label: p.label,
    header: col => {
      const named = cl.laid.find(c => c.key === col)?.name
      const text = col === 'drop' && !named ? '' : (named ?? (isCustom(col) ? '' : t(`col.${col as SheetColumn}`)))
      // The redesign: plain names under the column letters, as in a spreadsheet.
      // A column that follows a board field carries a link badge.
      const lk = linkedOf(col)
      const badge = lk ? tf('linkedBadge', { field: tf(`names.${lk}`) }) : ''
      return {
        text: lk ? <><span className="fx-vs-lk" role="img" aria-label={badge} title={badge} data-linked-field={lk}>{LINK_ICON}</span>{text}</> : text,
        label: col === 'drop' && !named ? t('col.drop') : lk && typeof text === 'string' ? text : undefined,
        sort: col === 'clipNo' ? 'ascending' : undefined,
        className: ['due', 'inStage', 'clipNo', 'in', 'out', 'length'].includes(col) ? 'is-num' : undefined,
      }
    },
    letters: true,
    ...cl.grid,
    tailHeader: <button type="button" className="fx-fd-plus" data-add-field="" aria-haspopup="menu" aria-label={tf('addTitle')} title={tf('addTitle')}
                        onPointerDown={e => e.stopPropagation()} onClick={e => setAddAt(e.currentTarget)}>＋</button>,
    // A video is a band across the sheet, like a group heading.
    colsOf: row => (row.kind === 'group' || row.kind === 'video' ? ['rowNo', 'title'] : null),
    onTypeAhead: (row, col, ch, anchor) => {
      if (row.kind !== 'clip' && row.kind !== 'video') return false
      if (col === 'type') return p.onTypeAhead(row, ch, anchor)
      // Spec 022: typing in a video's Link task cell opens the list.
      if (col === 'media') { if (row.kind === 'video') p.media?.open(row.task, anchor, ch); return true }
      return isCustom(col) && !linkedOf(col) ? cl.custom.typeAhead(row.task, col, ch, anchor, row.key) : false
    },
    rowProps: row => {
      const task = rowTask(row)
      return {
        className: [
          row.kind === 'video' ? 'is-video' : '',
          row.kind === 'group' ? 'fx-content-pillar-row' : '',
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
      if (['clipNo', 'in', 'out', 'length', 'due', 'inStage'].includes(col)) c.push('fx-sheet-num')
      if (col === 'inStage' && row.kind === 'clip' && inStage(row.task)?.late) c.push('is-late')
      if (['source', 'fileName'].includes(col)) c.push('fx-sheet-mono')
      if (isMenu(row, col) || row.kind === 'add') c.push('is-action')
      if (isCustom(col)) c.push('is-custom', linkedOf(col) ? 'is-linked' : cl.custom.cellClass(col))
      if (linkedOf(col) === 'due') c.push('fx-sheet-num')
      return c.join(' ')
    },
    isText,
    isMenu,
    textValue: (row, col) => {
      const task = rowTask(row)
      if (!task) return ''
      const lft = linkedOf(col)
      if (lft) return row.kind === 'clip' ? fieldText(task, lft, true) : ''
      if (isCustom(col)) return cl.custom.textValue(task, col)
      switch (col) {
        case 'title':    return task.name
        case 'clipNo':   return task.clip?.clip_no == null ? '' : String(task.clip.clip_no)
        case 'source':   return task.clip?.source ?? ''
        case 'fileName': return task.clip?.file_name ?? ''
        case 'status':   return row.kind === 'video' || row.kind === 'clip' ? stageOf(task) : ''
        case 'in':       return formatClipTime(task.clip?.in_ms)
        case 'out':      return formatClipTime(task.clip?.out_ms)
        case 'due':      return row.kind === 'clip' ? dueText(task.due_date) : ''
        case 'doc': case 'design': case 'post': return row.kind === 'clip' ? clipLink(task, col) ?? '' : ''
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
      if (task && linkedOf(col)) return task.dropped_at ? t('drop.droppedSr') : !p.canEdit(task) ? t('readOnly') : null
      if (task && isCustom(col)) return cl.custom.readOnlyNote(task, col)
      return task && TEXT_COLS.includes(col) && !(row.kind === 'clip' && task.dropped_at) && !p.canEdit(task) ? t('readOnly') : null
    },
    onCommit: (row, col, v) => commitWord(row, col, v),
    onCancelDraft: row => p.onCancelDraft(row.key.slice(2)),
    onOpen: p.onOpen,
    onActivate: (row, col) => {
      if ((row.kind === 'clip' || row.kind === 'video') && isCustom(col) && !linkedOf(col)) return cl.custom.activate(row.task, col, row.key)
      if (row.kind === 'add' && col === 'title') { p.onAddClip(row.video.id); return true }
      return row.kind === 'add'
    },
    onToggle: row => { if (row.kind !== 'video') return false; p.onToggle(row.task.id); return true },
    onDelete: (row, col, anchor) => {
      const lfd = linkedOf(col)
      if (lfd) { if (row.kind === 'clip' && p.boardField) void p.boardField(row.task, lfd, '').then(err => { if (err) p.onNote(`${row.key}|${col}`, err) }); return true }
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
      if (row.kind === 'group') {
        return col === 'rowNo' ? row.n : <span className="fx-content-pillar" data-group-row={row.label}>{row.label}<span className="fx-sheet-muted"> · {row.count}</span></span>
      }
      const task = row.task
      const isVideo = row.kind === 'video'
      const can = p.canEdit(task)
      const lfr = linkedOf(col)
      if (lfr) {
        if (isVideo) return null
        if (lfr === 'owner') { const m = membersById.get(task.task_owner_id); return m ? <EditorContent member={m} t={t} /> : null }
        const v = fieldText(task, lfr)
        if (!v) return null
        if (lfr === 'priority') return <span className={`fx-vs-prio is-${v.toLowerCase()}`}>{v}</span>
        return <span className="fx-sheet-ellipsis" title={v}>{v}</span>
      }
      if (isCustom(col)) return cl.custom.render(task, col)
      switch (col) {
        case 'rowNo': return row.n
        case 'media': return isVideo ? p.media?.render(task) ?? null : null
        case 'title':
          if (isVideo && row.kind === 'video') return band(row)
          return (
            <span className="fx-sheet-title">
              <span className="fx-sheet-indent" aria-hidden="true" />
              <span className="fx-sheet-ellipsis" title={task.name}>{task.name}</span>
              {row.kind === 'clip' && task.dropped_at && <span className="fx-sheet-sr">, {t('drop.droppedSr')}</span>}
            </span>
          )
        case 'clipNo': return isVideo || task.clip?.clip_no == null ? '' : String(task.clip.clip_no).padStart(2, '0')
        case 'type':   return task.content_type_label ? <span className="fx-content-type" style={{ background: contentTypeColor(task.content_type_label) }}>{task.content_type_label}</span> : null
        case 'reviewer': { const r = isVideo ? undefined : reviewerOf(task); return r ? <EditorContent member={r} t={t} /> : null }
        case 'due':    return isVideo ? '' : dueText(task.due_date)
        case 'inStage': { const s = isVideo ? null : inStage(task); return s ? s.text : <span className="fx-sheet-muted">–</span> }
        case 'status': return <StatusContent task={task} me={p.me} tipId={`fx-tip-${row.key}`} name={stageOf(task)} />
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
        case 'doc': case 'design': case 'post': {
          if (isVideo) return null
          const url = clipLink(task, col)
          if (url) return <LinkPill kind={linkKind(url)} text={hostOf(url) || url} href={url} />
          return can && !task.dropped_at ? <span className="fx-sheet-muted">{t('links.add')}</span> : null
        }
        case 'task': return isVideo ? null : <LinkPill kind="task" text={t('links.openTask')} />
        case 'drop':
          return isVideo || !can ? null : <span className="fx-sheet-dropb">{task.dropped_at ? t('drop.restore') : t('drop.drop')}</span>
      }
      return null
    },
  }

  // Spec 021 (US4): a field the task's brand has switched off is a hatched, empty cell.
  const tFeat = useTranslations('spaces.features')
  const featureOff: OffNote<SheetRow> = (row, col) => {
    const task = rowTask(row)
    if (!task || !offFeatureFor(task.brand, linkedOf(col) ?? (isCustom(col) ? '' : col))) return null
    return tFeat('hidden', { brand: task.brand?.name ?? '' })
  }
  gateFeatureCells(model, featureOff)

  // Spec 013: ranges, paste into cells, clear and undo, each cell through its own save.
  // Spec 015: formatting by task and column; undo through the sheet's own stack.
  const leRef = useRef<{ recordFormats(label: string, items: import('@/lib/sheet-format').FormatItem[]): void; record(label: string, changes: import('@/lib/sheet-undo').LinkedChange[]): void; writeCells(w: import('@/components/sheet/GridCore').CellWrite[], why: import('@/components/sheet/GridCore').WriteWhy): Promise<import('@/components/sheet/GridCore').WriteResult> } | null>(null)
  // Stage 3: the sheet's sort and filter (inside each group) and its rules; the grid shows the arranged rows.
  // They read what a cell shows: its text, or a pill's label.
  const shownText = (row: SheetRow, col: GridCol) => {
    if (featureOff(row, col)) return ''
    const task = rowTask(row)
    if (task && !cl.custom.is(col)) {
      switch (col) {
        case 'status': return stageOf(task)
        case 'editor': return task.assignee_id ? membersById.get(task.assignee_id)?.name ?? '' : ''
        case 'media': return row.kind === 'video' ? p.media?.text(task) ?? '' : ''
        case 'type': return task.content_type_label ?? ''
        case 'length': return formatClipTime(clipLength(task.clip?.in_ms, task.clip?.out_ms))
        case 'reviewer': return row.kind === 'clip' ? reviewerOf(task)?.name ?? '' : ''
        case 'inStage': return row.kind === 'clip' ? inStage(task)?.text ?? '' : ''
      }
    }
    return model.textValue(row, col) || (col === 'rowNo' ? '' : nodeText(model.render(row, col, () => undefined)).trim())
  }
  const lv = useLinkedView<SheetRow>({
    enabled: !!p.linked, sheetKey: 'linked_video', rows: p.rows,
    kind: row => (row.kind === 'video' ? 'item' : 'child'),
    taskOf: row => rowTask(row)?.id ?? null, textValue: shownText, say: text => p.linked?.say(text),
  })
  viewRef.current = lv.store.view
  const by = lv.store.view.groupBy?.by ?? 'video'
  /** Spec 019 stage 3: the videos grouped by stage or editor, each with its clips. */
  const rows = useMemo(() => {
    if (by !== 'stage' && by !== 'assignee') return lv.rows
    return regroupVideos(lv.rows, v => {
      if (by === 'stage') return { key: v.status, label: stageWord(v.status), order: String(STAGE_ORDER.indexOf(v.status)).padStart(3, '0') }
      const n = v.assignee_id ? membersById.get(v.assignee_id)?.name ?? '' : ''
      return n ? { key: `a${v.assignee_id}`, label: n, order: `0${n.toLowerCase()}` } : { key: 'none', label: tf('bandUnassigned'), order: '1' }
    })
  }, [lv.rows, by, lv.store.view.words, lv.store.view.show]) // eslint-disable-line react-hooks/exhaustive-deps
  model.rows = rows
  const colName = (col: GridCol) => { const h = model.header(col); return h.label ?? (typeof h.text === 'string' ? h.text : col) }
  const cellName = (row: SheetRow, col: GridCol) => {
    if (col === 'rowNo') return ''
    const h = model.header(col)
    const colName = h.label ?? (typeof h.text === 'string' ? h.text : col)
    const task = rowTask(row)
    return task ? `${task.name} · ${colName}` : colName
  }
  const lf = useLinkedFormats<SheetRow>({
    enabled: !!p.linked, sheetKey: 'linked_video', rows, cols: model.cols, active: p.active,
    store: lv.store, ruleLooks: lv.ruleLooks, colName, shownText, rawRows: p.rows, isItem: row => row.kind === 'video',
    record: (label, changes) => leRef.current?.record(label, changes),
    taskOf: row => rowTask(row)?.id ?? null, cellName, textValue: model.textValue,
    recordFormats: (label, items) => leRef.current?.recordFormats(label, items),
    writeCells: (w, why) => leRef.current?.writeCells(w, why) ?? Promise.resolve(null),
    say: text => p.linked?.say(text),
    select: (taskId, col) => {
      const row = rows.find(r => rowTask(r)?.id === taskId)
      if (row) { p.setActive({ key: row.key, col }); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cell="${row.key}|${col}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })) }
    },
  })
  const le = useLinkedEditing<SheetRow>({
    applyFormats: lf.applyFormats, styleOf: lf.styleOf, taskOf: row => rowTask(row)?.id ?? null,
    applyExtra: ch => (ch.kind === 'rules' ? lv.store.saveRules(ch.after) : lv.store.saveView(ch.after as LinkedView)),
    rows, cols: model.cols, isText, textValue: model.textValue, commit: (row, col, v) => commitWord(row, col, v),
    readOnlyNote: (row, col) => model.readOnlyNote?.(row, col) ?? null,
    isCellRow: row => row.kind === 'clip' || row.kind === 'video',
    onSkipped: p.onSkipped,
    drop: p.linked?.drop, restore: p.linked?.restore,
  })
  const lm = useLinkedMenu<SheetRow>({
    areas: lf.areasNow,
    rows, cols: model.cols, widths: model.widths, columns: cl, removal: 'drop',
    taskOf: rowTask,
    canRemove: row => row.kind === 'clip' && !row.task.dropped_at && p.canEdit(row.task),
    insertRow: row => p.linked?.insertRow(row) ?? false,
    writeCells: le.writeCells, dropRows: le.dropRows, onSkipped: p.onSkipped,
    say: text => p.linked?.say(text),
    heights: p.linked?.heights, saveHeights: p.linked?.saveHeights,
  })
  leRef.current = le
  // Spec 015 FR-070: number formats show here too, and a copy carries them.
  withNumberFormats(model, lf.styleOf, locale, !!p.linked)
  Object.assign(model, {
    cellStyle: lf.cellStyle, cellIcon: lf.cellIcon, onSelect: lf.onSelect, onAreasNotice: lf.onAreasNotice, marked: lf.marked, headerExtra: lf.headerExtra,
    selection: true, onCommit: le.onCommit, writeCells: le.writeCells, onUndo: le.onUndo, onRedo: le.onRedo,
    pasteAsRows: p.pasteAsRows, onSkipped: p.onSkipped,
    ...(p.linked ? { contextMenu: lm.contextMenu, rowHeight: lm.rowHeight, onRowResize: lm.onRowResize } : {}),
  } satisfies Partial<GridModel<SheetRow>>)
  // Spec 020: zoom, the fill handle, Alt+↓ pick list and Ctrl+; on the board's sheets in the workbook.
  const tips = useGridTips(model, { enabled: !!p.linked, writeCells: le.writeCells, onUndo: le.onUndo, onSkipped: p.onSkipped, say: text => p.linked?.say(text) })
  Object.assign(model, tips.model)
  gateFeatureStyle(model, featureOff)
  // The bulk bar (design/video-sheet-bulk-bar.html): which clips the selection covers.
  const selectFmt = model.onSelect
  const lastClips = useRef('')
  model.onSelect = (q, list) => {
    selectFmt?.(q, list)
    if (!p.onSelectClips) return
    const ids: string[] = []
    for (const a of list?.length ? list : [q]) {
      for (let r = Math.max(0, a.r0); r <= a.r1 && r < model.rows.length; r++) {
        const row = model.rows[r]
        if (row.kind === 'clip' && !ids.includes(row.task.id)) ids.push(row.task.id)
      }
    }
    const sig = ids.join(',')
    if (sig !== lastClips.current) { lastClips.current = sig; p.onSelectClips(ids, id => stageWord(id)) }
  }

  // ── spec 019 stage 3: ⚙ Fields, ＋ and Values ──
  const view = lv.store.view
  const saveView = (patch: Partial<LinkedView>) => void lv.store.saveView({ ...view, ...patch })
  const laid = cl.laid
  const colLabel = (key: string) => cl.nameOf(key) || (isCustom(key) ? '' : t(`col.${key as SheetColumn}`))
  const asRow = (c: (typeof laid)[number]): PresetRow => {
    const i = laid.indexOf(c), name = colLabel(c.key) || t('col.drop')
    return {
      key: c.key, name, icon: c.kind ? 'regular' : FIELD_OF[c.key] ?? null, shown: c.shown, who: cl.changedBy(c), locked: c.key === 'title',
      // Spec 022 (US4): stage names come from the Space's Stages.
      values: c.key === 'status' && !p.stages ? 'stage' : undefined,
      up: i > 1 && c.key !== 'title', down: c.key !== 'title' && i < laid.length - 1,
      upLabel: tc('moveUp', { name }), downLabel: tc('moveDown', { name }),
    }
  }
  const closeBack = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-video-sheet] .fx-sheet-td.is-active, [data-video-sheet] [data-cell][tabindex="0"]')?.focus())
  // ── design/video-sheet-v5.html: columns that follow a board field ──
  const linkColumn = (key: string, f: ClipField) => {
    void lv.store.saveView({ ...view, colFields: { ...(view.colFields ?? {}), [key]: f } })
      .then(ok => { if (ok) p.linked?.say(tf('linkedTo', { name: cl.nameOf(key) || tf(`names.${f}`), field: tf(`names.${f}`) })) })
  }
  /** Unlink: the column keeps the values it shows, as its own. */
  async function unlinkColumn(key: string) {
    const f = linkedOf(key)
    if (!f) return
    for (const r of p.rows) {
      if (r.kind !== 'clip') continue
      const v = fieldText(r.task, f, true)
      if (v) await cl.custom.set(r.task, key, v, r.key)
    }
    const rest = { ...(view.colFields ?? {}) }
    delete rest[key]
    if (await lv.store.saveView({ ...view, colFields: rest })) p.linked?.say(tf('unlinked', { name: cl.nameOf(key) || '' }))
  }
  async function addLinked(f: ClipField) {
    const r = await cl.addTextColumnKey(tf(`names.${f}`))
    if (r.error || !r.key) { p.linked?.say(r.error ?? tf('notSaved')); return }
    linkColumn(r.key, f)
  }
  if (p.menuRef) {
    p.menuRef.current = (key, anchor) => {
      // Saved in the sheet's view, which the Sheets page provides.
      if (!isCustom(key) || !lv.store.enabled) return []
      return linkedOf(key)
        ? [{ key: 'unlinkField', group: '    ', text: tf('unlinkField'), label: tf('unlinkField'), onSelect: () => void unlinkColumn(key) }]
        : [{ key: 'linkField', group: '    ', text: tf('linkField'), label: <span className="fx-fd-mi"><span className="fx-vs-lk" aria-hidden="true">{LINK_ICON}</span>{tf('linkField')}</span>, onSelect: () => setFieldMenu({ anchor, key }) }]
    }
  }
  const linkedNow = new Set(Object.values(view.colFields ?? {}))
  const fieldItems: MenuItem[] = fieldMenu ? CLIP_FIELDS.map(f => ({
    key: `field-${f}`, text: tf(`names.${f}`), label: tf(`names.${f}`), hint: linkedNow.has(f) ? tf('alreadyLinked') : undefined,
    onSelect: () => { const at = fieldMenu; setFieldMenu(null); if (at.key) linkColumn(at.key, f); else void addLinked(f) },
  })) : []
  const addItems: MenuItem[] = addAt ? [
    ...laid.filter(c => c.builtIn && !c.shown).map(c => ({
      key: c.key, text: colLabel(c.key) || t('col.drop'), group: tf('fieldsTitle'),
      label: <span className="fx-fd-mi">{FIELD_OF[c.key] && <FieldIcon field={FIELD_OF[c.key]} />}{colLabel(c.key) || t('col.drop')}</span>,
      onSelect: () => { setAddAt(null); void cl.setShown(c.key, true) },
    })),
    ...CLIP_FIELDS.filter(f => lv.store.enabled && f !== 'due' && !linkedNow.has(f)).map(f => ({
      key: `board-${f}`, text: tf(`names.${f}`), group: tf('boardFieldsTitle'),
      label: <span className="fx-fd-mi"><span className="fx-vs-lk" aria-hidden="true">{LINK_ICON}</span>{tf(`names.${f}`)}</span>,
      onSelect: () => { setAddAt(null); void addLinked(f) },
    })),
    { key: 'regular', text: tf('spreadsheetCol'), group: tf('regularTitle'), label: <span className="fx-fd-mi"><FieldIcon field="regular" />{tf('spreadsheetCol')}</span>,
      onSelect: () => { const a = addAt; setAddAt(null); cl.openAdd(a) } },
  ] : []

  return (
    <>
    <GridCore
      model={model}
      active={p.active}
      setActive={p.setActive}
      editDraft={p.editDraft ? `d:${p.editDraft}` : null}
      notes={p.notes}
      onNote={p.onNote}
      selectAreas={tips.grid.selectAreas}
      optionsAt={tips.grid.optionsAt}
    />
    {lm.node}
    {lf.node}
    {tips.node}
    {addAt && <SheetMenu anchor={addAt} label={tf('addTitle')} items={addItems} onClose={() => setAddAt(null)} />}
    {fieldMenu && <SheetMenu anchor={fieldMenu.anchor} label={tf('linkField')} items={fieldItems} onClose={() => setFieldMenu(null)} />}
    {drawer && (
      <PresetFieldsDrawer
        rowsName={tf('rowsVideo')} rowsHelp={tf('rowsVideoHelp', { set: p.setName ?? '' })}
        groups={[{ value: 'video', label: tf('groupVideo') }, { value: 'stage', label: tf('names.stage') }, { value: 'assignee', label: tf('groupEditor') }]}
        group={by === 'stage' || by === 'assignee' ? by : 'video'}
        onGroup={v => saveView({ groupBy: v === 'video' ? null : { by: v as 'stage' | 'assignee' } })}
        fields={laid.filter(c => !c.kind).map(asRow)}
        regular={laid.filter(c => c.kind).map(asRow)}
        onToggle={(key, on) => void cl.setShown(key, on)}
        onMove={(key, dir) => { const i = laid.findIndex(c => c.key === key); void cl.move(key, dir < 0 ? laid[i - 1]?.key ?? null : laid[i + 2]?.key ?? null) }}
        onValues={f => setValuesFor(f)}
        onAddRegular={a => cl.openAdd(a)}
        onClose={() => { setDrawer(false); closeBack() }} />
    )}
    {valuesFor && (
      <ValuesDialog field={valuesFor} map={{ words: view.words, show: view.show }} types={[]}
                    defaults={Object.fromEntries(STAGE_ORDER.map(id => [id, stageNames.video(id as StageId)]))}
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
