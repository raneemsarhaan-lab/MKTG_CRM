'use client'

import { useState, useMemo, useEffect, useTransition } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverEvent, DragOverlay,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, Brand, ContentType, TaskComment, TaskAttachment, StageId } from '@/types/index'
import { STAGE_META, ALL_STAGES, NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { PIPE } from '@/lib/pipeline-tokens'
import { attentionItems } from '@/lib/home-metrics'
import { initials, avatarColor } from '@/lib/utils'
import { setTaskStage } from '@/actions/tasks'
import { useUIStore } from '@/store/useUIStore'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import {
  BoardFilters, EMPTY_FILTERS, applyBoardFilters, type BoardFilterState,
} from './BoardFilters'
import { TaskModal } from './TaskModal'
import { HeroCards } from './HeroCards'
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
}

export function KanbanBoard({
  initialTasks,
  currentUser,
  members,
  brands,
  contentTypes,
  slaConfig,
  today,
}: KanbanBoardProps) {
  const [tasks, setTasks]         = useState<FullTask[]>(initialTasks)
  const [activeDragId, setActiveDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<StageId | null>(null)
  const [filters, setFilters]     = useState<BoardFilterState>(EMPTY_FILTERS)
  const [dragError, setDragError] = useState('')
  const [, startTransition]       = useTransition()
  const router = useRouter()

  // Server data is copied into local state so drag can reorder within a column
  // without a round trip. That copy has to be re-synced when the server sends
  // new data, or every mutation appears to do nothing until a full reload.
  // Local drag order is intentionally discarded here — it is never persisted.
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])


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

  // ...and its task rows link with ?task=<id>. Without this the link lands on
  // the board with nothing open.
  const deepLinkTaskId = searchParams.get('task')
  useEffect(() => {
    if (deepLinkTaskId) selectTask(deepLinkTaskId)
  }, [deepLinkTaskId, selectTask])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const filteredTasks = useMemo(
    () => applyBoardFilters(tasks, filters, {
      currentUserId: currentUser.id, slaConfig, today,
    }),
    [tasks, filters, currentUser.id, slaConfig, today],
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

    // Optimistic: move it now, put it back if the server says no.
    setDragError('')
    setTasks(prev => prev.map(t => (t.id === dragged.id ? { ...t, status: toStage } : t)))

    startTransition(async () => {
      const res = await setTaskStage(dragged.id, toStage)
      if (!res.success) {
        setTasks(prev => prev.map(t => (t.id === dragged.id ? { ...t, status: fromStage } : t)))
        setDragError(
          res.error === 'not_authorized'
            ? `Only ${STAGE_META[fromStage].owner_role ?? 'the task owner'} can move this out of ${STAGE_META[fromStage].label_en}`
            : 'Could not move that task',
        )
        return
      }
      router.refresh()
      if (res.shouldCelebrate) {
        setCelebration({ taskName: dragged.name, stageLabel: STAGE_META[toStage].label_en })
      }
    })
  }

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null
  const draggedTask  = activeDragId ? tasks.find(t => t.id === activeDragId) ?? null : null

  const attentionCount = attentionItems(tasks, currentUser.id, today).length

  // Time-derived, and computed on the client only — rendering it on the server
  // would freeze whatever hour the page was built at.
  const [greeting, setGreeting] = useState('Hello')
  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? 'Good morning' : h < 18 ? 'Hey' : 'Good evening')
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      gap: 22, paddingBottom: 30, background: '#FFFFFF',
    }}>
      {/* Greeting header — Pipeline handoff §4. */}
      <div style={{
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 18, paddingTop: 6, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <input
              value={filters.search}
              onChange={e => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search tasks, campaigns, assets..."
              aria-label="Search tasks"
              style={{
                width: 362, height: 46, boxSizing: 'border-box',
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

          {/* The bell counts the same work the attention card lists — it is
              not a notification inbox, and pretending otherwise would put a
              number on the screen with nothing behind it. */}
          <div style={{ position: 'relative' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={PIPE.ink}
                 strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
                 aria-label={`${attentionCount} tasks need attention`} role="img">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
            {attentionCount > 0 && (
              <span style={{
                position: 'absolute', top: -8, right: -8, minWidth: 20, height: 20,
                borderRadius: 999, background: PIPE.purple, color: '#FFF',
                fontWeight: 700, fontSize: 11, border: '2px solid #FFFFFF',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
              }}>
                {attentionCount > 99 ? '99+' : attentionCount}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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

      <HeroCards
        tasks={tasks}
        currentUser={currentUser}
        today={today}
        onOpenTask={id => selectTask(id)}
      />

      <BoardFilters
        filters={filters}
        onChange={setFilters}
        tasks={tasks}
        brands={brands}
        members={members}
        shown={filteredTasks.length}
        total={tasks.length}
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
        {/* §7 board: fixed 244px columns on a single scrolling row. */}
        <div style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '244px',
          gap: 14, marginTop: 14, alignItems: 'start', overflowX: 'auto',
          minWidth: 0, padding: '0 26px 16px 38px',
        }}>
          {ALL_STAGES.map(stageId => {
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

      {/* Task modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          currentUser={currentUser}
          stages={[]}
          slaConfig={slaConfig}
          today={today}
          brands={brands}
          members={members}
          contentTypes={contentTypes}
          onClose={() => selectTask(null)}
        />
      )}

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
