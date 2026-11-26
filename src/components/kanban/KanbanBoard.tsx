'use client'

import { CardEditProvider } from '@/components/fields/CardEditor'
import { setTaskTags } from '@/actions/tags'
import { sendOrQueue } from '@/lib/save-queue'
import { mayCreateIn } from '@/lib/space-settings'
import { BrandGroupProvider } from '@/components/spaces/brandGroup'
import { useMineScope } from '@/components/views/mine-scope'
import { spaceSheetId } from '@/lib/sheet-columns'
import { AddLabelProvider } from '@/components/spaces/addLabel'
import { newTaskLabel, rangeOf, typesForSpace } from '@/lib/space-settings'
import { createTask } from '@/actions/tasks'
import { useState, useMemo, useEffect, useRef, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay,
  MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, Brand, ContentType, TaskComment, TaskAttachment, StageId, BoardView, MoveTaskResult, ContentTheme, InboxState, InboxTab, SheetColumnRecord, SheetValues, SheetId, TeamSpace, SpaceMember, TaskSpace as TaskSpaceRow, SpaceStage, TaskSpaceStage } from '@/types/index'
import { useSpaceStages } from '@/components/spaces/useSpaceStages'
import { setWorkWeekend } from '@/lib/utils'
import { STAGE_META, ALL_STAGES, NINE_STAGE, EIGHT_STAGE, UPSTREAM_STAGES, startsDownstream } from '@/lib/stage-meta'
import { inboxModel, openingTab } from '@/lib/inbox'
import {
  setTaskStage, addComment, bulkUpdateTasks, bulkDeleteTasks, updateTask, updateClip, addClips, addLinkAttachment, dropClip, restoreClip, addVideo, removeAttachment,
} from '@/actions/tasks'
import { writeClipField } from '@/actions/sheet-links'
import { PIPE } from '@/lib/pipeline-tokens'
import { useLocale, useTranslations } from 'next-intl'
import { ContentSheet } from '@/components/content/ContentSheet'
import type { ContentApi } from '@/components/content/types'
import { setLinkedRowHeights } from '@/actions/sheets'
import { addPlan, addPiece, updatePiece, setPieceLink, addTheme, saveTheme, savePillar, removePillar } from '@/actions/content'
import * as contentRows from '@/actions/content-rows'
import * as sheetTabs from '@/actions/sheet-tabs'
import { createPortal } from 'react-dom'
import { useSheetBar } from '@/components/views/view-chrome'
import { SheetBarSearch, SheetBarMine } from '@/components/views/SheetBarControls'
import { TAB_ROWS_ID } from '@/components/content/rows'
import { tabSheetId } from '@/lib/tab-rows'
/** Spec 027: the "no theme" group of an added tab stands for no project. */
const noTheme = (id: string | null | undefined) => (!id || id === TAB_ROWS_ID ? null : id)
import { makeUploader } from '@/lib/attachment-upload'
import { useUIStore } from '@/store/useUIStore'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import {
  FiltersButton, applyBoardFilters, activeFilterCount, filtersFromParams, writeFiltersToUrl,
  type BoardFilterState,
} from './BoardFilters'
import { BoardHeader } from '@/components/board/BoardHeader'
import { BoardToolbar } from '@/components/board/BoardToolbar'
import { ListView } from '@/components/views/ListView'
import { setBoardSort } from '@/actions/views'
import { defaultAssigneeFor } from '@/lib/spaces'
import { isLinkedMedia } from '@/lib/media'
import { MediaIndexContext, MediaPanelSection, buildMediaIndex } from '@/components/media/MediaLinks'
import { SortMenu, sortTasks, DEFAULT_SORT, SORT_KEYS, type SortKey } from '@/components/board/SortMenu'
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
import { featureOnAny } from '@/lib/brand-features'
import { BulkBar, type BulkPatch } from './BulkBar'
import { TaskLinkNames, TaskLinksSection, linkNamesByTask, taskLinkFields } from './TaskLinks'
import { TaskForm } from '@/components/shared/TaskForm'
import { handoffRequest } from '@/components/handoff/request'
import { useMoveError } from '@/components/fields/moveErrors'
import { CardFieldsProvider, useCardFields } from '@/components/fields/CardFields'

type FullTask = Task & {
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
  attachments?: TaskAttachment[]
}

