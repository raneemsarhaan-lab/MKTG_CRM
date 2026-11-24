'use client'

/**
 * The Tasks sheet (spec 021 FR-013a/b, T044; T081): any set of tasks as a
 * spreadsheet on the shared grid, with the same sheet features as the Content
 * and Video sheets when it sits in its workbook (NodeWorkbook):
 *
 *   - columns (spec 010/019): add, rename, hide, reorder, resize, regular columns;
 *   - formatting, sort, filter, rules and group (spec 015 stage 3);
 *   - ranges, paste, clear, fill, undo and the power tips (specs 013, 017, 020);
 *   - the row and cell menus, and row heights.
 *
 * Every cell is typed into, as on the Content sheet:
 *   Status    a stage's name (Board rules; a move that needs a hand-off opens the box)
 *   Assignee  a member's name (first name is enough)
 *   Due       a date in any common form; empty clears it
 *   Priority  Low, Medium or High;  Type / Brand  by name;  Task  its name
 *   My notes  (My tasks only) a private column no one else sees
 *
 * Only the task's owner, its assignee or an admin can change a task (canActOn).
 * Its formats, rules and view live on the workbook's Tasks sheet ('tasks:<node>');
 * its columns are that sheet's (spec 010 records keyed by the same id).
 */
import { withCommentPaste, withNumberFormats } from '@/components/sheet/linkedNumbers'
import { pasteComments as pasteCommentsTo } from '@/components/sheets/format/bus'
import { createTask } from '@/actions/tasks'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { GridCore, type ActiveCell, type CellWrite, type GridCol, type GridModel, type WriteResult, type WriteWhy } from '@/components/sheet/GridCore'
import { ROW_NO_WIDTH } from '@/components/sheet/columns'
import { useUIStore } from '@/store/useUIStore'
import type { SheetId, StageId, Task } from '@/types/index'
import { STAGE_META, NINE_STAGE } from '@/lib/stage-meta'
import { matchMember, matchPriority, readDay } from '@/lib/sheet-links'
import { matchSpaceStage } from '@/lib/space-stages'
import type { SpaceStagesApi } from '@/components/spaces/useSpaceStages'
import { stagesForSpace } from '@/lib/space-stages'
import { FEATURE_OFF_CELL, fieldOn, offFeatureFor } from '@/lib/brand-features'
import { applies, fieldName, formatValue, isEmpty, parseValue } from '@/lib/task-fields'
import { setFieldValue } from '@/actions/task-fields'
import { useMakeField } from '@/components/fields/useMakeField'
import { formatDay, isOverdue } from '@/lib/due-dates'
import { ManualMark } from '@/components/shared/DueDates'
import { useMediaLinks } from '@/components/media/MediaLinks'
import { canActOn } from '@/lib/task-access'
import { setTaskStage, updateTask, type TaskPatch } from '@/actions/tasks'
import { myNotes, setMyNote } from '@/actions/my-notes'
import { handoffRequest } from '@/components/handoff/request'
import { LinkedFormatsContext } from '@/components/sheets/format/context'
import { useSheetColumns } from '@/components/sheet/useSheetColumns'
import { spaceLabel } from '@/components/shared/NavTree/labels'
import { useColumnsBundle } from '@/components/sheet/useColumnsBundle'
import { nodeText, useLinkedView, type LinkedView } from '@/components/sheet/useLinkedView'
import { useLinkedFormats } from '@/components/sheet/useLinkedFormats'
import { useLinkedEditing } from '@/components/sheet/useLinkedEditing'
import { useLinkedMenu } from '@/components/sheet/useLinkedMenu'
import { useGridTips } from '@/components/sheet/useGridTips'
import { SheetMenu, type MenuItem } from '@/components/sheet/SheetMenu'
import { FIELDS_OPEN, PresetFieldsDrawer, type PresetRow } from '@/components/sheets/links/FieldsPanel'
import { viewTasks, type BoardData, type ViewTask } from './types'
import { useMoveError } from '@/components/fields/moveErrors'

type Row =
  | { key: string; kind: 'group'; label: string; count: number }
  | { key: string; kind: 'task'; task: ViewTask }

const NOTES = 'notes'
const norm = (s: string) => s.trim().toLowerCase()

interface TaskSheetProps {
  data: BoardData
  tasks: ViewTask[]
  /** Group rows (My tasks' Working on / Handed off…); without them, one flat list. */
  groups?: [string, ViewTask[]][]
  /** Hide the Brand column (a brand page). */
  hideBrand?: boolean
  /** Spec 025: the Space column (the Spaces the task shows in); a brand's sheet has it. */
  showSpace?: boolean
  /** The private My notes column (My tasks). */
  notes?: boolean
  /** A saved view's shown fields (Task always shows); null = all. */
  fields?: string[] | null
  /** T081: the Tasks sheet's key ('tasks:<node>') in its workbook: formats, rules, view and columns live there. */
  sheetKey?: string
  /** Spec 022 (US4): a team Space's stages; cells show them and typing one moves the task (or its sub-stage). */
  stages?: SpaceStagesApi | null
  label: string
}

