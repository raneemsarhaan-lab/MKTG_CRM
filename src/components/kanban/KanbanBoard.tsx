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
import { setTaskStage } from '@/actions/tasks'
import { useUIStore } from '@/store/useUIStore'
import { KanbanColumn } from './KanbanColumn'
import { TaskCardOverlay } from './TaskCard'
import {
  BoardFilters, EMPTY_FILTERS, applyBoardFilters, type BoardFilterState,
} from './BoardFilters'
import { TaskModal } from './TaskModal'
import { StatStrip } from './StatStrip'
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

  // Compute active task count for workload bar
  const myActiveTasks = tasks.filter(t => t.task_owner.id === currentUser.id && t.status !== 'publish').length
  const workloadPct   = Math.min(100, Math.round((myActiveTasks / 10) * 100))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* User identity header */}
      <div
        style={{
          padding: '16px 24px 12px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Square avatar */}
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: '#6E5BE6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '15px', color: '#fff' }}>
              {currentUser.name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
            </span>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '14px', color: 'var(--ink)' }}>
              {currentUser.name}
            </div>
            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  width: '80px',
                  height: '4px',
                  borderRadius: '99px',
                  background: 'var(--line)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${workloadPct}%`,
                    borderRadius: '99px',
                    background: workloadPct > 80 ? '#F5334F' : '#B79CF5',
                  }}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontFamily: 'var(--font-heading)' }}>
                {myActiveTasks} active
              </span>
            </div>
          </div>
        </div>

        {/* Pipeline heading + the board's own entry point to the composer.
            The rail is icon-only (handoff §3), so this action lives here. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 900,
              fontSize: '18px',
              color: 'var(--ink)',
              letterSpacing: '-0.02em',
            }}
          >
            Pipeline
          </span>
          {currentUser.access !== 'user' && (
            <button
              onClick={() => setShowTaskForm(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--brand-lime)', color: '#111111', border: 'none',
                borderRadius: 10, fontFamily: 'var(--font-heading)', fontWeight: 700,
                fontSize: 13, padding: '8px 14px', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New task
            </button>
          )}
        </div>
      </div>

      <BoardFilters
        filters={filters}
        onChange={setFilters}
        tasks={tasks}
        brands={brands}
        members={members}
        shown={filteredTasks.length}
        total={tasks.length}
      />

      {/* The strip counts what is on screen, so it agrees with the columns
          rather than reporting the whole board while a filter is applied. */}
      <StatStrip tasks={filteredTasks} today={today} />

      {/* Board columns */}
      {dragError && (
        <div
          role="alert"
          onClick={() => setDragError('')}
          style={{
            margin: '0 24px 8px', padding: '7px 12px', borderRadius: 10,
            background: '#FCE4E1', color: '#C0392B', fontSize: '0.75rem',
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
        <div style={{
          display: 'flex', gap: 12, overflowX: 'auto',
          padding: '12px 20px 20px', flex: 1, alignItems: 'flex-start',
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
