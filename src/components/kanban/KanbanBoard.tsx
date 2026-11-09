'use client'

import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, Brand, ContentType, TaskComment, TaskAttachment, StageId, BoardView, MoveTaskResult, ContentTheme, InboxState, InboxTab, SheetColumnRecord, SheetValues, SheetId } from '@/types/index'
import { STAGE_META, ALL_STAGES, NINE_STAGE, EIGHT_STAGE, UPSTREAM_STAGES, startsDownstream } from '@/lib/stage-meta'
import { inboxModel, openingTab } from '@/lib/inbox'
import {
  setTaskStage, addComment, bulkUpdateTasks, bulkDeleteTasks, updateTask, updateClip, addClips, addLinkAttachment, dropClip, restoreClip,
} from '@/actions/tasks'
import { useTranslations } from 'next-intl'
import { VideoSheet } from '@/components/sheet/VideoSheet'
import { ContentSheet } from '@/components/content/ContentSheet'
import type { ContentApi } from '@/components/content/types'
import { setLinkedRowHeights } from '@/actions/sheets'
import { addPlan, addPiece, updatePiece, setPieceLink, addTheme, saveTheme, savePillar, removePillar } from '@/actions/content'
import { makeUploader } from '@/lib/attachment-upload'
import { useUIStore } from '@/store/useUIStore'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import {
  FiltersButton, EMPTY_FILTERS, applyBoardFilters, activeFilterCount, type BoardFilterState,
} from './BoardFilters'
import { BoardHeader } from '@/components/board/BoardHeader'
import { BoardToolbar } from '@/components/board/BoardToolbar'
import { UserMenu } from '@/components/shared/UserMenu'
import { TaskModal } from './TaskModal'
import { HeroCards } from './HeroCards'
import { InboxButton } from '@/components/inbox/InboxButton'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useNotify } from '@/components/notifications/NotifyProvider'
import { InboxPanel } from '@/components/inbox/InboxPanel'
import { ViewMenu } from '@/components/inbox/ViewMenu'
import type { InboxApi } from '@/components/inbox/types'
import type { ColumnsApi, ColumnsBundle } from '@/components/sheet/types'
import { addColumn, renameColumn, moveColumn, setColumnShown, resizeColumn, updateColumn, deleteColumn, restoreColumn, setValue as setSheetValue, addContentType } from '@/actions/sheet-columns'
import { applyOp, type LayoutOp } from '@/lib/sheet-columns'
import { snoozeTask, unsnoozeTasks, setInboxPrefs } from '@/actions/inbox'
import { useIsPhone } from '@/hooks/useMediaQuery'
import { BulkBar, type BulkPatch } from './BulkBar'
import { TaskForm } from '@/components/shared/TaskForm'

type FullTask = Task & {
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
  attachments?: TaskAttachment[]
}

interface KanbanBoardProps {
  initialTasks: FullTask[]
  currentUser: Member
  members: Member[]
  brands: Brand[]
  contentTypes: ContentType[]
  slaConfig: SLAConfig
  today: Date
  /** Whether this deployment has a bucket for uploads. */
  hasStorage?: boolean
  /** The Content sheet's themes (spec 009). */
  themes?: ContentTheme[]
  /** The signed-in member's Inbox records (spec 006). */
  inbox?: InboxState
  /** Sheet columns the team has shaped, and custom values (spec 010). */
  sheetColumns?: SheetColumnRecord[]
  sheetValues?: SheetValues
  /**
   * Spec 013 R2: 'sheets' shows only one sheet, inside a Sheets folder's
   * workbook — no board header, no Inbox, and the address is the folder's.
   */
  surface?: 'board' | 'sheets'
  /** With surface 'sheets': the Content sheet or the video sheet. */
  sheetsView?: 'content' | 'sheet'
  /** Spec 013: the linked sheets' saved row heights, by task id. */
  linkedRowHeights?: { content: Record<string, number>; video: Record<string, number> }
}

const NO_INBOX: InboxState = { readIds: [], snoozes: {}, since: new Date(0).toISOString(), pinned: false, showWeek: false }