export function TaskSheet({ data, tasks, groups, hideBrand = false, showSpace = false, notes = false, fields = null, sheetKey, stages, label }: TaskSheetProps) {
  const t = useTranslations('taskSheet')
  const tf = useTranslations('sheets.fields')
  const tcol = useTranslations('sheet.columns')
  const tSpaces = useTranslations('spaces')
  const tFeat = useTranslations('spaces.features')
  const tDates = useTranslations('dates')
  const tMedia = useTranslations('media')
  const tFields = useTranslations('fields')
  const moveErr = useMoveError()
  const locale = useLocale()
  const router = useRouter()
  const selectTask = useUIStore(s => s.selectTask)
  const openHandoff = useUIStore(s => s.openHandoff)
  const me = data.currentUser
  const [active, setActive] = useState<ActiveCell | null>(null)
  const [cellNotes, setCellNotes] = useState<Record<string, string | undefined>>({})
  const [over, setOver] = useState<Record<string, Partial<ViewTask>>>({})
  const [mine, setMine] = useState<Record<string, string>>({})
  const [say, setSay] = useState('')
  const [addAt, setAddAt] = useState<HTMLElement | null>(null)
  // ⚙ Fields in the workbook: show, hide and order fields, and Group by (as on the Content sheet).
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    const on = () => setDrawer(true)
    document.addEventListener(FIELDS_OPEN, on)
    return () => document.removeEventListener(FIELDS_OPEN, on)
  }, [])
  /** A paste or clear of many cells: hand-offs are refused one by one (FR-030a), never a box per cell. */
  const bulk = useRef(false)

  // In its workbook the sheet has the formatting tools; elsewhere (a fallback) it is a plain grid.
  const linkedApi = useContext(LinkedFormatsContext)
  const sheet = (sheetKey ?? 'tasks:none') as SheetId
  const inWorkbook = !!sheetKey && !!linkedApi

  // Fresh data from the server replaces what was shown while saving.
  useEffect(() => { setOver({}) }, [data.initialTasks])
  useEffect(() => {
    if (!notes) return
    let live = true
    void myNotes().then(r => { if (live && r.success) setMine(r.notes) })
    return () => { live = false }
  }, [notes])

  // An Undo travels with the message it belongs to (Task link: unlink, link).
  const [undoFor, setUndoFor] = useState<{ text: string; fn: () => void } | null>(null)
  const sayNow = (text: string, undo?: () => void) => { setSay(text); setUndoFor(undo ? { text, fn: undo } : null) }
  const brands = data.brands
  const brandName = useMemo(() => new Map(brands.map(b => [b.id, b.name])), [brands])
  const memberName = useMemo(() => new Map(data.members.map(m => [m.id, m.name])), [data.members])
  const boardWord = (s: string) => {
    const m = STAGE_META[s as StageId]
    return m ? (locale === 'ar' ? m.label_ar : m.label_en) : s
  }
  // US3: a Space's word shows alone; the board name is on hover.
  const stageWord = (s: string) => stages?.stageName(s) ?? boardWord(s)
  const stageOf = (x: ViewTask) => stages?.name(x) ?? boardWord(x.status)
  // Without a Space, typed names are the original stages' (English or Arabic).
  const plain = useMemo(() => stagesForSpace('-', [], locale), [locale])
  const may = (x: ViewTask) => canActOn({ task_owner_id: x.task_owner_id, assignee_id: x.assignee_id ?? null, assignee_ids: x.assignee_ids }, me)

  // ── columns (spec 010): this sheet's own layout and regular columns ──
  const bundle = useColumnsBundle(data.sheetColumns, data.sheetValues, me)
  const makeField = useMakeField(sheet, me.access, text => setSay(text))
  const cl = useSheetColumns({
    sheet, set: 'all', bundle, me, members: data.members, makeField,
    defaultName: key => (key === NOTES ? t('col.notes') : key.startsWith('f:') ? (() => { const f = data.taskFields.find(x => x.id === key.slice(2)); return f ? fieldName(f, locale) : '' })() : t(`col.${key as 'title'}`)),
    canEdit: task => may(task as ViewTask), say: sayNow,
    onNote: (k, n) => setCellNotes(c => ({ ...c, [k]: n ?? undefined })),
    // Spec 021: Task link fields pick from every task, and create in a Space.
    taskLinks: {
      tasks: viewTasks(data), spaces: data.spaces, brands: data.brands, me, workspaceNineStage: data.workspaceNineStage, spaceStages: data.spaceStages,
      defaultSpaceId: /^tasks:space:/.test(sheet) ? sheet.slice('tasks:space:'.length) : null,
      openTask: id => selectTask(id), onCreated: () => router.refresh(), create: createTask,
    },
  })
  const isCustom = (col: GridCol) => cl.custom.is(col)
  // ── spec 023: task fields as columns `f:<id>` (the page's Fields button picks them) ──
  const fieldById = useMemo(() => new Map(data.taskFields.filter(f => !f.retired).map(f => [f.id, f])), [data.taskFields])
  const isField = (col: GridCol) => typeof col === 'string' && col.startsWith('f:') && fieldById.has(col.slice(2))
  const fieldOf = (col: GridCol) => fieldById.get(String(col).slice(2))!
  const fieldCols = (fields ?? []).filter(k => k.startsWith('f:') && fieldById.has(k.slice(2))) as GridCol[]
  const baseValues = useMemo(() => new Map(data.fieldValues.map(v => [`${v.task_id}|${v.field_id}`, v.value])), [data.fieldValues])
  const [fieldOver, setFieldOver] = useState<Record<string, unknown>>({})
  useEffect(() => { setFieldOver({}) }, [data.fieldValues])
  const fieldValue = (x: ViewTask, col: GridCol) => { const k = `${x.id}|${String(col).slice(2)}`; return k in fieldOver ? fieldOver[k] : baseValues.get(k) }
  const fieldApplies = (x: ViewTask, col: GridCol) => applies(x.content_type_label, String(col).slice(2), data.typeFields) && fieldOn(x.brand, fieldOf(col))
  // Spec 022 (R19): Link task is on content-side sheets, not on the Design and Video boards' own sheets.
  const mediaSpace = /^tasks:space:/.test(sheet) && !!data.spaces.find(sp => `tasks:space:${sp.id}` === sheet)?.media_board
  const ml = useMediaLinks({ tasks: viewTasks(data), onOpenTask: id => selectTask(id), say: sayNow })
  const cols: GridCol[] = [
    ...cl.cols.filter(c => !(hideBrand && c === 'brand') && !(!showSpace && c === 'space') && !(c === 'media' && mediaSpace) && (c === 'title' || c === 'media' || c === 'space' || isCustom(c) || !fields || fields.includes(c))),
    ...fieldCols,
    ...(notes ? [NOTES] : []),
  ]

  const view = (x: ViewTask): ViewTask => ({ ...x, ...(over[x.id] ?? {}) }) as ViewTask
  // Spec 025: the Spaces a task shows in — its board's Space for a media task.
  const spaceNames = useMemo(() => {
    const name = new Map(data.spaces.map(sp => [sp.id, spaceLabel(sp, tSpaces)]))
    const m = new Map<string, string[]>()
    for (const r of data.taskSpaces) { const n = name.get(r.space_id); if (n) m.set(r.task_id, [...(m.get(r.task_id) ?? []), n]) }
    return m
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.spaces, data.taskSpaces])
  const spacesOf = (x: ViewTask) => (spaceNames.get(x.id) ?? []).join(', ')
  const viewRef = useRef<LinkedView>({})
  const shown = (x: ViewTask, col: GridCol): string => {
    if (isCustom(col)) return cl.custom.textValue(x as unknown as Task, col)
    if (isField(col)) {
      if (!fieldApplies(x, col)) return ''
      const v = fieldValue(x, col)
      return isEmpty(v) ? '' : formatValue(fieldOf(col), v, { locale, memberName: id => memberName.get(id), taskName: id => viewTasks(data).find(y => y.id === id)?.name })
    }
    if (col === 'media') return x.media_board ? '' : ml.text(x)
    // Spec 021 (US4): a field the task's brand has switched off shows nothing (its value is kept).
    if (offFeatureFor(x.brand, col)) return ''
    switch (col) {
      case 'title': return x.name
      case 'brand': return brandName.get(x.brand_id) ?? ''
      case 'space': return spacesOf(x)
      case 'status': return stageOf(x)
      case 'assignee': return x.assignee_id ? memberName.get(x.assignee_id) ?? '' : ''
      case 'due': return x.due_date ?? ''
      case 'publish': return x.publish_date ?? ''
      case 'start': return x.start_date ?? ''
      case 'type': return x.content_type_label ?? ''
      case 'priority': return x.priority ? t(`priority.${x.priority}`) : ''
      case 'platform': return x.platform ?? ''
      case NOTES: return mine[x.id] ?? ''
    }
    return ''
  }

  // ── rows: the groups given, or the sheet's own Group by (stage, assignee, type, brand) ──
  const groupBy = (viewRef.current.groupBy?.by ?? null) as string | null
  const baseRows: Row[] = useMemo(() => {
    let list: [string, ViewTask[]][]
    if (groupBy && groupBy !== 'none' && groupBy !== 'theme' && groupBy !== 'col') {
      const by = new Map<string, { label: string; order: string; items: ViewTask[] }>()
      for (const x of tasks) {
        const sub = groupBy === 'stage' ? stages?.of(x) : undefined
        const k = groupBy === 'stage' ? sub?.id ?? x.status
          : groupBy === 'assignee' ? x.assignee_id ?? '' : groupBy === 'brand' ? x.brand_id ?? '' : x.content_type_label ?? ''
        const labelOf = groupBy === 'stage' ? shown(x, 'status') : groupBy === 'assignee' ? shown(x, 'assignee') || tf('bandUnassigned')
          : groupBy === 'brand' ? shown(x, 'brand') : x.content_type_label || tf('bandNoType')
        const order = groupBy === 'stage' ? `${String(NINE_STAGE.indexOf(x.status as StageId)).padStart(3, '0')}${sub?.position ?? 0}` : (k ? `0${labelOf.toLowerCase()}` : '1')
        const g = by.get(k) ?? { label: labelOf, order, items: [] }
        g.items.push(x)
        by.set(k, g)
      }
      list = [...by.values()].sort((a, b) => a.order.localeCompare(b.order)).map(g => [g.label, g.items])
    } else list = groupBy === 'none' ? [['', tasks]] : groups ?? [['', tasks]]
    // A task row's key is its task alone, so grouping or regrouping keeps the selection; a task shows once.
    const out: Row[] = []
    const placed = new Set<string>()
    for (const [g, items] of list) {
      const fresh = items.filter(x => !placed.has(x.id))
      if (!fresh.length) continue
      if (g) out.push({ key: `g:${g}`, kind: 'group', label: g, count: fresh.length })
      for (const x of fresh) { placed.add(x.id); out.push({ key: `t:${x.id}`, kind: 'task', task: view(x) }) }
    }
    return out
  }, [groups, tasks, over, groupBy, mine]) // eslint-disable-line react-hooks/exhaustive-deps

  const taskOf = (row: Row) => (row.kind === 'task' ? row.task : null)

  const patch = async (x: ViewTask, p: TaskPatch, local: Partial<ViewTask>): Promise<string | null> => {
    setOver(o => ({ ...o, [x.id]: { ...(o[x.id] ?? {}), ...local } }))
    const r = await updateTask(x.id, p).catch(() => ({ success: false, error: 'generic' }))
    if (!r.success) {
      setOver(o => { const n = { ...o }; delete n[x.id]; return n })
      return t('notSaved', { reason: r.error ?? 'generic' })
    }
    router.refresh()
    return null
  }

  /** One cell. A string back is the reason it wasn't changed. */
  const commit = async (x: ViewTask, col: GridCol, value: string): Promise<string | null> => {
    const text = value.trim()
    if (col === NOTES) {
      setMine(m => ({ ...m, [x.id]: value }))
      const r = await setMyNote(x.id, value)
      return r.success ? null : t('notSaved', { reason: r.error })
    }
    if (isCustom(col)) return cl.custom.commit(x as unknown as Task, col, value)
    if (col === 'space') return t('spaceReadOnly')
    if (!may(x)) return t('readOnly')
    if (isField(col)) {
      const f = fieldOf(col)
      if (!fieldApplies(x, col)) return tFields('notApplicable')
      const p = parseValue(f, value)
      if (!p.ok) return tFields('badValue', { field: fieldName(f, locale) })
      const k = `${x.id}|${f.id}`
      setFieldOver(o => ({ ...o, [k]: p.value }))
      const r = await setFieldValue(x.id, f.id, value).catch(() => ({ success: false as const, error: 'generic' }))
      if (!r.success) { setFieldOver(o => { const n = { ...o }; delete n[k]; return n }); return t('notSaved', { reason: r.error ?? 'generic' }) }
      router.refresh()
      return null
    }
    if (offFeatureFor(x.brand, col)) return tFeat('hidden', { brand: x.brand?.name ?? '' })
    switch (col) {
      case 'title':
        if (!text) return t('needName')
        return text === x.name ? null : patch(x, { name: text }, { name: text })
      case 'assignee': {
        if (!text) return patch(x, { assignee_id: null }, { assignee_id: null })
        const m = matchMember(text, data.members)
        if (m === 'none') return t('unknownMember', { text })
        if (m === 'ambiguous') return t('ambiguous', { text })
        return m.id === x.assignee_id ? null : patch(x, { assignee_id: m.id }, { assignee_id: m.id })
      }
      case 'due': {
        // Typed by a person: set by hand (✎); "Reset to auto" is in the task panel.
        if (!text) return patch(x, { due_date: null }, { due_date: null, due_manual: true })
        const d = readDay(text)
        return d ? patch(x, { due_date: d }, { due_date: d, due_manual: true }) : t('badDate', { text })
      }
      case 'start': {
        // Spec 023 (US6): never after the due date (the server refuses it too).
        if (!text) return patch(x, { start_date: null }, { start_date: null })
        const d = readDay(text)
        if (!d) return t('badDate', { text })
        if (x.due_date && d > x.due_date.slice(0, 10)) return tDates('startAfterDue')
        return patch(x, { start_date: d }, { start_date: d })
      }
      case 'publish': {
        // A new publishing date moves an automatic due date (worked out on the server; the refresh brings it).
        if (!text) return patch(x, { publish_date: null }, { publish_date: null })
        const d = readDay(text)
        return d ? patch(x, { publish_date: d }, { publish_date: d }) : t('badDate', { text })
      }
      case 'priority': {
        const p = matchPriority(text)
        return p ? patch(x, { priority: p }, { priority: p }) : t('badPriority')
      }
      case 'type': {
        const ty = data.contentTypes.find(c => norm(c.label) === norm(text))
        return ty ? patch(x, { content_type_label: ty.label }, { content_type_label: ty.label }) : t('unknownType', { text })
      }
      case 'brand': {
        const b = brands.find(c => norm(c.name) === norm(text))
        return b ? patch(x, { brand_id: b.id }, { brand_id: b.id }) : t('unknownBrand', { text })
      }
      case 'platform':
        return patch(x, { platform: text }, { platform: text })
      case 'status': {
        const entry = stages ? stages.match(text) : matchSpaceStage(text, plain)
        if (!entry) return t('unknownStageList', { text, list: (stages?.entries.map(e => e.name) ?? NINE_STAGE.map(stageWord)).join(', ') })
        const to = entry.stage_id
        // Spec 022 (US4): a step of the same stage changes only this Space.
        if (to === x.status) {
          if (!stages) return null
          const err = await stages.sub(x, entry)
          return err ? t('notSaved', { reason: err }) : null
        }
        setOver(o => ({ ...o, [x.id]: { ...(o[x.id] ?? {}), status: to } }))
        const res = await setTaskStage(x.id, to).catch(() => ({ success: false, shouldCelebrate: false, error: 'generic' as const }))
        if (res.success) {
          if (stages && entry.position > 0) await stages.sub({ ...x, status: to }, entry)
          router.refresh(); return null
        }
        setOver(o => { const n = { ...o }; delete n[x.id]; return n })
        if (res.error === 'needs_handoff') {
          if (bulk.current) return t('handoffOne')
          // Spec 021 (FR-030): the same box a drag opens; the cell keeps its stage until it's confirmed.
          const req = handoffRequest(res, x, data.spaces, data.taskSpaces, data.members, tSpaces)
          if (req) { openHandoff(req); return null }
        }
        const known = moveErr(res)
        if (known) return known
        return res.error === 'not_authorized' || res.error === 'stage_not_in_pipeline' ? t('notAllowed', { stage: stageWord(to) }) : t('notSaved', { reason: res.error ?? 'generic' })
      }
    }
    return null
  }

  const isText = (row: Row, col: GridCol) => {
    if (row.kind !== 'task' || col === 'rowNo') return false
    if (col === NOTES) return true
    if (col === 'media') return false
    if (isCustom(col)) return cl.custom.isText(row.task as unknown as Task, col)
    return true
  }
  const isMenu = (row: Row, col: GridCol) => row.kind === 'task' && ((col === 'media' && !row.task.media_board) || (isCustom(col) && cl.custom.isMenu(col)))

  // Row numbers count tasks only; group rows show none.
  const numbers = useMemo(() => { let n = 0; return new Map(baseRows.filter(r => r.kind === 'task').map(r => [r.key, ++n])) }, [baseRows])
  const headerText = (col: GridCol) => (isCustom(col) ? cl.header(col)?.text ?? '' : isField(col) ? fieldName(fieldOf(col), locale) : cl.nameOf(col) || t(`col.${col as 'title'}`))

  const model: GridModel<Row> = {
    rows: baseRows,
    cols,
    widths: { ...cl.widths, [NOTES]: 260, ...Object.fromEntries(fieldCols.map(c => [c, 170])) },
    rowNoWidth: ROW_NO_WIDTH,
    label,
    header: col => ({ text: headerText(col), className: col === NOTES ? 'is-mine' : isField(col) ? 'is-task-field' : undefined }),
    ...(inWorkbook ? cl.grid : {}),
    tailHeader: inWorkbook
      ? <button type="button" className="fx-fd-plus" data-add-field="" aria-haspopup="menu" aria-label={tf('addTitle')} title={tf('addTitle')}
                onPointerDown={e => e.stopPropagation()} onClick={e => setAddAt(e.currentTarget)}>＋</button>
      : undefined,
    colsOf: row => (row.kind === 'group' ? ['rowNo', 'title'] : null),
    rowProps: row => ({
      className: row.kind === 'group' ? 'fx-content-pillar-row' : '',
      level: row.kind === 'group' ? 1 : groups || groupBy ? 2 : 1,
      taskId: row.kind === 'task' ? row.task.id : undefined,
    }),
    rowLabel: row => numbers.get(row.key) ?? '',
    cellRole: (_row, col) => (col === 'title' ? 'rowheader' : 'gridcell'),
    cellClass: (_row, col) => ['fx-sheet-td', isField(col) ? 'is-task-field' : `is-${col}`, col === 'rowNo' ? 'is-frozen-no' : '', col === 'title' ? 'is-frozen-title' : '', isCustom(col) ? `is-custom ${cl.custom.cellClass(col)}` : ''].filter(Boolean).join(' '),
    isText,
    textValue: (row, col) => (row.kind === 'task' ? shown(row.task, col) : ''),
    isMenu,
    // Custom cells: a letter opens a Choice or Task link list; Space toggles a Checkbox; Delete clears (unlinks, with Undo).
    onTypeAhead: (row, col, ch, anchor) => {
      if (row.kind !== 'task') return false
      // Spec 022: typing in a Link task cell opens the list, already searching.
      if (col === 'media') { if (!row.task.media_board) ml.open(row.task, anchor, ch); return true }
      return isCustom(col) ? cl.custom.typeAhead(row.task as unknown as Task, col, ch, anchor, row.key) : false
    },
    onActivate: (row, col) => (row.kind === 'task' && isCustom(col) ? cl.custom.activate(row.task as unknown as Task, col, row.key) : false),
    onDelete: (row, col) => {
      if (row.kind !== 'task' || !isCustom(col)) return false
      cl.custom.clear(row.task as unknown as Task, col, row.key)
      return true
    },
    render: (row, col) => {
      if (row.kind === 'group') {
        return col === 'title'
          ? <span className="fx-content-pillar" data-group-row={row.label}>{row.label}<span className="fx-sheet-muted"> · {row.count}</span></span>
          : null
      }
      const x = row.task
      if (col === 'rowNo') return null
      if (isCustom(col)) return cl.custom.render(x as unknown as Task, col)
      if (col === 'media') return x.media_board ? null : ml.render(x)
      // Spec 023: an empty required field says so in red ("Caption not added").
      if (isField(col) && fieldApplies(x, col) && isEmpty(fieldValue(x, col)) && data.typeFields.some(l => l.type_label === x.content_type_label && l.field_id === String(col).slice(2) && l.required_from))
        return <span className="fx-sheet-ellipsis" data-field-missing={fieldOf(col).name_en} style={{ color: '#D22040' }}>{tFields('notAdded', { field: fieldName(fieldOf(col), locale) })}</span>
      if (offFeatureFor(x.brand, col)) return <span data-feature-off={offFeatureFor(x.brand, col)!} title={tFeat('hidden', { brand: x.brand?.name ?? '' })} aria-label={tFeat('hidden', { brand: x.brand?.name ?? '' })} style={{ display: 'block', width: '100%', height: '100%' }} />
      if (col === 'title') return <span className="fx-sheet-title" data-task-cell={x.id}><span className="fx-sheet-ellipsis" title={x.name}>{x.name}</span></span>
      if (col === 'due' && x.due_date) {
        const late = isOverdue(x)
        return <span className="fx-sheet-ellipsis" data-due-cell={x.due_date} style={late ? { color: '#D22040' } : undefined}>{formatDay(x.due_date, locale)}{x.due_manual && <ManualMark label={tDates('manual')} />}</span>
      }
      if (col === 'start' && x.start_date) return <span className="fx-sheet-ellipsis" data-start-cell={x.start_date}>{formatDay(x.start_date, locale)}</span>
      if (col === 'publish' && x.publish_date) return <span className="fx-sheet-ellipsis" data-publish-cell={x.publish_date}>{formatDay(x.publish_date, locale)}</span>
      const s = shown(x, col)
      if (col === 'status' && s) {
        const board = boardWord(x.status)
        return <span className="fx-sheet-ellipsis" data-status-word={s} title={board !== s ? board : undefined}>{s}</span>
      }
      return s ? <span className="fx-sheet-ellipsis">{s}</span> : null
    },
    isDraft: () => false,
    inputLabel: (row, col) => (row.kind === 'task' ? `${row.task.name} · ${headerText(col)}` : headerText(col)),
    inputPlaceholder: (_row, col) => (col === 'due' || col === 'publish' || col === 'start' ? '2026-12-01' : undefined),
    inputDir: col => (col === 'due' || col === 'publish' || col === 'start' ? 'ltr' : undefined),
    readOnlyNote: (row, col) => {
      if (row.kind !== 'task' || col === NOTES) return null
      if (isCustom(col)) return cl.custom.readOnlyNote(row.task as unknown as Task, col)
      if (col === 'space') return t('spaceReadOnly')
      if (!may(row.task)) return t('readOnly')
      if (isField(col) && !fieldApplies(row.task, col)) return tFields('notApplicable')
      if (offFeatureFor(row.task.brand, col)) return tFeat('hidden', { brand: row.task.brand?.name ?? '' })
      return null
    },
    onCommit: async (row, col, value) => (row.kind === 'task' ? commit(row.task, col, value) : null),
    onCancelDraft: () => {},
    onOpen: (row, col, anchor) => {
      if (row.kind !== 'task') return
      if (col === 'media') { if (!row.task.media_board) ml.open(row.task, anchor); return }
      if (isCustom(col)) { cl.custom.open(row.task as unknown as Task, col, anchor, row.key); return }
      selectTask(row.task.id)
    },
    onPaste: () => {},
  }

  // ── the sheet features (same hooks as the Content sheet) ──
  const leRef = useRef<{ writeCells(w: CellWrite[], why: WriteWhy): Promise<WriteResult>; record(label: string, changes: import('@/lib/sheet-undo').LinkedChange[]): void; recordFormats(label: string, items: import('@/lib/sheet-format').FormatItem[]): void } | null>(null)
  const shownText = (row: Row, col: GridCol) =>
    model.textValue(row, col) || (col === 'rowNo' ? '' : nodeText(model.render(row, col, () => undefined)).trim())
  const lv = useLinkedView<Row>({
    enabled: inWorkbook, sheetKey: sheet as `tasks:${string}`, rows: baseRows,
    kind: row => (row.kind === 'task' ? 'item' : 'fixed'),
    taskOf: row => taskOf(row)?.id ?? null, textValue: shownText, say: sayNow,
  })
  viewRef.current = lv.store.view
  const rows = lv.rows
  model.rows = rows
  const colName = (col: GridCol) => headerText(col)
  const cellName = (row: Row, col: GridCol) => (col === 'rowNo' ? '' : row.kind === 'task' ? `${row.task.name} · ${colName(col)}` : colName(col))
  const lf = useLinkedFormats<Row>({
    enabled: inWorkbook, sheetKey: sheet as `tasks:${string}`, rows, cols: model.cols, active,
    store: lv.store, ruleLooks: lv.ruleLooks, colName, shownText, rawRows: baseRows, isItem: row => row.kind === 'task',
    record: (l, changes) => leRef.current?.record(l, changes),
    taskOf: row => taskOf(row)?.id ?? null, cellName, textValue: model.textValue,
    recordFormats: (l, items) => leRef.current?.recordFormats(l, items),
    writeCells: (w, why) => leRef.current?.writeCells(w, why) ?? Promise.resolve(null),
    say: sayNow,
    select: (taskId, col) => {
      const row = rows.find(r => taskOf(r)?.id === taskId)
      if (row) { setActive({ key: row.key, col }); requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cell="${row.key}|${col}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })) }
    },
  })
  const le = useLinkedEditing<Row>({
    sheetKey: sheet, applyFormats: lf.applyFormats, styleOf: lf.styleOf, taskOf: row => taskOf(row)?.id ?? null,
    applyExtra: ch => (ch.kind === 'rules' ? lv.store.saveRules(ch.after) : lv.store.saveView(ch.after as LinkedView)),
    rows, cols: model.cols, isText: model.isText, textValue: model.textValue,
    commit: (row, col, v) => (row.kind === 'task' ? commit(row.task, col, v) : Promise.resolve(null)),
    readOnlyNote: (row, col) => model.readOnlyNote?.(row, col) ?? null,
    isCellRow: row => row.kind === 'task',
    onSkipped: skipped => { const n = Object.values(skipped).reduce((a: number, b) => a + (b ?? 0), 0); if (n) setSay(t('pasteNote', { done: 0, refused: n })) },
  })
  /** Many cells at once: a hand-off is refused per cell (FR-030a) instead of a box for each. */
  const writeCells = async (w: CellWrite[], why: WriteWhy): Promise<WriteResult> => {
    bulk.current = w.length > 1
    try { return await le.writeCells(w, why) } finally { bulk.current = false }
  }
  const lm = useLinkedMenu<Row>({
    areas: lf.areasNow,
    rows, cols: model.cols, widths: model.widths, columns: cl, removal: 'archive',
    taskOf, canRemove: () => false, insertRow: () => false,
    writeCells, dropRows: le.dropRows, say: sayNow,
  })
  leRef.current = { ...le, writeCells }
  Object.assign(model, {
    // Spec 021 (US4): a switched-off field is a hatched, empty cell in a mixed view.
    cellStyle: (row: Row, col: GridCol) => {
      const fx = lf.cellStyle(row, col)
      // Spec 023: a task field the row's type doesn't have is hatched and refuses typing.
      if (row.kind === 'task' && isField(col) && !fieldApplies(row.task, col)) return { cell: { ...(fx?.cell ?? {}), ...FEATURE_OFF_CELL }, text: fx?.text ?? null, border: fx?.border ?? null }
      if (row.kind !== 'task' || !offFeatureFor(row.task.brand, col)) return fx
      return { cell: { ...(fx?.cell ?? {}), ...FEATURE_OFF_CELL }, text: fx?.text ?? null, border: fx?.border ?? null }
    }, cellIcon: lf.cellIcon, onSelect: lf.onSelect, onAreasNotice: lf.onAreasNotice, marked: lf.marked, headerExtra: lf.headerExtra,
    selection: true,
    // A refused edit says why on the cell and in the line above the sheet.
    onCommit: async (row: Row, col: GridCol, v: string) => { const why = await le.onCommit(row, col, v); setSay(why ?? ''); return why },
    writeCells, onUndo: le.onUndo, onRedo: le.onRedo,
    ...(inWorkbook ? { contextMenu: lm.contextMenu, rowHeight: lm.rowHeight, onRowResize: lm.onRowResize } : {}),
  } satisfies Partial<GridModel<Row>>)
  // Spec 015 FR-070: number formats show here too, and a copy carries them.
  withNumberFormats(model, lf.styleOf, locale, inWorkbook)
  withCommentPaste(model, { enabled: inWorkbook, sheet: sheet, keyOf: (row, col) => { const id = taskOf(row)?.id; return id ? { rowKey: id, colKey: String(col) } : null }, paste: pairs => pasteCommentsTo('linked', pairs) })
  const tips = useGridTips(model, { enabled: inWorkbook, writeCells, onUndo: le.onUndo, say: sayNow })
  Object.assign(model, tips.model)

  // The first cell is shown selected; make it the real selection, so the toolbar knows where it is from the start.
  const firstKey = rows.find(r => r.kind === 'task')?.key
  const activeGone = !!active && !rows.some(r => r.key === active.key)
  useEffect(() => { if ((!active || activeGone) && firstKey) setActive({ key: firstKey, col: 'title' }) }, [active, activeGone, firstKey])

  const addItems: MenuItem[] = addAt ? [
    ...cl.laid.filter(c => c.builtIn && !c.shown).map(c => ({
      key: c.key, text: cl.nameOf(c.key) || t(`col.${c.key as 'title'}`), group: tf('fieldsTitle'),
      label: cl.nameOf(c.key) || t(`col.${c.key as 'title'}`),
      onSelect: () => { setAddAt(null); void cl.setShown(c.key, true) },
    })),
    { key: 'regular', text: tf('spreadsheetCol'), label: tf('spreadsheetCol'), group: tf('regularTitle'), onSelect: () => { const a = addAt; setAddAt(null); if (a) cl.openAdd(a) } },
    // Spec 021: Task link sits in the ＋ Field menu, next to the other kinds.
    { key: 'tasklink', text: tcol('kinds.task'), label: <span data-add-task-link="">⇢ {tcol('kinds.task')} <span className="fx-sheet-muted">· {tcol('kindHelp.task')}</span></span>, group: tf('regularTitle'), onSelect: () => { const a = addAt; setAddAt(null); if (a) cl.openAdd(a, 'task') } },
  ] : []

  if (!rows.length && !tasks.length) return <div className="fx-sheet-empty" data-task-sheet=""><p>{t('empty')}</p></div>

  return (
    <div className="fx-sheet" data-task-sheet="" data-sheet-key={sheetKey}>
      {(notes || say) && (
        <div className="fx-sheet-sum" role="status" aria-live="polite">
          {notes && <span data-notes-hint="">{t('notesHint')}</span>}
          {say && <span className="fx-sheet-sum-bad" data-sheet-say="">{say}</span>}
          {say && undoFor?.text === say && (
            <button type="button" className="fx-sheet-btn" data-sheet-undo="" onClick={() => { const u = undoFor; setUndoFor(null); setSay(''); u.fn() }}>{tcol('taskLink.undo')}</button>
          )}
        </div>
      )}
      <div className="fx-sheet-scroll">
        <GridCore model={model} active={active} setActive={setActive} editDraft={null}
                  notes={cellNotes} onNote={(k, n) => setCellNotes(c => ({ ...c, [k]: n ?? undefined }))}
                  selectAreas={tips.grid.selectAreas} optionsAt={tips.grid.optionsAt} />
      </div>
      {lm.node}
      {lf.node}
      {tips.node}
      {cl.layer}
      {ml.layer}
      {addAt && <SheetMenu anchor={addAt} label={tf('addTitle')} items={addItems} onClose={() => setAddAt(null)} />}
      {drawer && inWorkbook && (() => {
        const laid = cl.laid.filter(c => !(hideBrand && c.key === 'brand'))
        const asRow = (c: (typeof laid)[number]): PresetRow => {
          const i = laid.indexOf(c), name = cl.nameOf(c.key) || t(`col.${c.key as 'title'}`)
          return {
            key: c.key, name, icon: c.kind ? 'regular' : null, shown: c.shown, who: cl.changedBy(c), locked: c.key === 'title',
            up: i > 1 && c.key !== 'title', down: c.key !== 'title' && i < laid.length - 1,
            upLabel: tcol('moveUp', { name }), downLabel: tcol('moveDown', { name }),
          }
        }
        const view = lv.store.view
        return (
          <PresetFieldsDrawer
            rowsName={t('rowsName')} rowsHelp={t('rowsHelp')}
            groups={[
              { value: 'default', label: groups ? t('groupDefault') : tf('groupNone') }, { value: 'stage', label: tf('names.stage') },
              { value: 'assignee', label: tf('names.assignee') }, { value: 'type', label: tf('names.type') }, { value: 'brand', label: t('col.brand') },
              ...(groups ? [{ value: 'none', label: tf('groupNone') }] : []),
            ]}
            group={view.groupBy?.by && view.groupBy.by !== 'col' && view.groupBy.by !== 'theme' ? view.groupBy.by : 'default'}
            onGroup={v => void lv.store.saveView({ ...view, groupBy: v === 'default' ? null : { by: v as 'stage' | 'assignee' | 'type' | 'brand' | 'none' } })}
            fields={laid.filter(c => !c.kind).map(asRow)}
            regular={laid.filter(c => c.kind).map(asRow)}
            onToggle={(key, on) => void cl.setShown(key, on)}
            onMove={(key, dir) => { const i = laid.findIndex(c => c.key === key); void cl.move(key, dir < 0 ? laid[i - 1]?.key ?? null : laid[i + 2]?.key ?? null) }}
            onValues={() => {}}
            onAddRegular={a => cl.openAdd(a)}
            onClose={() => setDrawer(false)} />
        )
      })()}
    </div>
  )
}
