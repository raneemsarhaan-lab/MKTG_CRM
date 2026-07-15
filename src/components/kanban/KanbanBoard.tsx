'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext, DragEndEvent, DragOverEvent, DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, Brand, ContentType, TaskComment, TaskAttachment } from '@/types/index'
import { STAGE_META, ALL_STAGES } from '@/lib/stage-meta'
import { useUIStore } from '@/store/useUIStore'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
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
  const router = useRouter()

  // Supabase Realtime — subscribe to task changes and refresh server data
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const ch = supabase
      .channel('board-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        router.refresh()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [router])

  const selectedTaskId = useUIStore(s => s.selectedTaskId)
  const selectTask     = useUIStore(s => s.selectTask)
  const showTaskForm   = useUIStore(s => s.showTaskForm)
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)

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

  const isAdmin = currentUser.access === 'admin'

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar: brand filter + search + new task button */}
      <div style={{ padding: '10px 20px 0', flexShrink: 0 }}>
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
                    width: 30, height: 30, borderRadius: '50%',
                    border: `2px solid ${on ? 'var(--lime)' : 'transparent'}`,
                    background: b.color, cursor: 'pointer', flexShrink: 0,
                    boxShadow: on ? `0 4px 12px ${b.color}66` : 'none',
                  }}
                />
              )
            })}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

            {/* New task button — admin/superuser only */}
            {(isAdmin || currentUser.access === 'superuser') && (
              <button
                onClick={() => setShowTaskForm(true)}
                aria-label="Create new task"
                style={{
                  padding: '5px 14px', borderRadius: 10, border: 'none',
                  background: 'var(--ink)', color: 'var(--lime)',
                  fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                + New Task
              </button>
            )}
          </div>
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
