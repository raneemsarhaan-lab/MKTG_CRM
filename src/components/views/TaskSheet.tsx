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
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { GridCore, type ActiveCell, type CellWrite, type GridCol, type GridModel, type WriteResult, type WriteWhy } from '@/components/sheet/GridCore'
import { ROW_NO_WIDTH } from '@/components/sheet/columns'
import { useUIStore } from '@/store/useUIStore'
import type { SheetId, StageId, Task } from '@/types/index'
import { STAGE_META, NINE_STAGE } from '@/lib/stage-meta'
import { matchMember, matchPriority, readDay } from '@/lib/sheet-links'
import { matchSimpleWord, matchWord, wordOf, SIMPLE_KEYS, type SimpleKey, type SpaceWords } from '@/lib/space-words'
import { canActOn } from '@/lib/task-access'
import { setSimpleStatus, setTaskStage, updateTask, type TaskPatch } from '@/actions/tasks'
import { myNotes, setMyNote } from '@/actions/my-notes'
import { handoffRequest } from '@/components/handoff/request'
import { LinkedFormatsContext } from '@/components/sheets/format/context'
import { useSheetColumns } from '@/components/sheet/useSheetColumns'
import { useColumnsBundle } from '@/components/sheet/useColumnsBundle'
import { nodeText, useLinkedView, type LinkedView } from '@/components/sheet/useLinkedView'
import { useLinkedFormats } from '@/components/sheet/useLinkedFormats'
import { useLinkedEditing } from '@/components/sheet/useLinkedEditing'
import { useLinkedMenu } from '@/components/sheet/useLinkedMenu'
import { useGridTips } from '@/components/sheet/useGridTips'
import { SheetMenu, type MenuItem } from '@/components/sheet/SheetMenu'
import { FIELDS_OPEN, PresetFieldsDrawer, type PresetRow } from '@/components/sheets/links/FieldsPanel'
import type { BoardData, ViewTask } from './types'

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
  /** The private My notes column (My tasks). */
  notes?: boolean
  /** A saved view's shown fields (Task always shows); null = all. */
  fields?: string[] | null
  /** T081: the Tasks sheet's key ('tasks:<node>') in its workbook: formats, rules, view and columns live there. */
  sheetKey?: string
  /** Spec 021 (US3): a team Space's status words; cells show them and typing one moves the task. */
  words?: SpaceWords
  label: string
}

