'use client'

/**
 * The task Sheet (spec 021 FR-013a/b, research R6): any set of tasks as a
 * spreadsheet on the shared grid (GridCore) — the Design and Planning Spaces,
 * a brand page and My tasks. One row per task, optional group rows above
 * them; every cell is typed into, the way the Content and Video sheets work:
 *
 *   Status    a stage's name (moves go through the same rules as the Board;
 *             a move that needs a hand-off opens the box instead)
 *   Assignee  a member's name (first name is enough)
 *   Due       a date in any common form; empty clears it
 *   Priority  Low, Medium or High;  Type / Brand  by name;  Task  its name
 *   My notes  (My tasks only) a private column no one else sees
 *
 * Only the task's owner, its assignee or an admin can change a task (§ canActOn).
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { GridCore, type ActiveCell, type CellWrite, type GridCol, type GridModel, type WriteResult } from '@/components/sheet/GridCore'
import { ROW_NO_WIDTH } from '@/components/sheet/columns'
import { useUIStore } from '@/store/useUIStore'
import type { StageId } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { matchMember, matchPriority, matchStage, readDay } from '@/lib/sheet-links'
import { canActOn } from '@/lib/task-access'
import { setTaskStage, updateTask, type TaskPatch } from '@/actions/tasks'
import { myNotes, setMyNote } from '@/actions/my-notes'
import { handoffRequest } from '@/components/handoff/request'
import type { BoardData, ViewTask } from './types'

type Row =
  | { key: string; kind: 'group'; label: string; count: number }
  | { key: string; kind: 'task'; task: ViewTask }

const BASE_COLS = ['title', 'brand', 'status', 'assignee', 'due', 'type', 'priority', 'platform'] as const
const WIDTHS: Record<string, number> = { title: 300, brand: 170, status: 150, assignee: 140, due: 110, type: 110, priority: 90, platform: 110, notes: 260 }
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
  label: string
}

export function TaskSheet({ data, tasks, groups, hideBrand = false, notes = false, label }: TaskSheetProps) {
  const t = useTranslations('taskSheet')
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

  // Fresh data from the server replaces what was shown while saving.
  useEffect(() => { setOver({}) }, [data.initialTasks])
  useEffect(() => {
    if (!notes) return
    let live = true
    void myNotes().then(r => { if (live && r.success) setMine(r.notes) })
    return () => { live = false }
  }, [notes])

  const brands = data.brands
  const brandName = useMemo(() => new Map(brands.map(b => [b.id, b.name])), [brands])
  const memberName = useMemo(() => new Map(data.members.map(m => [m.id, m.name])), [data.members])
  const stageWord = (s: string) => {
    const m = STAGE_META[s as StageId]
    return m ? (locale === 'ar' ? m.label_ar : m.label_en) : s
  }
  const stages = useMemo(() => Object.entries(STAGE_META).map(([id, m]) => ({ id, names: [m.label_en, m.label_ar] })), [])

  const view = (x: ViewTask): ViewTask => ({ ...x, ...(over[x.id] ?? {}) }) as ViewTask
  const rows: Row[] = useMemo(() => {
    const list = groups ?? [['', tasks] as [string, ViewTask[]]]
    const out: Row[] = []
    for (const [g, items] of list) {
      if (!items.length) continue
      if (g) out.push({ key: `g:${g}`, kind: 'group', label: g, count: items.length })
      for (const x of items) out.push({ key: `t:${g}:${x.id}`, kind: 'task', task: view(x) })
    }
    return out
  }, [groups, tasks, over]) // eslint-disable-line react-hooks/exhaustive-deps

  // Row numbers count tasks only; group rows show none.
  const numbers = useMemo(() => { let n = 0; return new Map(rows.filter(r => r.kind === 'task').map(r => [r.key, ++n])) }, [rows])
  const cols: GridCol[] = [...BASE_COLS.filter(c => !(hideBrand && c === 'brand')), ...(notes ? ['notes'] : [])]
  const may = (x: ViewTask) => canActOn({ task_owner_id: x.task_owner_id, assignee_id: x.assignee_id ?? null }, me)

  const shown = (x: ViewTask, col: GridCol): string => {
    switch (col) {
      case 'title': return x.name
      case 'brand': return brandName.get(x.brand_id) ?? ''
      case 'status': return x.kind === 'simple' ? t(`simple.${x.simple_status ?? 's-todo'}`) : stageWord(x.status)
      case 'assignee': return x.assignee_id ? memberName.get(x.assignee_id) ?? '' : ''
      case 'due': return x.due_date ?? ''
      case 'type': return x.content_type_label ?? ''
      case 'priority': return x.priority ? t(`priority.${x.priority}`) : ''
      case 'platform': return x.platform ?? ''
      case 'notes': return mine[x.id] ?? ''
    }
    return ''
  }

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

  /** One typed cell. A string back is the reason it wasn't changed. */
  const commit = async (x: ViewTask, col: GridCol, value: string): Promise<string | null> => {
    const text = value.trim()
    if (col === 'notes') {
      setMine(m => ({ ...m, [x.id]: value }))
      const r = await setMyNote(x.id, value)
      return r.success ? null : t('notSaved', { reason: r.error })
    }
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
        if (x.kind === 'simple') return t('simpleHere')
        const to = matchStage(text, stages) as StageId | null
        if (!to) return t('unknownStage', { text })
        if (to === x.status) return null
        setOver(o => ({ ...o, [x.id]: { ...(o[x.id] ?? {}), status: to } }))
        const res = await setTaskStage(x.id, to).catch(() => ({ success: false, shouldCelebrate: false, error: 'generic' as const }))
        if (res.success) { router.refresh(); return null }
        setOver(o => { const n = { ...o }; delete n[x.id]; return n })
        // Spec 021 (FR-030): the same box a drag opens; the cell keeps its stage until it's confirmed.
        const req = handoffRequest(res, x, data.spaces, data.taskSpaces, data.members, tSpaces)
        if (req) { openHandoff(req); return null }
        return res.error === 'not_authorized' || res.error === 'stage_not_in_pipeline' ? t('notAllowed', { stage: stageWord(to) }) : t('notSaved', { reason: res.error ?? 'generic' })
      }
    }
    return null
  }

  /** Paste, clear and cut: each cell through its own save; hand-offs are refused (FR-030a). */
  const writeCells = async (writes: CellWrite[]): Promise<WriteResult> => {
    let done = 0
    const refused: { r: number; c: number; value: string; note: string }[] = []
    for (const w of writes) {
      const row = rows[w.r]
      const col = cols[w.c]
      if (!row || row.kind !== 'task' || !col) continue
      if (col === 'status' && w.value.trim()) {
        const to = matchStage(w.value, stages) as StageId | null
        if (to && to !== row.task.status) {
          const res = await setTaskStage(row.task.id, to).catch(() => null)
          if (res?.success) { done++; continue }
          refused.push({ ...w, note: res?.error === 'needs_handoff' ? t('handoffOne') : t('notAllowed', { stage: stageWord(to) }) })
          continue
        }
      }
      const why = await commit(row.task, col, w.value)
      if (why) refused.push({ ...w, note: why })
      else done++
    }
    if (done) router.refresh()
    setSay(refused.length ? t('pasteNote', { done, refused: refused.length }) : '')
    return { skipped: {}, refused, done }
  }

  const model: GridModel<Row> = {
    rows,
    cols,
    widths: WIDTHS,
    rowNoWidth: ROW_NO_WIDTH,
    label,
    selection: true,
    header: col => ({ text: t(`col.${col}`), className: col === 'notes' ? 'is-mine' : undefined }),
    colsOf: row => (row.kind === 'group' ? ['rowNo', 'title'] : null),
    rowProps: row => ({
      className: row.kind === 'group' ? 'fx-content-pillar-row' : '',
      level: row.kind === 'group' ? 1 : groups ? 2 : 1,
      taskId: row.kind === 'task' ? row.task.id : undefined,
    }),
    cellRole: (row, col) => (col === 'title' ? 'rowheader' : 'gridcell'),
    cellClass: (_row, col) => ['fx-sheet-td', `is-${col}`, col === 'rowNo' ? 'is-frozen-no' : '', col === 'title' ? 'is-frozen-title' : ''].filter(Boolean).join(' '),
    isText: row => row.kind === 'task',
    textValue: (row, col) => (row.kind === 'task' ? shown(row.task, col) : ''),
    isMenu: () => false,
    render: (row, col) => {
      if (row.kind === 'group') {
        return col === 'title'
          ? <span className="fx-content-pillar" data-group-row={row.label}>{row.label}<span className="fx-sheet-muted"> · {row.count}</span></span>
          : null
      }
      const x = row.task
      if (col === 'rowNo') return null
      if (col === 'title') return <span className="fx-sheet-title" data-task-cell={x.id}><span className="fx-sheet-ellipsis" title={x.name}>{x.name}</span></span>
      if (col === 'due' && x.due_date) return <span className="fx-sheet-ellipsis">{new Date(`${x.due_date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      const s = shown(x, col)
      return s ? <span className="fx-sheet-ellipsis">{s}</span> : null
    },
    rowLabel: row => numbers.get(row.key) ?? '',
    isDraft: () => false,
    inputLabel: (row, col) => (row.kind === 'task' ? `${row.task.name} · ${t(`col.${col}`)}` : t(`col.${col}`)),
    inputPlaceholder: (_row, col) => (col === 'due' ? '2026-12-01' : undefined),
    inputDir: col => (col === 'due' ? 'ltr' : undefined),
    readOnlyNote: (row, col) => {
      if (row.kind !== 'task' || col === 'notes') return null
      if (!may(row.task)) return t('readOnly')
      return col === 'status' && row.task.kind === 'simple' ? t('simpleHere') : null
    },
    onCommit: async (row, col, value) => {
      if (row.kind !== 'task') return null
      const why = await commit(row.task, col, value)
      setSay(why ?? '')
      return why
    },
    onCancelDraft: () => {},
    onOpen: row => { if (row.kind === 'task') selectTask(row.task.id) },
    writeCells: w => writeCells(w),
    onPaste: () => {},
  }

  if (!rows.length) return <div className="fx-sheet-empty" data-task-sheet=""><p>{t('empty')}</p></div>

  return (
    <div className="fx-sheet" data-task-sheet="">
      {(notes || say) && (
        <div className="fx-sheet-sum" role="status" aria-live="polite">
          {notes && <span data-notes-hint="">{t('notesHint')}</span>}
          {say && <span className="fx-sheet-sum-bad" data-sheet-say="">{say}</span>}
        </div>
      )}
      <div className="fx-sheet-scroll">
        <GridCore model={model} active={active} setActive={setActive} editDraft={null}
                  notes={cellNotes} onNote={(k, n) => setCellNotes(c => ({ ...c, [k]: n ?? undefined }))} />
      </div>
    </div>
  )
}