interface KanbanBoardProps {
  /** Spec 023: custom fields for cards (the field library, attachments, values). */
  taskFields?: import('@/types/index').TaskFieldDef[]
  typeFields?: import('@/types/index').TaskTypeFieldLink[]
  fieldValues?: import('@/types/index').TaskFieldValueRow[]
  tags?: import('@/types/index').Tag[]
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
  surface?: 'board' | 'sheets' | 'view'
  /** With surface 'sheets': the Content sheet or the video sheet. With 'view': the view to start on. */
  sheetsView?: 'content' | 'sheet' | 'board'
  /**
   * Spec 021: with surface 'view' (a team Space, a brand, My tasks), only the
   * tasks this returns true for are on the Board. The page around it draws its
   * own header; the toolbar, columns, drag, bulk and the task panel are the
   * Board's own, so every move keeps the same rules (FR-011, FR-013a).
   */
  scopeTasks?: (t: Task) => boolean
  /** Spec 021: "+ Task" from a Space adds it to that Space (FR-028). */
  spaceId?: string
  /**
   * Spec 021 (research R6): a brand's Sheet is today's Content and Video
   * sheets with only that brand's rows — same columns, words and formats.
   */
  sheetScope?: (t: Task) => boolean
  themeScope?: (theme: ContentTheme) => boolean
  /** The one brand this sheet is narrowed to (a Space › Brand folder, a brand's page): new themes take it. */
  sheetBrandId?: string | null
  /** QA 26 Nov 2026 (F04): the brand new tasks start with (else the sheet's brand). */
  defaultBrandId?: string | null
  /** Fields (25 Nov 2026): custom fields promoted to Standard, and this person's own sheet columns per view. */
  standardFields?: string[]
  myLayouts?: Record<string, import('@/lib/sheet-columns').PersonalLayout>
  /** Spec 021: live team Spaces, their members, and Shows in rows. */
  spaces?: TeamSpace[]
  spaceMembers?: SpaceMember[]
  taskSpaces?: TaskSpaceRow[]
  /** Spec 013: the linked sheets' saved row heights, by task id. */
  linkedRowHeights?: { content: Record<string, number>; video: Record<string, number> }
  /** Sheet 2b: the Content sheet's rows. */
  contentRows?: import('@/lib/content-rows').ContentRowRec[]
  /** Spec 027 (US3): added tabs' themes and rows (every tab's), and the tab this sheet shows, if one. */
  tabThemes?: ContentTheme[]
  tabRows?: import('@/lib/content-rows').ContentRowRec[]
  tabSheet?: { id: string; linked: boolean; spaceId?: string | null } | null
  /** Spec 027: a Brand page's Board tab — the brand's tasks from every Space, grouped by theme. */
  brandBoard?: boolean
  /** A saved view narrows this sheet's tasks: rows whose task it leaves out hide too. */
  narrowed?: boolean
  /** Spec 021: the workspace's C-Check default, for a new task's stage line. */
  workspaceNineStage?: boolean
  /** The due-date rule (Settings › Due Dates). */
  dueRule?: import('@/lib/due-dates').DueRule
  /** Which board this is, for the member's saved sort ('board', 'space:<id>', 'brand:<id>', 'me'). */
  boardKey?: string
  /** The member's saved sort per board. */
  boardSorts?: Record<string, string>
  /** Spec 022 (US4): Space stages and tasks' sub-stages. */
  spaceStages?: SpaceStage[]
  taskSpaceStages?: TaskSpaceStage[]
}

const NO_INBOX: InboxState = { readIds: [], snoozes: {}, since: new Date(0).toISOString(), pinned: false, showWeek: false }

export function KanbanBoard(props: KanbanBoardProps) {
  const names = useMemo(() => new Map(props.initialTasks.map(x => [x.id, x.name])), [props.initialTasks])
  // Spec 024 (§3): inside a Space, its sheets' add rows use the Space's "New task label".
  const wrapLocale = useLocale()
  const wrapSpace = props.spaceId ? props.spaces?.find(x => x.id === props.spaceId) : undefined
  const sheetAddLabel = wrapSpace ? newTaskLabel(wrapSpace.settings, wrapLocale, '') || null : null
  return (
    <AddLabelProvider value={sheetAddLabel}>
    <CardFieldsProvider fields={props.taskFields} links={props.typeFields} values={props.fieldValues} types={props.contentTypes} members={props.members} taskName={id => names.get(id)} tags={props.tags} spaces={props.spaces} viewSpaceId={props.spaceId ?? null} promoted={props.standardFields} themes={props.themes}>
      <CardEditProvider brands={props.brands ?? []}>
        <KanbanBoardInner {...props} />
      </CardEditProvider>
    </CardFieldsProvider>
    </AddLabelProvider>
  )
}