export function TaskSheet({ data, tasks, groups, hideBrand = false, notes = false, fields = null, sheetKey, words, label }: TaskSheetProps) {
  const t = useTranslations('taskSheet')
  const tf = useTranslations('sheets.fields')
  const tcol = useTranslations('sheet.columns')
  const tSpaces = useTranslations('spaces')
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

  const sayNow = (text: string) => setSay(text)
  const brands = data.brands
  const brandName = useMemo(() => new Map(brands.map(b => [b.id, b.name])), [brands])
  const memberName = useMemo(() => new Map(data.members.map(m => [m.id, m.name])), [data.members])
  const boardWord = (s: string) => {
    const m = STAGE_META[s as StageId]
    return m ? (locale === 'ar' ? m.label_ar : m.label_en) : s
  }
  // US3: a Space's word shows alone; the board name is on hover.
  const stageWord = (s: string) => wordOf(s, words) ?? boardWord(s)
  const simpleBoard = (s: string) => t(`simple.${s as SimpleKey}`)
  const simpleWord = (s: string) => wordOf(s, words) ?? simpleBoard(s)
  const simpleNames = useMemo(() => Object.fromEntries(SIMPLE_KEYS.map(k => [k, [t(`simple.${k}`)]])) as Record<SimpleKey, string[]>, [t])
  const may = (x: ViewTask) => canActOn({ task_owner_id: x.task_owner_id, assignee_id: x.assignee_id ?? null }, me)

  // ── columns (spec 010): this sheet's own layout and regular columns ──
  const bundle = useColumnsBundle(data.sheetColumns, data.sheetValues, me)
  const cl = useSheetColumns({
    sheet, set: 'all', bundle, me, members: data.members,
    defaultName: key => (key === NOTES ? t('col.notes') : t(`col.${key as 'title'}`)),
    canEdit: task => may(task as ViewTask), say: sayNow,
    onNote: (k, n) => setCellNotes(c => ({ ...c, [k]: n ?? undefined })),
  })
  const isCustom = (col: GridCol) => cl.custom.is(col)
  const cols: GridCol[] = [
    ...cl.cols.filter(c => !(hideBrand && c === 'brand') && (c === 'title' || isCustom(c) || !fields || fields.includes(c))),
    ...(notes ? [NOTES] : []),
  ]

  const view = (x: ViewTask): ViewTask => ({ ...x, ...(over[x.id] ?? {}) }) as ViewTask
  const viewRef = useRef<LinkedView>({})
  const shown = (x: ViewTask, col: GridCol): string => {
    if (isCustom(col)) return cl.custom.textValue(x as unknown as Task, col)
    switch (col) {
      case 'title': return x.name
      case 'brand': return brandName.get(x.brand_id) ?? ''
      case 'status': return x.kind === 'simple' ? simpleWord(x.simple_status ?? 's-todo') : stageWord(x.status)
      case 'assignee': return x.assignee_id ? memberName.get(x.assignee_id) ?? '' : ''
      case 'due': return x.due_date ?? ''
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
        const k = groupBy === 'stage' ? (x.kind === 'simple' ? `s:${x.simple_status ?? 's-todo'}` : x.status)
          : groupBy === 'assignee' ? x.assignee_id ?? '' : groupBy === 'brand' ? x.brand_id ?? '' : x.content_type_label ?? ''
        const labelOf = groupBy === 'stage' ? shown(x, 'status') : groupBy === 'assignee' ? shown(x, 'assignee') || tf('bandUnassigned')
          : groupBy === 'brand' ? shown(x, 'brand') : x.content_type_label || tf('bandNoType')
        const order = groupBy === 'stage' ? String(x.kind === 'simple' ? 100 : NINE_STAGE.indexOf(x.status as StageId)).padStart(3, '0') : (k ? `0${labelOf.toLowerCase()}` : '1')
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
    if (!may(x)) return t('readOnly')
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
        if (!text) return patch(x, { due_date: null }, { due_date: null })
        const d = readDay(text)
        return d ? patch(x, { due_date: d }, { due_date: d }) : t('badDate', { text })
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
        if (x.kind === 'simple') {
          // US3/US5: a simple task takes its three statuses, by name or by the Space's words.
          const st = matchSimpleWord(text, words, simpleNames)
          if (!st) return t('unknownStageList', { text, list: SIMPLE_KEYS.map(simpleWord).join(', ') })
          if (st === (x.simple_status ?? 's-todo')) return null
          setOver(o => ({ ...o, [x.id]: { ...(o[x.id] ?? {}), simple_status: st } }))
          const r = await setSimpleStatus(x.id, st).catch(() => ({ success: false, shouldCelebrate: false, error: 'generic' as const }))
          if (r.success) { router.refresh(); return null }
          setOver(o => { const n = { ...o }; delete n[x.id]; return n })
          return r.error === 'not_authorized' ? t('readOnly') : t('notSaved', { reason: r.error ?? 'generic' })
        }
        const to = matchWord(text, words)
        if (!to) return t('unknownStageList', { text, list: NINE_STAGE.map(stageWord).join(', ') })
        if (to === x.status) return null
        setOver(o => ({ ...o, [x.id]: { ...(o[x.id] ?? {}), status: to } }))
        const res = await setTaskStage(x.id, to).catch(() => ({ success: false, shouldCelebrate: false, error: 'generic' as const }))
        if (res.success) { router.refresh(); return null }
        setOver(o => { const n = { ...o }; delete n[x.id]; return n })
        if (res.error === 'needs_handoff') {
          if (bulk.current) return t('handoffOne')
          // Spec 021 (FR-030): the same box a drag opens; the cell keeps its stage until it's confirmed.
          const req = handoffRequest(res, x, data.spaces, data.taskSpaces, data.members, tSpaces)
          if (req) { openHandoff(req); return null }
        }
        return res.error === 'not_authorized' || res.error === 'stage_not_in_pipeline' ? t('notAllowed', { stage: stageWord(to) }) : t('notSaved', { reason: res.error ?? 'generic' })
      }
    }
    return null
  }

  const isText = (row: Row, col: GridCol) => {
    if (row.kind !== 'task' || col === 'rowNo') return false
    if (col === NOTES) return true
    if (isCustom(col)) return cl.custom.isText(row.task as unknown as Task, col)
    return true
  }
  const isMenu = (row: Row, col: GridCol) => row.kind === 'task' && isCustom(col) && cl.custom.isMenu(col)

  // Row numbers count tasks only; group rows show none.
  const numbers = useMemo(() => { let n = 0; return new Map(baseRows.filter(r => r.kind === 'task').map(r => [r.key, ++n])) }, [baseRows])
  const headerText = (col: GridCol) => (isCustom(col) ? cl.header(col)?.text ?? '' : cl.nameOf(col) || t(`col.${col as 'title'}`))

  const model: GridModel<Row> = {
    rows: baseRows,
    cols,
    widths: { ...cl.widths, [NOTES]: 260 },
    rowNoWidth: ROW_NO_WIDTH,
    label,
    header: col => ({ text: headerText(col), className: col === NOTES ? 'is-mine' : undefined }),
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
    cellClass: (_row, col) => ['fx-sheet-td', `is-${col}`, col === 'rowNo' ? 'is-frozen-no' : '', col === 'title' ? 'is-frozen-title' : '', isCustom(col) ? `is-custom ${cl.custom.cellClass(col)}` : ''].filter(Boolean).join(' '),
    isText,
    textValue: (row, col) => (row.kind === 'task' ? shown(row.task, col) : ''),
    isMenu,
    render: (row, col) => {
      if (row.kind === 'group') {
        return col === 'title'
          ? <span className="fx-content-pillar" data-group-row={row.label}>{row.label}<span className="fx-sheet-muted"> · {row.count}</span></span>
          : null
      }
      const x = row.task
      if (col === 'rowNo') return null
      if (isCustom(col)) return cl.custom.render(x as unknown as Task, col)
      if (col === 'title') return <span className="fx-sheet-title" data-task-cell={x.id}><span className="fx-sheet-ellipsis" title={x.name}>{x.name}</span></span>
      if (col === 'due' && x.due_date) return <span className="fx-sheet-ellipsis">{new Date(`${x.due_date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      const s = shown(x, col)
      if (col === 'status' && s) {
        const board = x.kind === 'simple' ? simpleBoard(x.simple_status ?? 's-todo') : boardWord(x.status)
        return <span className="fx-sheet-ellipsis" data-status-word={s} title={board !== s ? board : undefined}>{s}</span>
      }
      return s ? <span className="fx-sheet-ellipsis">{s}</span> : null
    },
    isDraft: () => false,
    inputLabel: (row, col) => (row.kind === 'task' ? `${row.task.name} · ${headerText(col)}` : headerText(col)),
    inputPlaceholder: (_row, col) => (col === 'due' ? '2026-12-01' : undefined),
    inputDir: col => (col === 'due' ? 'ltr' : undefined),
    readOnlyNote: (row, col) => {
      if (row.kind !== 'task' || col === NOTES) return null
      if (isCustom(col)) return cl.custom.readOnlyNote(row.task as unknown as Task, col)
      if (!may(row.task)) return t('readOnly')
      return null
    },
    onCommit: async (row, col, value) => (row.kind === 'task' ? commit(row.task, col, value) : null),
    onCancelDraft: () => {},
    onOpen: (row, col, anchor) => {
      if (row.kind !== 'task') return
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
    applyFormats: lf.applyFormats,
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
    cellStyle: lf.cellStyle, cellIcon: lf.cellIcon, onSelect: lf.onSelect, onAreasNotice: lf.onAreasNotice, marked: lf.marked, headerExtra: lf.headerExtra,
    selection: true,
    // A refused edit says why on the cell and in the line above the sheet.
    onCommit: async (row: Row, col: GridCol, v: string) => { const why = await le.onCommit(row, col, v); setSay(why ?? ''); return why },
    writeCells, onUndo: le.onUndo, onRedo: le.onRedo,
    ...(inWorkbook ? { contextMenu: lm.contextMenu, rowHeight: lm.rowHeight, onRowResize: lm.onRowResize } : {}),
  } satisfies Partial<GridModel<Row>>)
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
  ] : []

  if (!rows.length && !tasks.length) return <div className="fx-sheet-empty" data-task-sheet=""><p>{t('empty')}</p></div>

  return (
    <div className="fx-sheet" data-task-sheet="" data-sheet-key={sheetKey}>
      {(notes || say) && (
        <div className="fx-sheet-sum" role="status" aria-live="polite">
          {notes && <span data-notes-hint="">{t('notesHint')}</span>}
          {say && <span className="fx-sheet-sum-bad" data-sheet-say="">{say}</span>}
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
