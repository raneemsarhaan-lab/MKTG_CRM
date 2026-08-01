'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, Brand, ContentType, TaskComment, TaskAttachment } from '@/types/index'
import { STAGE_META, ALL_STAGES } from '@/lib/stage-meta'
import { useUIStore } from '@/store/useUIStore'
import { KanbanColumn } from './KanbanColumn'
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
  const [search, setSearch]       = useState('')
  const [activeBrand, setActiveBrand] = useState<string | null>(null)

  // Server data is copied into local state so drag can reorder within a column
  // without a round trip. That copy has to be re-synced when the server sends
  // new data, or every mutation appears to do nothing until a full reload.
  // Local drag order is intentionally discarded here — it is never persisted.
  useEffect(() => { setTasks(initialTasks) }, [initialTasks])


  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask     = useUIStore(s => s.selectTask)
  const showTaskForm   = useUIStore(s => s.showTaskForm)
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
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

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (activeBrand && t.brand_id !== activeBrand) return false
      if (search) {
        const q = search.toLowerCase()
        return t.name.toLowerCase().includes(q) || t.task_owner.name.toLowerCase().includes(q)
      }
      return true
    })
  }, [tasks, activeBrand, search])

  const tasksByStage = useMemo(() => {
    const map: Record<string, FullTask[]> = {}
    ALL_STAGES.forEach(s => { map[s] = [] })
    filteredTasks.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [filteredTasks])

  function handleDragStart({ active }: DragStartEvent) {
    setActiveDragId(active.id as string)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveDragId(null)
    if (!over || active.id === over.id) return

    // Find which stage each item belongs to
    const activeStage = tasks.find(t => t.id === active.id)?.status
    const overStage   = tasks.find(t => t.id === over.id)?.status

    // Only allow within-column reorder — no cross-column stage change via drag
    if (!activeStage || !overStage || activeStage !== overStage) return

    setTasks(prev => {
      const oldIdx = prev.findIndex(t => t.id === active.id)
      const newIdx = prev.findIndex(t => t.id === over.id)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }

  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null

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

        {/* Pipeline heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
        </div>
      </div>

      {/* Brand filter + search */}
      <div style={{ padding: '0 24px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {/* Brand filter chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveBrand(null)}
              style={{
                padding: '4px 12px', borderRadius: 99, border: `1px solid ${!activeBrand ? 'var(--lime)' : 'var(--line)'}`,
                background: !activeBrand ? 'var(--lime)' : '#fff',
                color: !activeBrand ? 'var(--ink)' : 'var(--muted)',
                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              All brands
            </button>
            {brands.map(b => {
              const on = activeBrand === b.id
              return (
                <button
                  key={b.id}
                  onClick={() => setActiveBrand(on ? null : b.id)}
                  title={b.name}
                  aria-label={`Filter by ${b.name}`}
                  aria-pressed={on}
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    border: `2px solid ${on ? 'var(--lime)' : 'transparent'}`,
                    background: b.color, cursor: 'pointer', flexShrink: 0,
                    boxShadow: on ? `0 4px 12px ${b.color}66` : 'none',
                  }}
                />
              )
            })}
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..."
              style={{
                width: 180, padding: '5px 10px 5px 28px',
                background: '#fff', border: '1px solid var(--line)', borderRadius: 10,
                fontSize: '0.78rem', outline: 'none', color: 'var(--ink)', fontFamily: 'inherit',
              }}
            />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round"
              style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          {/* New task — the board's own entry point to the composer. The rail
              is icon-only (handoff §3), so this action lives on the screen. */}
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

      <StatStrip tasks={tasks} today={today} />

      {/* Board columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div style={{
          display: 'flex', gap: 12, overflowX: 'auto',
          padding: '12px 20px 20px', flex: 1, alignItems: 'flex-start',
        }}>
          {ALL_STAGES.map(stageId => {
            const stage      = STAGE_META[stageId]
            const stageTasks = tasksByStage[stageId] ?? []
            const stageOwner = stage.owner_role
              ? members.find(m => m.role === stage.owner_role) ?? null
              : null

            return (
              <KanbanColumn
                key={stageId}
                stage={stage}
                tasks={stageTasks}
                currentUser={currentUser}
                members={members}
                slaConfig={slaConfig}
                today={today}
                onSelectTask={id => selectTask(id)}
              />
            )
          })}
        </div>
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
