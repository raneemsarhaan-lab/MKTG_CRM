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
        minWidth: '240px',
        width: '240px',
        flexShrink: 0,
        background: isOver ? `${color}08` : 'transparent',
        borderRadius: '12px',
        transition: 'background 0.15s',
      }}
    >
      {/* Column header — EN label + AR label, stage color left border + gradient bg */}
      <div
        style={{
          borderLeft: `3px solid ${color}`,
          background: `linear-gradient(135deg, ${color}33, ${color}11)`,
          borderRadius: '0 8px 8px 0',
          padding: '10px 12px',
          marginBottom: '10px',
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
              background: color,
              color: '#fff',
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
        {/* Arabic label below — Caveat font, right-aligned for RTL */}
        <p
          style={{
            fontFamily: 'var(--font-accent)',
            fontSize: '11px',
            color: color,
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
          padding: '0 4px',
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
