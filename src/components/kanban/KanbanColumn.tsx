'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, StageMeta } from '@/types/index'
import { TaskCard } from './TaskCard'

interface KanbanColumnProps {
  stage: StageMeta
  tasks: (Task & { brand: { id: string; name: string; color: string }; task_owner: Member })[]
  currentUser: Member
  members: Member[]
  slaConfig: SLAConfig
  today: Date
  onSelectTask: (id: string) => void
}

export function KanbanColumn({ stage, tasks, currentUser, members, slaConfig, today, onSelectTask }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })

  const color = stage.color
  const stageOwner = stage.owner_role
    ? members.find(m => m.role === stage.owner_role) ?? null
    : null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: '280px',
        width: '280px',
        flexShrink: 0,
        background: isOver ? `${color}08` : 'transparent',
        borderRadius: '12px',
        transition: 'background 0.15s',
      }}
    >
      {/* Column header — colored top border, white bg, gray count badge */}
      <div
        style={{
          borderTop: `3px solid ${color}`,
          borderLeft: '1px solid var(--line)',
          borderRight: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
          background: '#FFFFFF',
          borderRadius: '10px 10px 0 0',
          padding: '10px 12px',
          marginBottom: '8px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 700,
              fontSize: '12px',
              letterSpacing: '-0.01em',
              color: 'var(--ink)',
            }}
          >
            {stage.label_en}
          </span>
          <span
            style={{
              background: '#F1F1EF',
              color: 'var(--muted)',
              borderRadius: '99px',
              fontSize: '10px',
              fontWeight: 700,
              padding: '1px 7px',
              minWidth: '20px',
              textAlign: 'center',
            }}
          >
            {tasks.length}
          </span>
        </div>
        <p
          style={{
            fontFamily: 'var(--font-accent)',
            fontSize: '11px',
            color: 'var(--muted)',
            marginTop: '2px',
            direction: 'rtl',
            textAlign: 'right',
          }}
        >
          {stage.label_ar}
        </p>
      </div>

      {/* Card list — droppable + sortable */}
      <div
        ref={setNodeRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 2px',
          minHeight: '48px',
        }}
      >
        <SortableContext
          items={tasks.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              currentStageOwner={stageOwner}
              currentUser={currentUser}
              slaConfig={slaConfig}
              today={today}
              onSelect={onSelectTask}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div
            style={{
              height: '80px',
              border: `2px dashed ${color}33`,
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Empty</span>
          </div>
        )}
      </div>
    </div>
  )
}
