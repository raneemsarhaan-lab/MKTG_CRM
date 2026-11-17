'use client'

/**
 * The video sheet's grid (spec 008): the clip model over the shared GridCore.
 * Video rows group their clips; "+ Clip" rows add one; drafts are clips not
 * saved yet. Keyboard, focus, editing and ARIA live in GridCore.
 */
import { useLocale, useTranslations } from 'next-intl'
import type { Member, SheetColumn, Task, TaskField, WordField } from '@/types/index'
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
import { GridCore, type GridModel, type GridCol, type ActiveCell } from './GridCore'
import type { SheetColumnsHook } from './useSheetColumns'
import { useLinkedEditing } from './useLinkedEditing'
import { nodeText, useLinkedView, type LinkedView } from '@/components/sheet/useLinkedView'
import { useGridTips } from '@/components/sheet/useGridTips'
import { useLinkedFormats } from './useLinkedFormats'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLinkedMenu } from './useLinkedMenu'

export type { GridCol, ActiveCell }

/** Spec 019 stage 3: the built-in columns that are task fields (their icon in the heading). */
const FIELD_OF: Record<string, TaskField> = { type: 'type', status: 'stage', editor: 'assignee', files: 'link:doc', published: 'link:published' }
const STAGE_ORDER = Object.keys(STAGE_META)

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
  /** Spec 019 stage 3: the column set on show (the drawer's switches act on it). */
  setName?: string
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
    const v = viewRef.current
    if (v.show === 'board') return boardName(id)
    return v.words?.stage?.[id]?.[0] ?? stageNames.video(id as StageId)
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
    if (col === 'status' && (row.kind === 'clip' || row.kind === 'video')) {
      const v = readStage(value)
      if (!v) return Promise.resolve(tf('notAStage', { text: value.trim() }))
      if (v === row.task.status) return Promise.resolve(null)
      return p.onCommit(row, col, v)
    }
    return p.onCommit(row, col, value)
  }
  const membersById = new Map(p.members.map(m => [m.id, m]))
  const rowTask = (row: SheetRow): Task | null => (row.kind === 'clip' || row.kind === 'video' ? row.task : null)
  const [drawer, setDrawer] = useState(false)
  const [valuesFor, setValuesFor] = useState<WordField | null>(null)
  const [addAt, setAddAt] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const on = () => setDrawer(true)
    document.addEventListener(FIELDS_OPEN, on)
    return () => document.removeEventListener(FIELDS_OPEN, on)
  }, [])

  const cl = p.columns
  const isCustom = (col: GridCol) => cl.custom.is(col)
  const isText = (row: SheetRow, col: GridCol) => {
    if (row.kind === 'draft') return col === 'title'
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
      const text = col === 'drop' && !named ? '' : (named ?? (isCustom(col) ? '' : t(`col.${col as SheetColumn}`)))
      const f = FIELD_OF[col]
      return {
        text: f && text ? <><FieldIcon field={f} />{text}</> : text,
        label: col === 'drop' && !named ? t('col.drop') : f && text ? text : undefined,
        sort: col === 'clipNo' ? 'ascending' : undefined,
      }
    },
    ...cl.grid,
    tailHeader: <button type="button" className="fx-fd-plus" data-add-field="" aria-haspopup="menu" aria-label={tf('addTitle')} title={tf('addTitle')}
                        onPointerDown={e => e.stopPropagation()} onClick={e => setAddAt(e.currentTarget)}>＋</button>,
    colsOf: row => (row.kind === 'group' ? ['rowNo', 'title'] : null),
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
        case 'status':   return row.kind === 'video' || row.kind === 'clip' ? stageWord(task.status) : ''
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
    onCommit: (row, col, v) => commitWord(row, col, v),
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
      if (row.kind === 'group') {
        return col === 'rowNo' ? row.n : <span className="fx-content-pillar" data-group-row={row.label}>{row.label}<span className="fx-sheet-muted"> · {row.count}</span></span>
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
        case 'status': return <StatusContent task={task} me={p.me} tipId={`fx-tip-${row.key}`} name={stageWord(task.status)} />
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
  const leRef = useRef<{ recordFormats(label: string, items: import('@/lib/sheet-format').FormatItem[]): void; record(label: string, changes: import('@/lib/sheet-undo').LinkedChange[]): void; writeCells(w: import('@/components/sheet/GridCore').CellWrite[], why: import('@/components/sheet/GridCore').WriteWhy): Promise<import('@/components/sheet/GridCore').WriteResult> } | null>(null)
  // Stage 3: the sheet's sort and filter (inside each group) and its rules; the grid shows the arranged rows.
  // They read what a cell shows: its text, or a pill's label.
  const shownText = (row: SheetRow, col: GridCol) => {
    const task = rowTask(row)
    if (task && !cl.custom.is(col)) {
      switch (col) {
        case 'status': return stageWord(task.status)
        case 'editor': return task.assignee_id ? membersById.get(task.assignee_id)?.name ?? '' : ''
        case 'type': return task.content_type_label ?? ''
        case 'length': return formatClipTime(clipLength(task.clip?.in_ms, task.clip?.out_ms))
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
    applyFormats: lf.applyFormats,
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
  Object.assign(model, {
    cellStyle: lf.cellStyle, cellIcon: lf.cellIcon, onSelect: lf.onSelect, onAreasNotice: lf.onAreasNotice, marked: lf.marked, headerExtra: lf.headerExtra,
    selection: true, onCommit: le.onCommit, writeCells: le.writeCells, onUndo: le.onUndo, onRedo: le.onRedo,
    pasteAsRows: p.pasteAsRows, onSkipped: p.onSkipped,
    ...(p.linked ? { contextMenu: lm.contextMenu, rowHeight: lm.rowHeight, onRowResize: lm.onRowResize } : {}),
  } satisfies Partial<GridModel<SheetRow>>)
  // Spec 020: zoom, the fill handle, Alt+↓ pick list and Ctrl+; on the board's sheets in the workbook.
  const tips = useGridTips(model, { enabled: !!p.linked, writeCells: le.writeCells, onUndo: le.onUndo, onSkipped: p.onSkipped, say: text => p.linked?.say(text) })
  Object.assign(model, tips.model)

  // ── spec 019 stage 3: ⚙ Fields, ＋ and Values ──
  const view = lv.store.view
  const saveView = (patch: Partial<LinkedView>) => void lv.store.saveView({ ...view, ...patch })
  const laid = cl.laid
  const colLabel = (key: string) => cl.nameOf(key) || (isCustom(key) ? '' : t(`col.${key as SheetColumn}`))
  const asRow = (c: (typeof laid)[number]): PresetRow => {
    const i = laid.indexOf(c), name = colLabel(c.key) || t('col.drop')
    return {
      key: c.key, name, icon: c.kind ? 'regular' : FIELD_OF[c.key] ?? null, shown: c.shown, who: cl.changedBy(c), locked: c.key === 'title',
      values: c.key === 'status' ? 'stage' : undefined,
      up: i > 1 && c.key !== 'title', down: c.key !== 'title' && i < laid.length - 1,
      upLabel: tc('moveUp', { name }), downLabel: tc('moveDown', { name }),
    }
  }
  const closeBack = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-video-sheet] .fx-sheet-td.is-active, [data-video-sheet] [data-cell][tabindex="0"]')?.focus())
  const addItems: MenuItem[] = addAt ? [
    ...laid.filter(c => c.builtIn && !c.shown).map(c => ({
      key: c.key, text: colLabel(c.key) || t('col.drop'), group: tf('fieldsTitle'),
      label: <span className="fx-fd-mi">{FIELD_OF[c.key] && <FieldIcon field={FIELD_OF[c.key]} />}{colLabel(c.key) || t('col.drop')}</span>,
      onSelect: () => { setAddAt(null); void cl.setShown(c.key, true) },
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
