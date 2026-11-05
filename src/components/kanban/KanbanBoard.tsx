'use client'

import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, Brand, ContentType, TaskComment, TaskAttachment, StageId, BoardView, MoveTaskResult, ContentTheme, InboxState, InboxTab } from '@/types/index'
import { STAGE_META, ALL_STAGES, NINE_STAGE, EIGHT_STAGE, UPSTREAM_STAGES, startsDownstream } from '@/lib/stage-meta'
import { PIPE } from '@/lib/pipeline-tokens'
import { inboxModel, openingTab } from '@/lib/inbox'
import { initials, avatarColor } from '@/lib/utils'
import {
  setTaskStage, addComment, bulkUpdateTasks, bulkDeleteTasks, updateTask, updateClip, addClips, addLinkAttachment, dropClip, restoreClip,
} from '@/actions/tasks'
import { useTranslations } from 'next-intl'
import { VideoSheet } from '@/components/sheet/VideoSheet'
import { ContentSheet } from '@/components/content/ContentSheet'
import type { ContentApi } from '@/components/content/types'
import { addPlan, addPiece, updatePiece, setPieceLink, addTheme, saveTheme, savePillar, removePillar } from '@/actions/content'
import { makeUploader } from '@/lib/attachment-upload'
import { useUIStore } from '@/store/useUIStore'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import {
  BoardFilters, EMPTY_FILTERS, applyBoardFilters, type BoardFilterState,
} from './BoardFilters'
import { TaskModal } from './TaskModal'
import { HeroCards } from './HeroCards'
import { InboxButton } from '@/components/inbox/InboxButton'
import { InboxPanel } from '@/components/inbox/InboxPanel'
import { ViewMenu } from '@/components/inbox/ViewMenu'
import type { InboxApi } from '@/components/inbox/types'
import { markMentionsRead, replyToMention, snoozeTask, unsnoozeTasks, setInboxPrefs } from '@/actions/inbox'
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
}: KanbanBoardProps) {
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
  const [view, setView] = useState<BoardView>(() => {
    const v = searchParams.get('view')
    return v === 'sheet' || v === 'content' ? v : 'board'
  })
  const [sheetVideo, setSheetVideo] = useState<string | null>(() => searchParams.get('video'))
  const [sheetRow, setSheetRow] = useState<string | null>(() => searchParams.get('row'))
  useEffect(() => {
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
  const patchTask = (id: string, patch: Partial<FullTask>) =>
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
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
      }
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

  const markRead = (ids: string[]) =>
    withInbox(s => ({ ...s, readIds: [...new Set([...s.readIds, ...ids])] }), () => markMentionsRead(ids))

  /** The task panel opens at this comment (Team and Mentions, FR-042). */
  const [commentFor, setCommentFor] = useState<{ taskId: string; commentId: string } | null>(null)

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
    markRead,
    async reply(commentId, body) {
      const res = await withInbox(s => ({ ...s, readIds: [...new Set([...s.readIds, commentId])] }), () => replyToMention(commentId, body))
      if (res.success) router.refresh()
      return res
    },
    setPrefs: savePrefs,
    openTask(taskId, opts) {
      // Opening a task from a mention reads it (FR-031).
      const m = model.mentions.find(x => x.comment.id === opts?.commentId && x.unread)
      if (m) void markRead([m.comment.id])
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

  // Time-derived, and computed on the client only — rendering it on the server
  // would freeze whatever hour the page was built at.
  const [greeting, setGreeting] = useState('Hello')
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Hey' : 'Good evening')
  }, [])

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
      onOpenSheet={openSheet}
      onClose={() => { setPreviewFor(null); setCommentFor(null); selectTask(null) }}
    />
  )

  if (view === 'content') {
    return (
      <>
        <ContentSheet
          tasks={tasks}
          themes={themes}
          me={currentUser}
          members={members}
          contentTypes={contentTypes}
          onOpenTask={id => selectTask(id)}
          onOpenVideoSheet={id => { setSheetVideo(id); setSheetRow(null); setView('sheet') }}
          onView={v => setView(v)}
          api={sheetApi}
        />
        {taskPanel}
      </>
    )
  }

  if (view === 'sheet') {
    return (
      <>
        <VideoSheet
          tasks={tasks}
          me={currentUser}
          members={members}
          contentTypes={contentTypes}
          hasStorage={hasStorage}
          videoId={sheetVideo}
          highlightId={sheetRow}
          onOpenVideo={id => { setSheetVideo(id); setSheetRow(null) }}
          onOpenTask={(id, opts) => { setPreviewFor(opts?.previewId ? { taskId: id, previewId: opts.previewId } : null); selectTask(id) }}
          onView={v => setView(v)}
          api={sheetApi}
        />
        {taskPanel}
      </>
    )
  }

  return (
    <div
      className={selected.size > 0 ? 'fx-board-selecting' : undefined}
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        gap: 22, paddingBottom: selected.size > 0 ? 90 : 30, background: '#FFFFFF',
      }}
    >
      {/* Greeting header — Pipeline handoff §4. */}
      <div className="fx-board-head" style={{
        padding: '24px 26px 0 38px', flexShrink: 0, display: 'flex',
        alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 44,
              lineHeight: 1, color: PIPE.ink,
            }}>
              {greeting}, {currentUser.name.split(' ')[0]}
            </span>
            <span aria-hidden="true" style={{ fontSize: 26 }}>👋</span>
          </div>
          <svg width="222" height="12" viewBox="0 0 222 12" fill="none" aria-hidden="true"
               style={{ display: 'block', margin: '2px 0 0 2px' }}>
            <path d="M4 8C50 3 160 2 218 6" stroke={PIPE.purpleStroke} strokeWidth="3.2" strokeLinecap="round" />
          </svg>
          <div style={{ marginTop: 6, fontWeight: 500, fontSize: 14.5, color: PIPE.textSecondary }}>
            Let&apos;s create, ship and move the needle.
          </div>
        </div>

        {/* Search, bell, upstream toggle, identity, New task. On a desktop
            this is one line; wrapped onto a 390px screen each part took a row
            of its own and the board started 370px down the page. The classes
            let globals.css pair them up and drop the identity chip, which the
            More tab already carries. */}
        <div className="fx-board-tools" style={{ display: 'flex', alignItems: 'center', gap: 18, paddingTop: 6, flexWrap: 'wrap' }}>
          <ViewSwitch view={view} onView={setView} />
          <div className="fx-board-search" style={{ position: 'relative' }}>
            <input
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search tasks, campaigns, assets..."
              aria-label="Search tasks"
              style={{
                width: 362, maxWidth: '100%', height: 46, boxSizing: 'border-box',
                border: `1px solid ${PIPE.borderInput}`, borderRadius: 999,
                background: '#FFFFFF', padding: '0 12px 0 44px',
                fontSize: 13.5, fontWeight: 500, color: PIPE.textPrimary,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={PIPE.textFaint}
                 strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"
                 style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          {/* The Inbox (spec 006): what needs you, behind one button. It
              replaced the bell and the "for you" cards above the pipeline. */}
          <InboxButton
            ref={inboxBtn}
            counts={model.counts}
            ringKeys={model.ringKeys}
            open={panelShown}
            onToggle={() => (panelShown ? closeInbox() : openInbox())}
          />

          <div className="fx-board-ident" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

            <span style={{
              width: 42, height: 42, borderRadius: '50%', boxSizing: 'border-box',
              border: '2.5px solid #A855F7', background: avatarColor(currentUser.name),
              color: '#FFF', fontWeight: 700, fontSize: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} aria-hidden="true">
              {initials(currentUser.name)}
            </span>
            <span style={{ lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: PIPE.ink }}>
                {currentUser.name}
              </span>
              <span style={{ display: 'block', fontWeight: 500, fontSize: 12, color: PIPE.textFaint }}>
                {currentUser.access === 'admin' ? 'Admin' : currentUser.role}
              </span>
            </span>
          </div>

          {currentUser.access !== 'user' && (
            <button
              onClick={() => setShowTaskForm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, height: 46,
                padding: '0 18px', borderRadius: 999, border: 'none',
                background: PIPE.limeCta, color: PIPE.ink,
                fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New task
            </button>
          )}
        </div>
      </div>

      {/* Your week: off by default, turned on in the View menu (FR-002). */}
      {inbox.showWeek && <HeroCards tasks={liveTasks} today={today} />}

      {/* Pinned, the Inbox sits beside the board (FR-060); the board narrows. */}
      <div className={inbox.pinned ? 'fx-board-split' : 'fx-board-main'}>
      <div className="fx-board-area">
      <BoardFilters
        filters={filters}
        onChange={setFilters}
        tasks={liveTasks}
        brands={brands}
        members={members}
        shown={filteredTasks.length}
        total={scopedTasks.length}
        scope={scope}
        onScope={chooseScope}
        trailing={
          <ViewMenu
            showWeek={inbox.showWeek}
            onShowWeek={v => void savePrefs({ showWeek: v })}
            upstream={showUpstream}
            onUpstream={setUpstream}
          />
        }
      />


      {/* PIPELINE heading — handoff §7. Caveat, with the hand-drawn ticks and
          underline that carry the rest of the design's voice. */}
      <div style={{ padding: '0 26px 0 38px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 2l2.1 6.1L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-1.9L12 2z"
                  fill={PIPE.limePrimary} stroke={PIPE.ink} strokeWidth="1.3" strokeLinejoin="round" />
          </svg>
          <h1 style={{
            fontFamily: 'var(--font-accent)', fontWeight: 700, fontSize: 30,
            letterSpacing: '0.04em', color: PIPE.ink, lineHeight: 1, margin: 0,
          }}>
            PIPELINE
          </h1>
          <svg width="26" height="22" viewBox="0 0 26 22" fill="none" aria-hidden="true">
            <path d="M3 18L8 4M14 17l5-12" stroke={PIPE.purpleStroke} strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
        <svg width="148" height="9" viewBox="0 0 148 9" fill="none" aria-hidden="true"
             style={{ display: 'block', margin: '2px 0 0 32px' }}>
          <path d="M3 6C34 2 100 1.6 145 4.2" stroke={PIPE.purpleStroke} strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </div>

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

      {panelShown && (
        <InboxPanel
          model={model}
          me={currentUser}
          members={members}
          now={now}
          api={inboxApi}
          tab={inboxTab}
          onTab={setInboxTab}
          pinned={inbox.pinned}
          onPin={() => {
            if (inbox.pinned) closeInbox()
            else { setInboxOpen(true); void savePrefs({ pinned: true }) }
          }}
          onClose={closeInbox}
          buttonRef={inboxBtn}
        />
      )}
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
      {showTaskForm && (
        <TaskForm
          currentUser={currentUser}
          brands={brands}
          contentTypes={contentTypes}
          members={members}
        />
      )}
    </div>
  )
}

/** Board | Sheet (spec 008 FR-002). The sheet's own toolbar carries the same switch. */
function ViewSwitch({ view, onView }: { view: BoardView; onView(v: BoardView): void }) {
  const t = useTranslations('sheet')
  return (
    <div className="fx-sheet-seg" role="group" aria-label={t('view.label')} data-view-switch="">
      <button type="button" aria-pressed={view === 'board'} onClick={() => onView('board')}>{t('view.board')}</button>
      <button type="button" aria-pressed={view === 'sheet'} onClick={() => onView('sheet')}>{t('view.sheet')}</button>
      <button type="button" aria-pressed={view === 'content'} onClick={() => onView('content')}>{t('view.content')}</button>
    </div>
  )
}