export function KanbanBoard({
  initialTasks,
  currentUser,
  members,
  brands,
  contentTypes,
  slaConfig,
  today,
  hasStorage = false,
  themes: initialThemes = [],
  inbox: initialInbox = NO_INBOX,
  sheetColumns: initialColumns = [],
  sheetValues: initialValues = {},
  surface = 'board',
  sheetsView = 'content',
  linkedRowHeights,
}: KanbanBoardProps) {
  const embedded = surface === 'sheets'
  const [tasks, setTasks]         = useState<FullTask[]>(initialTasks)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<StageId | null>(null)
  const [filters, setFilters]     = useState<BoardFilterState>(EMPTY_FILTERS)
  const [dragError, setDragError] = useState('')
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy]   = useState(false)
  const [bulkNote, setBulkNote]   = useState('')
  const [, startTransition]       = useTransition()
  const router = useRouter()

  // Server data is copied into local state so drag can reorder within a column
  // without a round trip. That copy has to be re-synced when the server sends
  // new data, or every mutation appears to do nothing until a full reload.
  // Local drag order is intentionally discarded here — it is never persisted.
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])
  const [themes, setThemes] = useState<ContentTheme[]>(initialThemes)
  useEffect(() => { setThemes(initialThemes) }, [initialThemes])


  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask     = useUIStore(s => s.selectTask)
  const showTaskForm   = useUIStore(s => s.showTaskForm)
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
  const setCelebration = useUIStore(s => s.setCelebration)
  const searchParams   = useSearchParams()

  // My Board's "+ Add task" links here with ?new=1 — open the composer on
  // arrival so the action works from off-board.
  const wantsNewTask = searchParams.get('new') === '1'
  useEffect(() => {
    if (wantsNewTask) setShowTaskForm(true)
  }, [wantsNewTask, setShowTaskForm])

  /**
   * Board or Sheet (spec 008), kept in the address so a sheet can be linked to
   * and a reload keeps it: ?view=sheet, &video=<id> for one video, &row=<id>
   * to highlight a clip. Written with the history API, like ?task below, so
   * switching never refetches the board.
   */
  const [view, setViewState] = useState<BoardView>(() => {
    if (embedded) return sheetsView
    const v = searchParams.get('view')
    return v === 'sheet' || v === 'content' ? v : 'board'
  })
  // The Pipeline tab returns to the pipeline view last shown (spec 011 R10).
  const [lastPipelineView, setLastPipelineView] = useState<'board' | 'sheet'>(() =>
    searchParams.get('view') === 'sheet' ? 'sheet' : 'board')
  // Inside a Sheets folder, "Board" leaves for the board itself.
  const setView = (v: BoardView) => { if (embedded && v === 'board') router.push('/board'); else setViewState(v) }
  useEffect(() => { if (view !== 'content') setLastPipelineView(view) }, [view])
  const [sheetVideo, setSheetVideo] = useState<string | null>(() => searchParams.get('video'))
  const [sheetRow, setSheetRow] = useState<string | null>(() => searchParams.get('row'))
  useEffect(() => {
    if (embedded) return
    const url = new URL(window.location.href)
    const want: Record<string, string | null> = {
      view: view === 'board' ? null : view,
      video: view === 'sheet' ? sheetVideo : null,
      row: view === 'sheet' ? sheetRow : null,
    }
    let changed = false
    for (const [k, v] of Object.entries(want)) {
      if ((url.searchParams.get(k) ?? null) === v) continue
      changed = true
      if (v) url.searchParams.set(k, v); else url.searchParams.delete(k)
    }
    if (changed) window.history.replaceState(null, '', url)
  }, [view, sheetVideo, sheetRow])
  /** "Open sheet" from a task panel: a video's sheet, with a clip's row highlighted. */
  function openSheet(videoId: string, rowId: string | null) {
    selectTask(null)
    setSheetVideo(videoId)
    setSheetRow(rowId)
    setView('sheet')
  }

  // ...and its task rows link with ?task=<id>. Without this the link lands on
  // the board with nothing open.
  const deepLinkTaskId = searchParams.get('task')
  useEffect(() => {
    if (deepLinkTaskId) selectTask(deepLinkTaskId)
  }, [deepLinkTaskId, selectTask])

  /**
   * Opening a card puts it in the address bar, so the URL can be copied out of
   * the browser rather than only from the panel's own Copy link.
   *
   * Written with the history API rather than the router: this page is
   * server-rendered and reads every task, so a router navigation would refetch
   * the whole board to change a query string. pushState instead of replaceState
   * so Back closes the panel the way it closes anything else — the popstate
   * listener is what makes that actually close it.
   */
  useEffect(() => {
    const url = new URL(window.location.href)
    const shown = url.searchParams.get('task')
    if (shown === (selectedTaskId ?? null)) return

    if (selectedTaskId) url.searchParams.set('task', selectedTaskId)
    else                url.searchParams.delete('task')

    // Opening adds an entry to go back from; closing replaces it, so Back does
    // not walk through every card that was opened and shut.
    if (selectedTaskId) window.history.pushState(null, '', url)
    else                window.history.replaceState(null, '', url)
  }, [selectedTaskId])

  useEffect(() => {
    function onPop() {
      const id = new URL(window.location.href).searchParams.get('task')
      selectTask(id)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [selectTask])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  /**
   * Whose board this is.
   *
   * Defaults to your own work, because the board is a place to do a job
   * rather than a status report — three hundred tasks, most of them somebody
   * else's, is a wall to read past before you find yours. Team is one click
   * away and the choice is remembered per browser.
   *
   * Read after mount like every other stored preference: reading
   * localStorage during render makes the server and client disagree.
   */
  const [scope, setScope] = useState<'me' | 'team'>('me')
  useEffect(() => {
    if (window.localStorage.getItem('momentum.board.scope') === 'team') setScope('team')
  }, [])
  function chooseScope(next: 'me' | 'team') {
    setScope(next)
    try { window.localStorage.setItem('momentum.board.scope', next) } catch { /* private mode */ }
  }

  /**
   * Dropped clips (spec 008 FR-060) leave the board, the metrics, the alerts,
   * the bell and bulk actions. Split once, here; only the video sheet reads
   * `tasks` with them in.
   */
  const liveTasks = useMemo(() => tasks.filter(t => !t.dropped_at), [tasks])

  const scopedTasks = useMemo(
    () => (scope === 'me'
      ? liveTasks.filter(t => (t.assignee_id ?? t.task_owner_id) === currentUser.id)
      : liveTasks),
    [liveTasks, scope, currentUser.id],
  )

  const filteredTasks = useMemo(
    () => applyBoardFilters(scopedTasks, filters, {
      currentUserId: currentUser.id, slaConfig, today,
    }),
    [scopedTasks, filters, currentUser.id, slaConfig, today],
  )

  const tasksByStage = useMemo(() => {
    const map: Record<string, FullTask[]> = {}
    ALL_STAGES.forEach(s => { map[s] = [] })
    filteredTasks.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [filteredTasks])

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string)
  }

  /** A drop lands either on a column (its stage id) or on a card in one. */
  function stageOfDropTarget(overId: string): StageId | null {
    if ((ALL_STAGES as string[]).includes(overId)) return overId as StageId
    return (tasks.find(t => t.id === overId)?.status as StageId) ?? null
  }

  // Collision resolves to whichever card is nearest, so the column under the
  // pointer has to be derived rather than read off `isOver` — otherwise no
  // column ever highlights while a card is over another card.
  function handleDragOver({ over }: DragOverEvent) {
    setOverStage(over ? stageOfDropTarget(over.id as string) : null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null)
    setOverStage(null)
    if (!over || active.id === over.id) return

    const dragged = tasks.find(t => t.id === active.id)
    if (!dragged) return

    const fromStage = dragged.status as StageId
    const toStage   = stageOfDropTarget(over.id as string)
    if (!toStage) return

    // Same column — a reorder. Position isn't persisted (there is no order
    // column), so this stays local and is discarded on the next server render.
    if (toStage === fromStage) {
      setTasks(prev => {
        const oldIdx = prev.findIndex(t => t.id === active.id)
        const newIdx = prev.findIndex(t => t.id === over.id)
        if (oldIdx === -1 || newIdx === -1) return prev
        return arrayMove(prev, oldIdx, newIdx)
      })
      return
    }

    // An 8-stage task has no C-Check column to land in; refuse before the
    // optimistic move so the card never visibly jumps and snap back.
    const path = dragged.nine_stage ? NINE_STAGE : EIGHT_STAGE
    if (!path.includes(toStage)) {
      setDragError(`${STAGE_META[toStage].label_en} isn't part of this task's pipeline`)
      return
    }

    setDragError('')
    startTransition(async () => {
      const res = await moveTo(dragged, toStage)
      if (!res.success) {
        setDragError(
          res.error === 'not_authorized'
            ? `Only ${STAGE_META[fromStage].owner_role ?? 'the task owner'} can move this out of ${STAGE_META[fromStage].label_en}`
            : 'Could not move that task',
        )
      }
    })
  }

  /**
   * The board's move, shared with the video sheet (spec 008 FR-020, T021).
   *
   * Optimistic: the card or row moves now (stage date today) and goes back if
   * the server says no. The server decides with the same rule the sheet's menu
   * uses, and the celebration plays under the same rule as a drag (§V).
   */
  async function moveTo(task: Pick<Task, 'id' | 'name' | 'status' | 'stage_date'>, toStage: StageId): Promise<MoveTaskResult> {
    const from = { status: task.status, stage_date: task.stage_date }
    const todayStr = new Date().toISOString().slice(0, 10)
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, status: toStage, stage_date: todayStr } : t)))
    let res: MoveTaskResult
    try { res = await setTaskStage(task.id, toStage) } catch { res = { success: false, shouldCelebrate: false, error: 'generic' } }
    if (!res.success) {
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, ...from } : t)))
      return res
    }
    router.refresh()
    if (res.shouldCelebrate) {
      setCelebration({ taskName: task.name, stageLabel: STAGE_META[toStage].label_en })
    }
    return res
  }

  // ── The video sheet's host (spec 008 contracts/sheet-ui.md §2) ──────────
  const ta = useTranslations('attachments')
  const th = useTranslations('header')
  const patchTask = (id: string, patch: Partial<FullTask>) =>
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
  // ── Sheet columns (spec 010): the shared layout and custom values ────────
  const [colRecords, setColRecords] = useState<SheetColumnRecord[]>(initialColumns)
  const [colValues, setColValues] = useState<SheetValues>(initialValues)
  const [types, setTypes] = useState<ContentType[]>(contentTypes)
  useEffect(() => { setColRecords(initialColumns) }, [initialColumns])
  useEffect(() => { setColValues(initialValues) }, [initialValues])
  useEffect(() => { setTypes(contentTypes) }, [contentTypes])
  const who = { id: currentUser.id, name: currentUser.name }
  /** A layout change shows now; the server decides; a refusal puts it back. */
  async function layout(sheet: SheetId, op: LayoutOp, call: () => Promise<{ success: boolean; error?: string }>) {
    const before = colRecords
    setColRecords(r => applyOp(sheet, r, op, who))
    const res = await call().catch(() => ({ success: false, error: 'generic' }))
    if (!res.success) setColRecords(before)
    else router.refresh()
    return res
  }
  const columnsApi: ColumnsApi = {
    async add(sheet, input) {
      const r = await addColumn(sheet, input).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) { setColRecords(rs => [...rs.filter(x => x.id !== r.column.id), r.column]); router.refresh() }
      return r
    },
    rename: (sheet, key, name) => layout(sheet, { op: 'rename', key, name }, () => renameColumn(sheet, key, name)),
    move: (sheet, key, before) => layout(sheet, { op: 'move', key, before }, () => moveColumn(sheet, key, before)),
    setShown: (sheet, key, set, shown) => layout(sheet, { op: 'shown', key, set, shown }, () => setColumnShown(sheet, key, set, shown)),
    resize: (sheet, key, width) => layout(sheet, { op: 'width', key, width }, () => resizeColumn(sheet, key, width)),
    async update(id, patch) {
      const r = await updateColumn(id, patch).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) router.refresh()
      return r
    },
    async remove(id) {
      const before = colRecords
      setColRecords(rs => rs.filter(x => x.id !== id))
      const r = await deleteColumn(id).catch(() => ({ success: false as const, error: 'generic' }))
      if (!r.success) setColRecords(before); else router.refresh()
      return r
    },
    async restore(id) {
      const r = await restoreColumn(id).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) { setColRecords(rs => [...rs.filter(x => x.id !== id), r.column]); router.refresh() }
      return r
    },
    async setValue(columnId, taskId, raw) {
      const before = colValues[columnId]?.[taskId]
      const r = await setSheetValue(columnId, taskId, raw).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success) {
        setColValues(vs => {
          const col = { ...(vs[columnId] ?? {}) }
          if (r.value) col[taskId] = r.value; else delete col[taskId]
          return { ...vs, [columnId]: col }
        })
      } else if (before !== undefined) {
        setColValues(vs => ({ ...vs, [columnId]: { ...(vs[columnId] ?? {}), [taskId]: before } }))
      }
      return r
    },
    async addContentType(label) {
      const r = await addContentType(label).catch(() => ({ success: false as const, error: 'generic' }))
      if (r.success && !types.some(x => x.label === r.label)) setTypes(ts => [...ts, { id: r.label, label: r.label } as ContentType])
      if (r.success) router.refresh()
      return r
    },
  }
  const columnsBundle: ColumnsBundle = { records: colRecords, values: colValues, api: columnsApi }

  const sheetApi: ContentApi = {
    move: (taskId, to) => {
      const task = tasks.find(t => t.id === taskId)
      return task ? moveTo(task, to) : Promise.resolve({ success: false, shouldCelebrate: false, error: 'not_found' })
    },
    async update(taskId, patch) {
      const before = tasks.find(t => t.id === taskId)
      if (!before) return { success: false, error: 'not_found' }
      const optimistic: Partial<FullTask> = {}
      if (patch.name !== undefined) optimistic.name = patch.name
      if (patch.content_type_label !== undefined) optimistic.content_type_label = patch.content_type_label
      if (patch.assignee_id !== undefined) {
        optimistic.assignee_id = patch.assignee_id || null
        optimistic.assignee = members.find(m => m.id === patch.assignee_id)
      }
      patchTask(taskId, optimistic)
      const res = await updateTask(taskId, patch).catch(() => ({ success: false, error: 'generic' }))
      if (!res.success) patchTask(taskId, { name: before.name, content_type_label: before.content_type_label, assignee_id: before.assignee_id, assignee: before.assignee })
      else router.refresh()
      return res
    },
    async updateClip(taskId, patch) {
      const before = tasks.find(t => t.id === taskId)
      if (!before) return { success: false, error: 'not_found' }
      const { published_url, ...clipPatch } = patch
      const base = before.clip ?? { clip_no: null, source: null, file_name: null, in_ms: null, out_ms: null, video_id: before.parent_task_id ?? null }
      patchTask(taskId, {
        clip: { ...base, ...clipPatch },
        ...(published_url !== undefined ? { published_url } : {}),
      })
      const res = await updateClip(taskId, patch).catch(() => ({ success: false as const, error: 'generic' }))
      if (!res.success) patchTask(taskId, { clip: before.clip, published_url: before.published_url })
      else if ('clip' in res && res.clip) patchTask(taskId, { clip: res.clip })
      return res
    },
    async addClips(videoId, rows) {
      const res = await addClips(videoId, rows).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success && 'created' in res && res.created?.length) {
        const video = tasks.find(t => t.id === videoId)
        const now = new Date().toISOString()
        const added = res.created.map(c => ({
          ...(video as FullTask),
          id: c.id, name: c.name, parent_task_id: videoId, parent: { id: videoId, name: video?.name ?? '' },
          content_type_label: 'Reel', status: 'todo' as StageId, stage_date: now.slice(0, 10),
          task_owner_id: currentUser.id, task_owner: currentUser, assignee_id: null, assignee: undefined,
          due_date: null, priority: 'Medium' as const, created_at: now, updated_at: now,
          comments: [], subtasks: [], published_url: null, dropped_at: null, clip: c.clip,
          cover_image_url: undefined, cover_thumb: undefined,
          attachments: c.link_attachment ? [{ ...c.link_attachment, task_id: c.id, uploaded_by: currentUser.id }] : [],
        }))
        setTasks(prev => [...added, ...prev])
        router.refresh()
      } else if (res.success && 'values' in res && res.values) router.refresh()
      return res
    },
    async addLink(taskId, url) {
      const res = await addLinkAttachment(taskId, url).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success && 'row' in res && res.row) {
        const row = res.row
        setTasks(prev => prev.map(t => (t.id === taskId && !(t.attachments ?? []).some(a => a.id === row.id)
          ? { ...t, attachments: [...(t.attachments ?? []), { ...row, task_id: taskId, uploaded_by: row.uploaded_by ?? undefined }] }
          : t)))
        router.refresh()
      }
      return res
    },
    upload: taskId => {
      const up = makeUploader({ taskId, hasStorage, t: ta, onStored: () => router.refresh() })
      return async (file, name, onProgress) => {
        const r = await up(file, name, onProgress)
        if (r.ok) {
          const { data: _bytes, ...meta } = r.attachment
          void _bytes
          setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, attachments: [...(t.attachments ?? []), meta] } : t)))
        }
        return r
      }
    },
    async drop(taskId) {
      const at = new Date().toISOString()
      patchTask(taskId, { dropped_at: at })
      const res = await dropClip(taskId).catch(() => ({ success: false as const, error: 'generic' }))
      if (!res.success) patchTask(taskId, { dropped_at: null })
      else router.refresh()
      return res
    },
    async restore(taskId) {
      const before = tasks.find(t => t.id === taskId)
      patchTask(taskId, { dropped_at: null })
      const res = await restoreClip(taskId).catch(() => ({ success: false as const, error: 'generic' }))
      if (!res.success) patchTask(taskId, { dropped_at: before?.dropped_at ?? null })
      else {
        if ('stage_date' in res && res.stage_date) patchTask(taskId, { stage_date: res.stage_date })
        router.refresh()
      }
      return res
    },
    async setRowHeights(kind, entries) {
      return setLinkedRowHeights(kind, entries).catch(() => ({ success: false as const, error: 'generic' }))
    },
    // ── the Content sheet (spec 009) ──
    async addPlan(rows, opts) {
      const res = await addPlan(rows, opts).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success) router.refresh()
      return res
    },
    async addPiece(themeId, input) {
      const res = await addPiece(themeId, input).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success && 'id' in res && res.id) {
        const theme = themes.find(x => x.id === themeId)
        const now = new Date().toISOString()
        const base = tasks[0]
        if (base) {
          setTasks(prev => [{
            ...base, id: res.id!, name: input.title, project_id: themeId, pillar_id: input.pillarId ?? null,
            brand_id: theme?.brand_id ?? '', content_type_label: 'Post', status: 'todo' as StageId, stage_date: now.slice(0, 10),
            // The theme's owner owns it; a member who is not becomes its assignee (addPiece).
            ...(() => {
              const ownerId = theme?.owner_id ?? currentUser.id
              const admin = currentUser.access === 'admin' || currentUser.access === 'superuser'
              const assigneeId = ownerId !== currentUser.id && !admin ? currentUser.id : null
              return {
                task_owner_id: ownerId, task_owner: members.find(m => m.id === ownerId) ?? currentUser,
                assignee_id: assigneeId, assignee: assigneeId ? currentUser : undefined,
              }
            })(),
            parent_task_id: null, parent: null,
            due_date: null, priority: 'Medium' as const, created_at: now, updated_at: now, comments: [], subtasks: [], attachments: [],
            published_url: null, post_url: null, dropped_at: null, clip: null, cover_image_url: undefined, cover_thumb: undefined,
          }, ...prev])
        }
        router.refresh()
      }
      return res
    },
    async updatePiece(taskId, patch) {
      const before = tasks.find(t => t.id === taskId)
      if (!before) return { success: false, error: 'not_found' }
      patchTask(taskId, patch as Partial<FullTask>)
      const res = await updatePiece(taskId, patch).catch(() => ({ success: false as const, error: 'generic' }))
      if (!res.success) patchTask(taskId, { pillar_id: before.pillar_id, due_date: before.due_date, post_url: before.post_url, published_url: before.published_url })
      else router.refresh()
      return res
    },
    async setPieceLink(taskId, role, url) {
      const res = await setPieceLink(taskId, role, url).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success) {
        const row = 'row' in res ? res.row : null
        setTasks(prev => prev.map(t => (t.id !== taskId ? t : {
          ...t,
          attachments: [
            ...(t.attachments ?? []).filter(a => a.link_role !== role),
            ...(row ? [{ id: row.id, task_id: taskId, filename: row.filename, url: row.url, content_type: 'text/uri-list', link_role: role, uploaded_at: row.uploaded_at }] : []),
          ],
        })))
        router.refresh()
      }
      return res
    },
    async addTheme(name) {
      const res = await addTheme(name).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success) router.refresh()
      return res
    },
    async saveTheme(id, patch) {
      const before = themes.find(x => x.id === id)
      setThemes(prev => prev.map(x => (x.id === id ? { ...x, ...patch, name: patch.name ?? x.name } as ContentTheme : x)))
      const res = await saveTheme(id, patch).catch(() => ({ success: false as const, error: 'generic' }))
      if (!res.success && before) setThemes(prev => prev.map(x => (x.id === id ? before : x)))
      else router.refresh()
      return res
    },
    async savePillar(themeId, input) {
      const res = await savePillar(themeId, input).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success && 'id' in res && res.id) {
        const id = res.id
        setThemes(prev => prev.map(x => (x.id !== themeId ? x : {
          ...x,
          pillars: input.id
            ? x.pillars.map(p => (p.id === input.id ? { ...p, name: input.name } : p))
            : [...x.pillars, { id, name: input.name, sort_order: x.pillars.length }],
        })))
        router.refresh()
      }
      return res
    },
    async removePillar(id) {
      const res = await removePillar(id).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success) {
        setThemes(prev => prev.map(x => ({ ...x, pillars: x.pillars.filter(p => p.id !== id) })))
        setTasks(prev => prev.map(t => (t.pillar_id === id ? { ...t, pillar_id: null } : t)))
        router.refresh()
      }
      return res
    },
  }

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null
  const draggedTask  = activeDragId ? tasks.find(t => t.id === activeDragId) ?? null : null

  // ── The Inbox (spec 006) ──────────────────────────────────────────────────
  // The member's read mentions, put-offs and prefs, kept here so every action
  // lands at once and rolls back if the server says no (FR-029).
  const [inbox, setInbox] = useState<InboxState>(initialInbox)
  const inboxSig = JSON.stringify(initialInbox)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setInbox(initialInbox) }, [inboxSig])

  // "Now" is the server's day until mount, so the first render matches; then
  // the device's own clock, ticking each minute for "today" and "late".
  const [now, setNow] = useState<Date>(today)
  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const model = useMemo(
    () => inboxModel({ tasks: liveTasks, member: currentUser, state: inbox, slaConfig, now }),
    [liveTasks, currentUser, inbox, slaConfig, now],
  )
  const [inboxOpen, setInboxOpen] = useState(false)
  const [inboxTab, setInboxTab] = useState<InboxTab>('todo')
  const inboxBtn = useRef<HTMLButtonElement>(null)
  const panelShown = inboxOpen || inbox.pinned

  function openInbox() {
    setInboxTab(openingTab(model.counts))
    setInboxOpen(true)
  }
  function closeInbox() {
    setInboxOpen(false)
    if (inbox.pinned) void savePrefs({ pinned: false })
    requestAnimationFrame(() => inboxBtn.current?.focus())
  }

  async function savePrefs(p: { pinned?: boolean; showWeek?: boolean }) {
    const before = inbox
    setInbox(s => ({ ...s, ...(p.pinned !== undefined ? { pinned: p.pinned } : {}), ...(p.showWeek !== undefined ? { showWeek: p.showWeek } : {}) }))
    const res = await setInboxPrefs(p).catch(() => ({ success: false, error: 'generic' }))
    if (!res.success) setInbox(before)
    return res
  }

  /** Apply a local change now; undo it if the server refuses (FR-029). */
  async function withInbox(change: (s: InboxState) => InboxState, run: () => Promise<{ success: boolean; error?: string }>) {
    let before: InboxState | null = null
    setInbox(s => { before = s; return change(s) })
    let res: { success: boolean; error?: string }
    try { res = await run() } catch { res = { success: false, error: 'generic' } }
    if (!res.success && before) setInbox(before)
    return res
  }


  /** The task panel opens at this comment (Team and Mentions, FR-042). */
  const [commentFor, setCommentFor] = useState<{ taskId: string; commentId: string } | null>(null)
  /** …or at its Attachments, from an attachment notification (spec 012 R14). */
  const [sectionFor, setSectionFor] = useState<{ taskId: string; section: 'attachments' } | null>(null)

  // ── Notifications (spec 012) ──────────────────────────────────────────────
  // The bell's rows and toasts open tasks here, in place, instead of
  // reloading the board; a task that's gone says so (R14).
  const notify = useNotify()
  const taskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks])
  const openTarget = useRef<(t: { taskId: string; commentId?: string; section?: 'attachments' }) => void>(() => {})
  openTarget.current = target => {
    if (!taskIds.has(target.taskId)) { notify?.showGone(); return }
    setCommentFor(target.commentId ? { taskId: target.taskId, commentId: target.commentId } : null)
    setSectionFor(target.section ? { taskId: target.taskId, section: target.section } : null)
    selectTask(target.taskId)
  }
  // A notification is about something newer than this page's copy of the
  // board. Until the comment it points at is here, fetch the board again (a
  // few times: a refresh that races the panel's own address change is
  // dropped), so the panel can show it and scroll to it.
  useEffect(() => {
    if (!commentFor) return
    const has = () => tasks.find(x => x.id === commentFor.taskId)?.comments.some(c => c.id === commentFor.commentId)
    if (has()) return
    let n = 0
    const id = window.setInterval(() => { router.refresh(); if (++n >= 5) window.clearInterval(id) }, 1200)
    const first = window.setTimeout(() => router.refresh(), 150)
    return () => { window.clearInterval(id); window.clearTimeout(first) }
  }, [commentFor, tasks, router])
  useEffect(() => {
    if (!notify) return
    notify.setNavigator(t => openTarget.current(t))
    return () => notify.setNavigator(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notify?.setNavigator])
  // No toast for the task that's open (FR-037).
  useEffect(() => { notify?.setOpenTaskId(selectedTaskId ?? null) }, [notify, selectedTaskId])

  // Links from phone alerts and emails: /board?task=…&n=…&comment=…|section=attachments.
  // Read once on arrival, then tidied out of the address.
  useEffect(() => {
    const url = new URL(window.location.href)
    const taskId = url.searchParams.get('task')
    const n = url.searchParams.get('n')
    const comment = url.searchParams.get('comment')
    const section = url.searchParams.get('section')
    if (!taskId && !n) return
    if (n) void notify?.api.mark(n, true).then(() => notify?.refresh())
    if (taskId) {
      if (!taskIds.has(taskId)) { selectTask(null); notify?.showGone() }
      else {
        if (comment) setCommentFor({ taskId, commentId: comment })
        if (section === 'attachments') setSectionFor({ taskId, section: 'attachments' })
      }
    }
    if (n || comment || section) {
      ;['n', 'comment', 'section'].forEach(k => url.searchParams.delete(k))
      window.history.replaceState(null, '', url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const inboxApi: InboxApi = {
    move: (taskId, to) => {
      const task = tasks.find(t => t.id === taskId)
      return task ? moveTo(task, to) : Promise.resolve({ success: false, shouldCelebrate: false, error: 'not_found' })
    },
    async comment(taskId, body, mentions) {
      const res = await addComment(taskId, body, mentions).catch(() => ({ success: false, error: 'generic' }))
      if (res.success) router.refresh()
      return res
    },
    async setDate(taskId, iso) {
      const before = tasks.find(t => t.id === taskId)
      if (!before) return { success: false, error: 'not_found' }
      patchTask(taskId, { due_date: iso })
      const res = await updateTask(taskId, { due_date: iso }).catch(() => ({ success: false, error: 'generic' }))
      if (!res.success) patchTask(taskId, { due_date: before.due_date })
      else router.refresh()
      return res
    },
    snooze: (taskId, until) =>
      withInbox(s => ({ ...s, snoozes: { ...s.snoozes, [taskId]: until } }), () => snoozeTask(taskId, until)),
    unsnooze: ids =>
      withInbox(s => { const z = { ...s.snoozes }; ids.forEach(id => delete z[id]); return { ...s, snoozes: z } }, () => unsnoozeTasks(ids)),
    setPrefs: savePrefs,
    openTask(taskId, opts) {
      setCommentFor(opts?.commentId ? { taskId, commentId: opts.commentId } : null)
      if (!inbox.pinned) setInboxOpen(false)
      selectTask(taskId)
    },
  }
  /**
   * The stages before Ready to Design.
   *
   * A designer's work starts at r-design; four columns of content drafting in
   * front of it is somebody else's queue. Hidden by default for design-side
   * roles — but only defaulted, never enforced, because seeing what is coming
   * is the whole reason to look upstream.
   *
   * The preference is read after mount, not during render: reading
   * localStorage while rendering makes the server and client disagree.
   */
  const [showUpstream, setShowUpstream] = useState(true)
  const isPhone = useIsPhone()
  useEffect(() => {
    const stored = window.localStorage.getItem('momentum.board.upstream')
    setShowUpstream(stored !== null ? stored === '1' : !startsDownstream(currentUser.role))
  }, [currentUser.role])
  function setUpstream(v: boolean) {
    setShowUpstream(v)
    try { window.localStorage.setItem('momentum.board.upstream', v ? '1' : '0') } catch { /* private mode */ }
  }
  const stagesInScope = showUpstream
    ? ALL_STAGES
    : ALL_STAGES.filter(id => !(UPSTREAM_STAGES as string[]).includes(id))

  /* Stacked, an empty stage is a heading with nothing beneath it.
   *
   * Side by side an empty column still says something — it shows the shape of
   * the pipeline and gives a card somewhere to be dropped. One under another
   * it is eleven headings to scroll past to reach the work, and there is no
   * dropping on a phone anyway. So the phone shows only the stages that have
   * something in them. */
  const shownStages = isPhone
    ? stagesInScope.filter(id => (tasksByStage[id] ?? []).length > 0)
    : stagesInScope


  // ── Bulk selection ────────────────────────────────────────────────────────
  // Shift-click extends from the last click through the *visible* order, which
  // is what the eye expects — the filtered, column-grouped sequence, not the
  // order the server happened to send.
  // "Visible" has to mean visible: with the upstream columns hidden, a
  // shift-click must not sweep up cards that are not on screen.
  const visibleOrder = useMemo(
    () => shownStages.flatMap(id => (tasksByStage[id] ?? []).map(t => t.id)),
    [tasksByStage, shownStages],
  )
  const [lastClicked, setLastClicked] = useState<string | null>(null)

  function toggleSelect(id: string, shiftKey: boolean) {
    setBulkNote('')
    setSelected(prev => {
      const next = new Set(prev)
      if (shiftKey && lastClicked) {
        const a = visibleOrder.indexOf(lastClicked)
        const b = visibleOrder.indexOf(id)
        if (a !== -1 && b !== -1) {
          const [from, to] = a < b ? [a, b] : [b, a]
          for (let i = from; i <= to; i++) next.add(visibleOrder[i])
          return next
        }
      }
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setLastClicked(id)
  }

  function selectStage(stageId: StageId, on: boolean) {
    const ids = (tasksByStage[stageId] ?? []).map(t => t.id)
    setBulkNote('')
    setSelected(prev => {
      const next = new Set(prev)
      ids.forEach(id => (on ? next.add(id) : next.delete(id)))
      return next
    })
  }

  /**
   * `clearAfter` is true only for delete. An edit keeps the selection so a
   * second change can be chained onto the same set — and so the "N changed"
   * note has a bar left to sit in, since the bar disappears at zero.
   */
  function runBulk(
    fn: () => Promise<{ changed: number; refused: number; error?: string }>,
    clearAfter = false,
  ) {
    setBulkBusy(true)
    setBulkNote('')
    startTransition(async () => {
      const res = await fn()
      setBulkBusy(false)
      if (res.error) { setBulkNote(res.error); return }
      setBulkNote(
        res.refused > 0
          ? `${res.changed} changed · ${res.refused} not yours`
          : `${res.changed} changed`,
      )
      if (clearAfter) setSelected(new Set())
      router.refresh()
      setTimeout(() => setBulkNote(''), 5000)
    })
  }

  // Escape drops the selection — the same key that closes everything else.
  useEffect(() => {
    if (selected.size === 0) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])

  // A file to preview when the panel opens from a sheet's Files cell (spec 008 FR-045).
  const [previewFor, setPreviewFor] = useState<{ taskId: string; previewId: string } | null>(null)

  const taskPanel = selectedTask && (
    <TaskModal
      task={selectedTask}
      currentUser={currentUser}
      stages={[]}
      slaConfig={slaConfig}
      today={today}
      brands={brands}
      members={members}
      contentTypes={contentTypes}
      // Names only — the composer's # picker and the chips a posted
      // comment draws. Cheap: the board already holds every row.
      allTasks={tasks.map(t => ({ id: t.id, name: t.name, status: t.status }))}
      hasStorage={hasStorage}
      initialPreviewId={previewFor?.taskId === selectedTask.id ? previewFor.previewId : undefined}
      initialCommentId={commentFor?.taskId === selectedTask.id ? commentFor.commentId : undefined}
      initialSection={sectionFor?.taskId === selectedTask.id ? sectionFor.section : undefined}
      onOpenSheet={openSheet}
      onClose={() => { setPreviewFor(null); setCommentFor(null); setSectionFor(null); selectTask(null) }}
    />
  )

  /* ── The header (spec 011): top bar and title row, on every view ── */
  const header = (
    <BoardHeader
      tab={view === 'content' ? 'content' : 'pipeline'}
      onTab={tab => setView(tab === 'content' ? 'content' : lastPipelineView)}
      search={filters.search}
      onSearch={q => setFilters(f => ({ ...f, search: q }))}
      inbox={
        <>
        <NotificationBell />
        <InboxButton
          ref={inboxBtn}
          variant="compact"
          counts={model.counts}
          ringKeys={model.ringKeys}
          open={view === 'board' ? panelShown : inboxOpen}
          onToggle={() => ((view === 'board' ? panelShown : inboxOpen) ? closeInbox() : openInbox())}
        />
        </>
      }
      account={<UserMenu member={currentUser} variant="header" />}
      canCreate={currentUser.access !== 'user'}
      onNewTask={() => setShowTaskForm(true)}
    />
  )
  const inboxPanel = (pinnable: boolean) => (
    <InboxPanel
      model={model}
      me={currentUser}
      members={members}
      now={now}
      api={inboxApi}
      tab={inboxTab}
      onTab={setInboxTab}
      pinned={pinnable && inbox.pinned}
      onPin={() => {
        if (inbox.pinned) closeInbox()
        else { setInboxOpen(true); void savePrefs({ pinned: true }) }
      }}
      onClose={closeInbox}
      buttonRef={inboxBtn}
    />
  )
  const taskForm = showTaskForm && (
    <TaskForm
      currentUser={currentUser}
      brands={brands}
      contentTypes={contentTypes}
      members={members}
    />
  )

  if (view === 'content') {
    return (
      <div className={`fx-board-page is-sheet${embedded ? ' is-embedded' : ''}`}>
        {!embedded && header}
        <ContentSheet
          tasks={tasks}
          themes={themes}
          me={currentUser}
          members={members}
          contentTypes={types}
          columns={columnsBundle}
          rowHeights={linkedRowHeights?.content}
          onOpenTask={id => selectTask(id)}
          onOpenVideoSheet={id => { setSheetVideo(id); setSheetRow(null); setView('sheet') }}
          onView={v => setView(v)}
          query={filters.search}
          api={sheetApi}
        />
        {taskPanel}
        {!embedded && inboxOpen && inboxPanel(false)}
        {taskForm}
      </div>
    )
  }

  if (view === 'sheet') {
    return (
      <div className={`fx-board-page is-sheet${embedded ? ' is-embedded' : ''}`}>
        {!embedded && header}
        <VideoSheet
          tasks={tasks}
          me={currentUser}
          members={members}
          contentTypes={types}
          columns={columnsBundle}
          rowHeights={linkedRowHeights?.video}
          hasStorage={hasStorage}
          videoId={sheetVideo}
          highlightId={sheetRow}
          onOpenVideo={id => { setSheetVideo(id); setSheetRow(null) }}
          onOpenTask={(id, opts) => { setPreviewFor(opts?.previewId ? { taskId: id, previewId: opts.previewId } : null); selectTask(id) }}
          onView={v => setView(v)}
          query={filters.search}
          api={sheetApi}
        />
        {taskPanel}
        {!embedded && inboxOpen && inboxPanel(false)}
        {taskForm}
      </div>
    )
  }

  // The one brand selected, if exactly one: how much of its work has no project.
  const noProject = filters.brandIds.length === 1
    ? liveTasks.filter(t => t.brand_id === filters.brandIds[0] && !t.project_id).length
    : null

  return (
    <div
      className={selected.size > 0 ? 'fx-board-selecting' : undefined}
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        gap: 22, paddingBottom: selected.size > 0 ? 90 : 30, background: '#FFFFFF',
      }}
    >
      <div className="fx-hd-wrap">
        {header}
        <BoardToolbar
          scope={scope}
          onScope={chooseScope}
          brands={brands}
          brandIds={filters.brandIds}
          onBrandIds={ids => setFilters(f => ({ ...f, brandIds: ids }))}
          noProject={noProject}
          filters={<FiltersButton filters={filters} onChange={setFilters} tasks={liveTasks} members={members} />}
          view="board"
          onView={v => setView(v)}
          display={
            <ViewMenu
              showWeek={inbox.showWeek}
              onShowWeek={v => void savePrefs({ showWeek: v })}
              upstream={showUpstream}
              onUpstream={setUpstream}
            />
          }
        />
        {activeFilterCount(filters) > 0 && (
          <div className="fx-hd-showing">{th('showing', { shown: filteredTasks.length, total: scopedTasks.length })}</div>
        )}
      </div>

      {/* Your week: off by default, turned on in Display options (FR-002). */}
      {inbox.showWeek && <HeroCards tasks={liveTasks} today={today} />}

      {/* Pinned, the Inbox sits beside the board (FR-060); the board narrows. */}
      <div className={inbox.pinned ? 'fx-board-split' : 'fx-board-main'}>
      <div className="fx-board-area">

      {dragError && (
        <div
          role="alert"
          onClick={() => setDragError('')}
          style={{
            margin: '10px 26px 0 38px', padding: '7px 12px', borderRadius: 10,
            background: '#FDE7EA', color: '#D22040', fontSize: 12.5,
            fontWeight: 700, cursor: 'pointer', flexShrink: 0,
          }}
        >
          {dragError}
        </div>
      )}

      {/* closestCorners, not closestCenter: with multiple droppable columns a
          card dragged to the top of a neighbouring column still resolves to
          that column rather than snapping back to the one it came from. */}
      <DndContext
        // Without an explicit id, dnd-kit names its aria-describedby target
        // from a module-level counter that server and client disagree on, and
        // every card hydrates with a mismatched attribute.
        id="fluxo-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => { setActiveDragId(null); setOverStage(null) }}
      >
        {/* §7 board: fixed 244px columns on a single scrolling row.
            On a phone the same columns stack — see .fx-board-cols. Eleven
            columns at 244px is about seven screens wide, and shrinking them
            makes a worse tool rather than a smaller one; stacked, each stage
            is a heading with its cards at full width under it. */}
        <div className="fx-board-cols" style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '244px',
          gap: 14, marginTop: 14, alignItems: 'start', overflowX: 'auto',
          minWidth: 0, padding: '0 26px 16px 38px',
        }}>
          {shownStages.map(stageId => {
            const stage      = STAGE_META[stageId]
            const stageTasks = tasksByStage[stageId] ?? []

            return (
              <KanbanColumn
                key={stageId}
                stage={stage}
                tasks={stageTasks}
                currentUser={currentUser}
                members={members}
                slaConfig={slaConfig}
                today={today}
                highlight={overStage === stageId && activeDragId !== null}
                onSelectTask={id => selectTask(id)}
                onAddTask={currentUser.access !== 'user' ? () => setShowTaskForm(true) : undefined}
                selectedIds={selected}
                selecting={selected.size > 0}
                onToggleSelect={toggleSelect}
                onSelectAll={selectStage}
              />
            )
          })}
        </div>

        {/* The dragged card itself — a sortable item does not follow the
            pointer across columns, the overlay does. */}
        <DragOverlay dropAnimation={null}>
          {draggedTask && (
            <TaskCardOverlay
              task={draggedTask}
              currentStageOwner={
                STAGE_META[draggedTask.status].owner_role
                  ? members.find(m => m.role === STAGE_META[draggedTask.status].owner_role) ?? null
                  : null
              }
              slaConfig={slaConfig}
              today={today}
            />
          )}
        </DragOverlay>
      </DndContext>
      </div>

      {panelShown && inboxPanel(true)}
      </div>

      <BulkBar
        count={selected.size}
        members={members}
        brands={brands}
        types={contentTypes}
        busy={bulkBusy}
        note={bulkNote}
        onApply={(patch: BulkPatch) => runBulk(() => bulkUpdateTasks([...selected], patch))}
        onDelete={() => runBulk(() => bulkDeleteTasks([...selected]), true)}
        onClear={() => { setSelected(new Set()); setBulkNote('') }}
      />

      {/* Task modal */}
      {taskPanel}

      {/* Task creation form */}
      {taskForm}
    </div>
  )
}