function KanbanBoardInner({
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
  contentRows: contentRows_,
  tabThemes = [],
  tabRows = [],
  tabSheet = null,
  brandBoard = false,
  narrowed = false,
  scopeTasks,
  spaceId,
  sheetScope,
  themeScope,
  sheetBrandId = null,
  defaultBrandId = null,
  standardFields = [],
  myLayouts = {},
  taskFields: libraryFields = [],
  spaces = [],
  spaceMembers = [],
  taskSpaces = [],
  workspaceNineStage = false,
  dueRule,
  boardKey,
  boardSorts,
  spaceStages = [],
  taskSpaceStages = [],
}: KanbanBoardProps) {
  // Spec 022 (US6): SLA days count the Settings weekend.
  setWorkWeekend(dueRule?.weekend)
  const embedded = surface === 'sheets'
  /** Spec 021: hosted by a Space, brand or My tasks page, which owns the header and the address. */
  const hosted = surface === 'view'
  const [tasks, setTasks]         = useState<FullTask[]>(initialTasks)
  // Spec 022 (US4): a Space's Board shows its own stages; the Content and Video sheets read their Spaces'.
  const ss = useSpaceStages(hosted && spaceId ? spaceId : null, spaceStages, taskSpaceStages)
  const spaceStageCols = !!ss?.own
  // Spec 026: the Space whose sheet is shown — the page's Space, else the Content Space.
  // (Outside a Space, the board's "Sheet" is the Video Space's sheet and "Content" the Content Space's.)
  const pageSheetSpace = (spaceId ? spaces.find(x => x.id === spaceId) : undefined) ?? spaces.find(x => x.key === 'content')
  const contentStages = useSpaceStages(pageSheetSpace?.id ?? null, spaceStages, taskSpaceStages)
  const sheetSpaceRef = useRef<string | null>(pageSheetSpace?.id ?? null)
  const videoStages = useSpaceStages(spaces.find(x => x.key === 'video')?.id ?? null, spaceStages, taskSpaceStages)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<StageId | null>(null)
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
  // QA 26 Nov 2026 (QF-13): choice fields (Channels…) filter by their values.
  const cardFieldCtx = useCardFields()
  useEffect(() => { setThemes(initialThemes) }, [initialThemes])


  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask     = useUIStore(s => s.selectTask)
  const showTaskForm   = useUIStore(s => s.showTaskForm)
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
  const setCelebration = useUIStore(s => s.setCelebration)
  const openHandoff    = useUIStore(s => s.openHandoff)
  const tSpaces        = useTranslations('spaces')
  const tMedia         = useTranslations('media')
  const moveErr        = useMoveError()
  const tSheet         = useTranslations('taskSheet')
  const tViews         = useTranslations('views')
  const tHandoff       = useTranslations('handoff')
  const searchParams   = useSearchParams()

  /**
   * Board filters live in the address too (?q=, &brand=, &assignee=, &due=…),
   * so a filtered board can be linked to and survives a reload. Read once
   * here; written below with the history API like ?view and ?task. Inside a
   * Sheets folder the address is the folder's, so they stay local there.
   */
  /** Spec 027 (US2): the page this board is on (a Space or brand), for the choices its views share. */
  const pageKey = boardKey ?? spaceId ?? null
  // Simple sheet header (25 Nov 2026): the workbook's toolbar row, where this sheet's Search, Filters and Mine go.
  const sheetBar = useSheetBar()
  const [filters, setFilters] = useState<BoardFilterState>(() =>
    filtersFromParams(surface === 'sheets' ? new URLSearchParams() : searchParams))

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
    if (embedded || hosted) return sheetsView
    const v = searchParams.get('view')
    return v === 'sheet' || v === 'content' ? v : 'board'
  })
  // The Pipeline tab returns to the pipeline view last shown (spec 011 R10).
  const [lastPipelineView, setLastPipelineView] = useState<'board' | 'sheet'>(() =>
    searchParams.get('view') === 'sheet' ? 'sheet' : 'board')
  // Spec 027 (US1): a Space page's Board shows its cards or a compact list of the same tasks (remembered here).
  const layoutKey = `momentum.board.layout.${boardKey ?? spaceId ?? 'board'}`
  // Owner, 26 Nov 2026: the Cards | List pair is gone, so a board always shows its cards (a List view is added from + View).
  const boardLayout = 'cards' as 'cards' | 'list'
  const chooseLayout = (l: 'cards' | 'list') => { void l; void layoutKey }
  // Inside a Sheets folder, "Board" leaves for the board itself.
  const setView = (v: BoardView) => { if (embedded && v === 'board') router.push('/board'); else setViewState(v) }
  useEffect(() => { if (view !== 'content') setLastPipelineView(view) }, [view])
  const [sheetVideo, setSheetVideo] = useState<string | null>(() => searchParams.get('video'))
  const [sheetRow, setSheetRow] = useState<string | null>(() => searchParams.get('row'))
  useEffect(() => {
    if (embedded || hosted) return
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
  // Spec 027 (US2): the page's Board filters are kept per page on this device, so the Board view and the
  // sheet's Board tab filter the same way.
  const filtersKey = pageKey ? `momentum.filters.${pageKey}` : null
  const filtersLoaded = useRef(false)
  useEffect(() => {
    if (!filtersKey) return
    if (!filtersLoaded.current) {
      filtersLoaded.current = true
      try {
        const stored = window.localStorage.getItem(filtersKey)
        const fromUrl = !embedded && activeFilterCount(filtersFromParams(searchParams)) > 0
        if (stored && !fromUrl) { setFilters(filtersFromParams(new URLSearchParams(stored))); return }
      } catch { /* private mode */ }
    }
    try { const u = new URL('http://x/'); writeFiltersToUrl(u, filters); window.localStorage.setItem(filtersKey, u.search.slice(1)) } catch { /* private mode */ }
  }, [filters, filtersKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // replaceState, not pushState: a filter is a refinement of this page, not
  // a place to go Back to. Typing in search is debounced, and the write is
  // guarded, because Safari throws once a page replaces its history too often.
  useEffect(() => {
    if (embedded) return
    const id = window.setTimeout(() => {
      const url = new URL(window.location.href)
      if (!writeFiltersToUrl(url, filters)) return
      try { window.history.replaceState(null, '', url) } catch { /* rate-limited; the next change writes it */ }
    }, 250)
    return () => window.clearTimeout(id)
  }, [filters, embedded])
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

  // Back can land on an entry written with other filters (a task opened, the
  // filters changed, then Back), so they are read again along with ?task.
  useEffect(() => {
    function onPop() {
      const params = new URL(window.location.href).searchParams
      selectTask(params.get('task'))
      if (!embedded) setFilters(filtersFromParams(params))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [selectTask, embedded])

  // Mouse and touch apart, so each gets the start it needs: a mouse drags
  // after 5px of travel; a finger has to press and hold first, so a swipe
  // that starts on a full-width card (the phone's stacked board) scrolls the
  // page instead of picking the card up.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Space picks a card up and drops it; Enter is kept for opening the task.
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
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
  // Spec 021: a hosted Board (a Space, a brand) starts on Everyone — the page
  // is already the narrowing — and remembers its own choice apart from /board.
  // Spec 027 (US2): a Space or brand page's Board view and its sheet's Board tab share one choice.
  const scopeKey = pageKey ? `momentum.scope.${pageKey}` : hosted ? 'momentum.view.scope' : 'momentum.board.scope'
  // QA 26 Nov 2026 (F13): group a column's cards by brand (Display options), remembered per page.
  const byBrandKey = `momentum.byBrand.${pageKey ?? 'board'}`
  const [byBrand, setByBrand] = useState(false)
  useEffect(() => { try { setByBrand(window.localStorage.getItem(byBrandKey) === '1') } catch { /* private mode */ } }, [byBrandKey])
  const chooseByBrand = (v: boolean) => { setByBrand(v); try { window.localStorage.setItem(byBrandKey, v ? '1' : '0') } catch { /* private mode */ } }
  // QA 26 Nov 2026 (F12): the same Mine as the page's List and Calendar views (useMineScope).
  const [scope, chooseScope] = useMineScope(scopeKey, hosted || pageKey ? 'team' : 'me')

  /**
   * How a column orders its own cards (spec: multiple sort options,
   * user-selectable). Read after mount and remembered per browser, the same
   * way as `scope` above — the server's own default order already matches
   * 'due', so there is no first-paint flash while this settles.
   */
  // Saved per person per board, on the server, so it follows them across sessions and devices.
  const board = boardKey ?? (spaceId ? `space:${spaceId}` : 'board')
  const savedSort = boardSorts?.[board]
  // Spec 024 (§5): a Space's default sort, until the member picks their own.
  const spaceSort = spaceId ? spaces.find(x => x.id === spaceId)?.settings.views.sort : undefined
  const [sortBy, setSortBy] = useState<SortKey>(savedSort && (SORT_KEYS as string[]).includes(savedSort) ? savedSort as SortKey : spaceSort ?? DEFAULT_SORT)
  function chooseSort(next: SortKey) {
    setSortBy(next)
    void setBoardSort(board, next === DEFAULT_SORT ? null : next)
  }
  function resetSort() {
    setSortBy(DEFAULT_SORT)
    void setBoardSort(board, null)
  }

  /**
   * Dropped clips (spec 008 FR-060) leave the board, the metrics, the alerts,
   * the bell and bulk actions. Split once, here; only the video sheet reads
   * `tasks` with them in.
   */
  const liveTasks = useMemo(
    // Spec 022: on Everything (no scope), linked media tasks show through their content task.
    () => tasks.filter(t => !t.dropped_at && (scopeTasks ? scopeTasks(t) : !isLinkedMedia(t))),
    [tasks, scopeTasks],
  )

  // QA 26 Nov 2026 (F13): how many brands the page's tasks span (group by brand needs two or more).
  const brandsInView = useMemo(() => new Set(liveTasks.map(t => t.brand_id).filter(Boolean)).size, [liveTasks])
  const scopedTasks = useMemo(
    () => (scope === 'me'
      ? liveTasks.filter(t => (t.assignee_id ?? t.task_owner_id) === currentUser.id || !!t.assignee_ids?.includes(currentUser.id))
      : liveTasks),
    [liveTasks, scope, currentUser.id],
  )

  const filteredTasks = useMemo(
    () => applyBoardFilters(scopedTasks, filters, {
      valueOf: (tid, fid) => cardFieldCtx?.values.get(tid)?.get(fid),
      currentUserId: currentUser.id, slaConfig, today,
    }),
    [scopedTasks, filters, currentUser.id, slaConfig, today, cardFieldCtx],
  )

  const tasksByStage = useMemo(() => {
    const map: Record<string, FullTask[]> = {}
    ALL_STAGES.forEach(s => { map[s] = [] })
    sortTasks(filteredTasks, sortBy).forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [filteredTasks, sortBy])

  const tasksByEntry = useMemo(() => {
    const map: Record<string, FullTask[]> = {}
    if (!ss) return map
    ss.entries.forEach(e => { map[e.id] = [] })
    sortTasks(filteredTasks, sortBy).forEach(t => { const e = ss.of(t); if (e && map[e.id]) map[e.id].push(t) })
    return map
  }, [filteredTasks, sortBy, ss]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string)
  }

  /** A drop lands either on a column (its stage id) or on a card in one. */
  function stageOfDropTarget(overId: string): StageId | null {
    if (overId.startsWith('ss:')) return (ss?.entries.find(e => `ss:${e.id}` === overId)?.stage_id as StageId) ?? null
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

    // Spec 022 (US4): a Space stage column. Within one original stage it's a sub-stage move
    // (only this Space changes); to another stage it's a real move, then its sub-stage.
    if (spaceStageCols && ss) {
      const overId = over.id as string
      const entry = overId.startsWith('ss:') ? ss.entries.find(e => `ss:${e.id}` === overId) : ss.of(tasks.find(t => t.id === overId) ?? dragged)
      if (entry && toStage === fromStage) {
        if (ss.of(dragged)?.id !== entry.id) void ss.sub(dragged, entry).then(err => { if (err) setDragError(tSpaces('stages.otherStage')) })
        return
      }
      if (entry && entry.position > 0) {
        const path = dragged.nine_stage ? NINE_STAGE : EIGHT_STAGE
        if (!path.includes(toStage)) { setDragError(`${STAGE_META[toStage].label_en} isn't part of this task's pipeline`); return }
        setDragError('')
        startTransition(async () => {
          const res = await moveTo(dragged, toStage)
          if (res.success) await ss.sub({ ...dragged, status: toStage }, entry)
          else if (res.error !== 'needs_handoff') setDragError(moveErr(res) ?? 'Could not move that task')
        })
        return
      }
    }

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
      // Spec 021: a hand-off opens its box instead of an error.
      if (!res.success && res.error !== 'needs_handoff') {
        setDragError(
          res.error === 'not_authorized'
            ? `Only ${STAGE_META[fromStage].owner_role ?? 'the task owner'} can move this out of ${STAGE_META[fromStage].label_en}`
            : moveErr(res) ?? 'Could not move that task. Try again, or reload the board if it keeps happening.',
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
      // Spec 021 (FR-030): drag, Inbox and sheet cells all land here — the box
      // opens for the task, and the card/cell stays where it was until confirmed.
      const req = handoffRequest(res, task, spaces, taskSpaces, members, tSpaces)
      if (req) openHandoff(req)
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
  const columnsBundle: ColumnsBundle = {
    records: colRecords, values: colValues, api: columnsApi,
    // Spec 021: Task link fields on the Content and Video sheets.
    taskLinks: {
      tasks, spaces, brands, me: currentUser, workspaceNineStage, spaceStages,
      openTask: id => selectTask(id), onCreated: () => router.refresh(), create: createTask,
    },
  }

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
      // QA 26 Nov 2026 (F07, F09): kept and sent again when offline; refused when someone changed it meanwhile.
      const base: NonNullable<Parameters<typeof updateTask>[1]['base']> = {}
      if (patch.name !== undefined) base.name = before.name
      if (patch.content_type_label !== undefined) base.content_type_label = before.content_type_label ?? null
      if (patch.assignee_id !== undefined) base.assignee_id = before.assignee_id ?? null
      const res = await sendOrQueue(() => updateTask(taskId, { ...patch, base })).catch(() => ({ success: false, error: 'generic' }))
      if (!res.success) { patchTask(taskId, { name: before.name, content_type_label: before.content_type_label, assignee_id: before.assignee_id, assignee: before.assignee }); if (res.error === 'changed_meanwhile') router.refresh() }
      else if (!('queued' in res)) router.refresh()
      return res
    },
    // Owner, 26 Nov 2026: a task's tags, set from the sheet's Tags column.
    async setTags(taskId, tagIds) {
      const before = tasks.find(t => t.id === taskId)
      patchTask(taskId, { tag_ids: tagIds })
      const res = await setTaskTags(taskId, tagIds).catch(() => ({ success: false as const, error: 'generic' }))
      if (!res.success) patchTask(taskId, { tag_ids: before?.tag_ids ?? [] }); else router.refresh()
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
          id: c.id, name: c.name, parent_task_id: null, parent: undefined,
          content_type_label: 'Reel', status: 'todo' as StageId, stage_date: now.slice(0, 10),
          task_owner_id: currentUser.id, task_owner: currentUser, assignee_id: null, assignee: undefined,
          due_date: null, priority: 'Normal' as const, created_at: now, updated_at: now,
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
    // The Video sheet's board-linked columns and "+ Video" (design/video-sheet-v5.html):
    // saved by the server with the board's rules, then the board reloads its tasks.
    async writeField(taskId, field, value) {
      const res = await writeClipField(taskId, field, value).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success) router.refresh()
      return res
    },
    async bulkUpdate(ids, patch) {
      const res = await bulkUpdateTasks(ids, patch).catch(() => ({ success: false, changed: 0, refused: 0, error: 'generic' }))
      if (res.changed > 0) router.refresh()
      return res
    },
    removeFile(taskId, attachmentId) {
      const task = tasks.find(t => t.id === taskId)
      const gone = task?.attachments?.find(a => a.id === attachmentId)
      if (!task || !gone) return null
      setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, attachments: (t.attachments ?? []).filter(a => a.id !== attachmentId) } : t)))
      const back = () => setTasks(prev => prev.map(t => (t.id === taskId && !(t.attachments ?? []).some(a => a.id === attachmentId)
        ? { ...t, attachments: [...(t.attachments ?? []), gone] } : t)))
      return {
        undo: back,
        async commit() {
          const res = await removeAttachment(attachmentId).catch(() => ({ success: false as const, error: 'generic' }))
          if (!res.success) back(); else router.refresh()
          return res
        },
      }
    },
    async addVideo(name) {
      const res = await addVideo(name).catch(() => ({ success: false as const, error: 'generic' }))
      if (res.success && res.id) {
        const now = new Date().toISOString()
        const base = tasks[0]
        if (base) setTasks(prev => [{
          ...base, id: res.id!, name: name.trim(), parent_task_id: null, parent: undefined, project_id: null, pillar_id: null,
          content_type_label: 'Video', status: 'todo' as StageId, stage_date: now.slice(0, 10), due_date: null, priority: 'Normal' as const,
          task_owner_id: currentUser.id, task_owner: currentUser, assignee_id: currentUser.id, assignee: currentUser,
          created_at: now, updated_at: now, comments: [], subtasks: [], attachments: [], published_url: null, post_url: null, dropped_at: null, clip: null,
          cover_image_url: undefined, cover_thumb: undefined,
        }, ...prev])
        router.refresh()
      }
      return res
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
      // Spec 027: pasted into an added tab, the lines are the tab's rows (tasks when it is linked).
      if (tabSheet) {
        const t = opts.target ? { projectId: noTheme(opts.target.projectId), pillarId: opts.target.pillarId ?? null } : null
        const r = await sheetTabs.pasteTabRows(tabSheet.id, t, rows.map(x => ({ title: x.title, theme: x.theme, pillar: x.pillar, custom: x.custom }))).catch(() => ({ success: false as const, error: 'generic' }))
        if (r.success) router.refresh()
        return r.success ? { success: true, rowsCreated: r.rowsCreated, created: r.created } : r
      }
      const res = await addPlan(rows, { ...opts, spaceId: sheetSpaceRef.current }).catch(() => ({ success: false as const, error: 'generic' }))
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
            due_date: null, priority: 'Normal' as const, created_at: now, updated_at: now, comments: [], subtasks: [], attachments: [],
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
      if (!res.success) patchTask(taskId, { pillar_id: before.pillar_id, due_date: before.due_date, publish_date: before.publish_date, post_url: before.post_url, published_url: before.published_url })
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
    // ── sheet 2b: rows, themes and pillars (each refreshes the page's data) ──
    ...(() => {
      const fail = { success: false as const, error: 'generic' }
      const run = <A extends unknown[], R extends { success: boolean }>(fn: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
        // QA 26 Nov 2026 (F07): an edit made offline is kept and sent when the connection is back.
        const res = await sendOrQueue(() => fn(...a)).catch(() => fail as unknown as R) as R
        if (res.success && !('queued' in (res as object))) router.refresh()
        return res
      }
      return {
        // Spec 026: every call carries the Space whose sheet this is; spec 027: and the added tab, if it is one.
        addRow: run((input: Parameters<typeof contentRows.addRow>[0]) => contentRows.addRow({ ...input, projectId: noTheme(input.projectId), spaceId: sheetSpaceRef.current, sheetId: tabSheet?.id ?? null })),
        updateRow: run(contentRows.updateRow),
        moveRow: run((id: string, to: Parameters<typeof contentRows.moveRow>[1]) => contentRows.moveRow(id, { ...to, projectId: noTheme(to.projectId) })),
        indentRow: run(contentRows.indentRow), deleteRow: run(contentRows.deleteRow), rowToTask: run(contentRows.rowToTask),
        linkRowTask: run(contentRows.linkRowTask),
        // QA 26 Nov 2026 (F04): a row made into a task in a brand folder or on a Brand page takes that brand.
        makeTask: run((id: string, o: Parameters<typeof contentRows.makeTask>[1]) => contentRows.makeTask(id, { ...o, brandId: o?.brandId ?? sheetBrandId ?? null })), unlinkRow: run(contentRows.unlinkRow),
        reorderThemes: run((a: string, b: string, w: 'before' | 'after') => contentRows.reorderThemes(a, b, w, sheetSpaceRef.current, tabSheet?.id ?? null)),
        removeSheetTheme: run((a: string, d: { projectId: string; pillarId?: string | null } | null) => contentRows.removeSheetTheme(a, d ? { ...d, projectId: noTheme(d.projectId) } : d, sheetSpaceRef.current, tabSheet?.id ?? null)),
        addPillarAt: run((a: string, n: string, anchor?: { pillarId: string; where: 'above' | 'below' } | null) => contentRows.addPillarAt(a, n, anchor, sheetSpaceRef.current, tabSheet?.id ?? null)),
        reorderPillars: run((a: string, b: string, c: string, w: 'before' | 'after') => contentRows.reorderPillars(a, b, c, w, sheetSpaceRef.current, tabSheet?.id ?? null)),
        removePillarTo: run((a: string, d: { projectId: string; pillarId?: string | null } | null) => contentRows.removePillarTo(a, d, sheetSpaceRef.current, tabSheet?.id ?? null)),
        // A theme added in a Space › Brand folder, or on a brand's page, belongs to that brand.
        addSheetTheme: run((input: { name: string; anchor?: { projectId: string; where: 'above' | 'below' } | null }) => contentRows.addSheetTheme({ ...input, spaceId: sheetSpaceRef.current, brandId: sheetBrandId, sheetId: tabSheet?.id ?? null })),
        themeNames: () => contentRows.themeNames(sheetSpaceRef.current, sheetBrandId, tabSheet?.id ?? null).catch(() => []),
        ...(tabSheet ? {
          removeTabRow: run((id: string, mode: 'tab' | 'archive') => sheetTabs.removeTabRow(id, mode)),
          addExistingTasks: run((ids: string[]) => sheetTabs.addExistingTasks(tabSheet.id, ids)),
        } : {}),
      }
    })(),
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
  // User, 2026-11-23: a linked row's Status follows its task, so moves made elsewhere
  // show here without a reload — on focus, and every 30 seconds while visible and idle.
  useEffect(() => {
    const busy = () => { const a = document.activeElement as HTMLElement | null; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable) || !!document.querySelector('[role="dialog"], [role="listbox"], [role="menu"]') }
    const tick = () => { if (document.visibilityState === 'visible' && !busy()) router.refresh() }
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    window.addEventListener('focus', tick)
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(tick, 30_000)
    return () => { window.removeEventListener('focus', tick); document.removeEventListener('visibilitychange', onVisible); window.clearInterval(id) }
  }, [router])
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
  const boardLocale = useLocale()
  const isPhone = useIsPhone()
  useEffect(() => {
    const stored = window.localStorage.getItem('momentum.board.upstream')
    setShowUpstream(stored !== null ? stored === '1' : !startsDownstream(currentUser.role))
  }, [currentUser.role])
  function setUpstream(v: boolean) {
    setShowUpstream(v)
    try { window.localStorage.setItem('momentum.board.upstream', v ? '1' : '0') } catch { /* private mode */ }
  }
  // Spec 022: a media board's tasks start at Ready For Design, so it has no writing columns.
  // Spec 024 (§2): a Space's board shows the stages from its "Starts at" to its "Ends at".
  const viewSpace = hosted && spaceId ? spaces.find(x => x.id === spaceId) : undefined
  const stagesInScope = viewSpace
    ? rangeOf(viewSpace.settings.flow)
    : showUpstream
      ? ALL_STAGES
      : ALL_STAGES.filter(id => !(UPSTREAM_STAGES as string[]).includes(id))
  // QA 26 Nov 2026 (F15): the Space's own word for a new task; "New task" where there's no Space or none set.
  const addLabel = newTaskLabel(viewSpace?.settings, boardLocale, tSpaces('config.newLabelDefault'))

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
    fn: () => Promise<{ changed: number; refused: number; handoff?: number; error?: string }>,
    clearAfter = false,
  ) {
    setBulkBusy(true)
    setBulkNote('')
    startTransition(async () => {
      const res = await fn()
      setBulkBusy(false)
      if (res.error) { setBulkNote(res.error); return }
      setBulkNote([
        res.refused > 0 ? `${res.changed} changed · ${res.refused} not yours` : `${res.changed} changed`,
        // Spec 021 (FR-030a): bulk moves skip tasks that need a hand-off, and say so.
        res.handoff ? tHandoff('refused', { n: res.handoff }) : '',
      ].filter(Boolean).join(' · '))
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
      stageNameOf={hosted && spaceId && ss ? s => ss.stageName(s) : undefined}
      themes={themes}
      sectionOrder={viewSpace?.settings.section_order}
      currentUser={currentUser}
      stages={[]}
      slaConfig={slaConfig}
      today={today}
      dueDaysBefore={dueRule?.daysBefore}
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
      spaces={spaces}
      taskSpaces={taskSpaces}
      linksSection={<>
        <MediaPanelSection key={`m-${selectedTask.id}`} task={selectedTask as never} tasks={tasks as never} onOpenTask={id => selectTask(id)} />
        <TaskLinksSection key={selectedTask.id} taskId={selectedTask.id} brandId={selectedTask.brand_id}
          fields={taskLinkFields(colRecords, colValues, selectedTask.id)} ctx={columnsBundle.taskLinks!}
          set={async (columnId, value) => (await columnsApi.setValue(columnId, selectedTask.id, value)).success} />
      </>}
      onClose={() => { setPreviewFor(null); setCommentFor(null); setSectionFor(null); selectTask(null) }}
    />
  )

  // Spec 022: media links for the cards.
  const mediaIndex = useMemo(() => buildMediaIndex(tasks as never), [tasks])
  // Spec 021: each card's Task links, by name.
  const linkNames = useMemo(() => linkNamesByTask(colRecords, colValues, new Map(tasks.map(x => [x.id, x.name]))), [colRecords, colValues, tasks])

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
      canCreate
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
  // Spec 021: the creator's own pipeline Spaces, for "Show in" when not created from a Space.
  const mySpaces = spaces.filter(x => spaceMembers.some(r => r.space_id === x.id && r.member_id === currentUser.id))
  // QA 26 Nov 2026 (F27): Make task's "In Space" lists only Spaces you may create in, named in your language.
  const makeSpaces = spaces.filter(x => mayCreateIn(x.settings, currentUser, spaceMembers.filter(r => r.space_id === x.id).map(r => r.member_id)))
    .map(x => ({ id: x.id, name: (boardLocale === 'ar' && (x.settings as { name_ar?: string | null } | null)?.name_ar) || x.name }))
  // Spec 024 (§3): in a Space, the form offers its allowed task types, the default first.
  const formSpace = spaceId ? spaces.find(x => x.id === spaceId) : undefined
  const taskForm = showTaskForm && (
    <TaskForm
      currentUser={currentUser}
      brands={brands}
      contentTypes={typesForSpace(formSpace?.settings, contentTypes)}
      members={members}
      spaceId={spaceId ?? null}
      defaultBrandId={defaultBrandId ?? sheetBrandId}
      label={addLabel}
      spaceChoices={mySpaces.map(x => ({ id: x.id, name: x.name }))}
      spaceAssignees={Object.fromEntries(spaces.map(x => [x.id, defaultAssigneeFor(x, members, spaceMembers.filter(r => r.space_id === x.id).map(r => r.member_id))]))}
      dueRule={dueRule}
    />
  )

  // Spec 026: one sheet system. In a Space it is that Space's sheet; outside one, "Sheet" is the Video
  // Space's and "Content" the Content Space's. The old Video sheet (videos with clip details) is gone.
  const sheetSpace = tabSheet ? spaces.find(x => x.id === tabSheet.spaceId) ?? pageSheetSpace
    : brandBoard || spaceId ? pageSheetSpace : view === 'sheet' ? spaces.find(x => x.key === 'video') ?? pageSheetSpace : pageSheetSpace
  const sheetSpaceId = sheetSpace?.id ?? null
  sheetSpaceRef.current = sheetSpaceId
  if (view === 'content' || view === 'sheet') {
    // Spec 027 (US2): in a Space, the sheet's Board tab lists the board's tasks under the Board's own filter
    // (Mine / Everyone and Filters, shared with the Board view), and shows that filter bar above it.
    const boardTab = (!!spaceId || brandBoard) && !tabSheet
    const isMine = (t: FullTask) => (t.assignee_id ?? t.task_owner_id) === currentUser.id || !!t.assignee_ids?.includes(currentUser.id)
    const boardTasks = boardTab
      ? applyBoardFilters(tasks.filter(t => (scopeTasks ? scopeTasks(t) : true) && (scope !== 'me' || isMine(t))), filters, { currentUserId: currentUser.id, slaConfig, today, valueOf: (tid, fid) => cardFieldCtx?.values.get(tid)?.get(fid) })
      : undefined
    return (
      <div className={`fx-board-page is-sheet${embedded ? ' is-embedded' : ''}`}>
        {!embedded && !hosted && header}
        {sheetBar?.tools && createPortal(
          <span className="fx-sheetbar-own" data-board-tab-filters="">
            <SheetBarSearch value={filters.search} onChange={v => setFilters(f => ({ ...f, search: v }))} />
            {boardTab && <span className="fx-sheetbar-filters"><FiltersButton filters={filters} onChange={setFilters} tasks={liveTasks} members={members} /></span>}
            {boardTab && <SheetBarMine me={currentUser} on={scope === 'me'} onToggle={() => chooseScope(scope === 'me' ? 'team' : 'me')} />}
          </span>, sheetBar.tools)}
        {boardTab && !sheetBar && (
          <div className="fx-board-tab-bar" data-board-tab-filters="">
            <BoardToolbar
            me={currentUser}
              scope={scope} onScope={chooseScope} brands={brands}
              hideBrands={!!spaceId || !!boardKey?.startsWith('brand:')}
              brandIds={filters.brandIds} onBrandIds={ids => setFilters(f => ({ ...f, brandIds: ids }))}
              noProject={null}
              filters={<FiltersButton filters={filters} onChange={setFilters} tasks={liveTasks} members={members} themes={themes} />}
              sort={null} view="board" onView={() => {}} display={null} noViewPair />
          </div>
        )}
        <ContentSheet
          brands={brands}
          boardTasks={boardTasks}
          noThemeAdd={brandBoard && !tabSheet}
          boardFiltered={boardTab && (narrowed || scope === 'me' || activeFilterCount(filters) > 0)}
          // QA 26 Nov 2026 (QF-03): a Brand page shows the original stage names in every view, as its Board does.
          stages={brandBoard && !spaceId ? null : sheetSpace?.key === 'video' && !spaceId ? videoStages : contentStages}
          tasks={sheetScope ? tasks.filter(sheetScope) : tasks}
          themes={tabSheet
            ? tabThemes.filter(th => th.sheet_id === tabSheet.id)
            // A brand's Board tab: its themes from every Space's sheet, once each.
            : brandBoard
              ? [...new Map(themes.filter(th => th.brand_id === sheetBrandId || boardTasks?.some(t => t.project_id === th.id)).map(th => [th.id, th])).values()]
              : (themeScope ? themes.filter(themeScope) : themes).filter(th => !sheetSpaceId || !th.space_id || th.space_id === sheetSpaceId)}
          tab={tabSheet ?? undefined}
          me={currentUser}
          members={members}
          contentTypes={types}
          columns={columnsBundle}
          rowHeights={sheetSpace?.key === 'content' || !sheetSpace ? linkedRowHeights?.content : undefined}
          rows={tabSheet ? tabRows.filter(r => r.sheet_id === tabSheet.id) : brandBoard ? undefined : contentRows_?.filter(r => !sheetSpaceId || !r.space_id || r.space_id === sheetSpaceId)}
          sheet={tabSheet ? tabSheetId(tabSheet.id) : brandBoard && sheetBrandId ? `rows:brand:${sheetBrandId}` : sheetSpace ? spaceSheetId(sheetSpace) : 'content'}
          fieldSystem={{
            promoted: standardFields, layouts: myLayouts,
            viewKey: tabSheet ? tabSheetId(tabSheet.id) : brandBoard && sheetBrandId ? `rows:brand:${sheetBrandId}` : `${sheetSpace ? spaceSheetId(sheetSpace) : 'content'}${sheetBrandId ? `:${sheetBrandId}` : ''}`,
            space: sheetSpace ?? null, spaces, library: libraryFields,
          }}
          space={sheetSpace ?? null}
          spaces={spaces}
          makeSpaces={makeSpaces}
          taskSpaces={taskSpaces}
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

  // The one brand selected, if exactly one: how much of its work has no project.
  const noProject = filters.brandIds.length === 1
    ? liveTasks.filter(t => t.brand_id === filters.brandIds[0] && !t.project_id).length
    : null

  return (
    <TaskLinkNames.Provider value={linkNames}>
    <MediaIndexContext.Provider value={mediaIndex}>
    <div
      className={selected.size > 0 ? 'fx-board-selecting' : undefined}
      style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        gap: 22, paddingBottom: selected.size > 0 ? 90 : 30, background: '#FFFFFF',
      }}
    >
      <div className="fx-hd-wrap">
        {!hosted && header}
        <BoardToolbar
            me={currentUser}
          scope={scope}
          onScope={chooseScope}
          brands={brands}
          hideBrands={hosted && (!!spaceId || !!boardKey?.startsWith('brand:'))}
          brandIds={filters.brandIds}
          onBrandIds={ids => setFilters(f => ({ ...f, brandIds: ids }))}
          noProject={noProject}
          filters={<FiltersButton filters={filters} onChange={setFilters} tasks={liveTasks} members={members} themes={themes} />}
          sort={<SortMenu value={sortBy} onChange={chooseSort} onReset={resetSort} noPriority={!featureOnAny(liveTasks.map(x => x.brand), 'priorities')} />}
          view={hosted && boardLayout === 'list' ? 'sheet' : 'board'}
          onView={v => (hosted ? chooseLayout(v === 'sheet' ? 'list' : 'cards') : setView(v))}
          layoutToggle={hosted}
          display={
            <ViewMenu
              showWeek={inbox.showWeek}
              onShowWeek={v => void savePrefs({ showWeek: v })}
              upstream={showUpstream}
              onUpstream={setUpstream}
              byBrand={byBrand}
              onByBrand={brandsInView > 1 ? chooseByBrand : undefined}
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
          style={{
            margin: '10px 26px 0 38px', padding: '5px 6px 5px 12px', borderRadius: 10,
            background: '#FDE7EA', color: '#D22040', fontSize: 12.5,
            fontWeight: 700, flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>{dragError}</span>
          <button
            type="button"
            onClick={() => setDragError('')}
            aria-label="Dismiss"
            className="fx-focus fx-hov-tint"
            style={{
              flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'transparent', color: 'inherit', cursor: 'pointer',
              fontSize: 13, fontWeight: 800, lineHeight: 1, fontFamily: 'inherit', padding: 0,
            }}
          >
            <span aria-hidden="true">✕</span>
          </button>
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
        {/* Spec 027 (US1): on a Space page, List shows the same board as a compact list; it never opens the sheet. */}
        {hosted && boardLayout === 'list' ? (
          <div data-board-list="">
            <ListView tasks={filteredTasks as never} brands={brands} members={members} slaConfig={slaConfig} today={today}
              spaceStages={ss ?? null} onOpen={id => selectTask(id)} />
          </div>
        ) : <BrandGroupProvider value={byBrand && brandsInView > 1}><div className="fx-board-cols" style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '244px',
          gap: 14, marginTop: 14, alignItems: 'start', overflowX: 'auto',
          minWidth: 0, padding: '0 26px 16px 38px',
        }}>
          {spaceStageCols && ss && ss.entries.filter(e => shownStages.includes(e.stage_id) || (!isPhone && stagesInScope.includes(e.stage_id))).map(e => (
            <KanbanColumn
              key={e.id}
              stage={STAGE_META[e.stage_id]}
              spaceStage={{ id: e.id, name: e.name, named: e.named }}
              tasks={tasksByEntry[e.id] ?? []}
              currentUser={currentUser}
              members={members}
              slaConfig={slaConfig}
              today={today}
              highlight={overStage === e.stage_id && activeDragId !== null}
              onSelectTask={id => selectTask(id)}
              onAddTask={() => setShowTaskForm(true)}
              addLabel={addLabel}
              selectedIds={selected}
              selecting={selected.size > 0}
              onToggleSelect={toggleSelect}
              onSelectAll={selectStage}
            />
          ))}
          {!spaceStageCols && shownStages.map(stageId => {
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
                // Spec 021 (FR-027a): everyone may create tasks they own.
                onAddTask={() => setShowTaskForm(true)}
                addLabel={addLabel}
                selectedIds={selected}
                selecting={selected.size > 0}
                onToggleSelect={toggleSelect}
                onSelectAll={selectStage}
              />
            )
          })}
        </div></BrandGroupProvider>}

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
        selectedBrands={liveTasks.filter(x => selected.has(x.id)).map(x => x.brand)}
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
    </MediaIndexContext.Provider>
    </TaskLinkNames.Provider>
  )
}
