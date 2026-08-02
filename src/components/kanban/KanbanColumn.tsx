'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, StageMeta, StageId } from '@/types/index'
import { PIPE, PIPE_ACCENT } from '@/lib/pipeline-tokens'
import { TaskCard } from './TaskCard'

/**
 * Pipeline column — handoff §7 "Column shell".
 *
 * 244px wide, white on a 1px #ECECF1 border with a 3px accent along the top,
 * an uppercase title against a count chip, and the Arabic label right-aligned
 * underneath. "Add task" closes the column body.
 */

interface KanbanColumnProps {
  stage: StageMeta
  tasks: (Task & { brand: { id: string; name: string; color: string; logo_url?: string }; task_owner: Member })[]
  currentUser: Member
  members: Member[]
  slaConfig: SLAConfig
  today: Date
  /** Set by the board when the pointer is over this column mid-drag. */
  highlight?: boolean
  onSelectTask: (id: string) => void
  onAddTask?: () => void
  selectedIds?: Set<string>
  selecting?: boolean
  onToggleSelect?: (id: string, shiftKey: boolean) => void
  onSelectAll?: (stageId: StageId, on: boolean) => void
}

export function KanbanColumn({
  stage, tasks, currentUser, members, slaConfig, today, highlight, onSelectTask, onAddTask,
  selectedIds, selecting, onToggleSelect, onSelectAll,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const active = isOver || Boolean(highlight)
  const accent = PIPE_ACCENT[stage.id] ?? PIPE.purpleStroke

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds?.has(t.id))

  const stageOwner = stage.owner_role
    ? members.find(m => m.role === stage.owner_role) ?? null
    : null

  return (
    // The whole column is the drop target, not just the card list — a column
    // holding one card would otherwise offer a 100px-tall place to aim at.
    <div
      ref={setNodeRef}
      style={{
        background: '#FFFFFF',
        border: `1px solid ${active ? accent : PIPE.border}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: active ? `0 0 0 3px ${accent}22` : 'none',
        transition: 'box-shadow .15s, border-color .15s',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <div style={{ padding: '14px 10px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 800, letterSpacing: '0.04em',
            color: PIPE.textPrimary, textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {stage.label_en}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {onSelectAll && tasks.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectAll(stage.id as StageId, !allSelected)}
                title={allSelected ? `Deselect all in ${stage.label_en}` : `Select all in ${stage.label_en}`}
                aria-pressed={allSelected}
                style={{
                  width: 18, height: 18, borderRadius: 5, cursor: 'pointer',
                  border: `1.5px solid ${allSelected ? PIPE.purple : PIPE.borderInput}`,
                  background: allSelected ? PIPE.purple : '#FFFFFF',
                  color: '#FFFFFF', fontSize: 11, fontWeight: 900, lineHeight: '15px',
                  padding: 0, fontFamily: 'inherit',
                }}
              >
                {allSelected ? '✓' : ''}
              </button>
            )}
            <div style={{
              minWidth: 22, height: 22, borderRadius: 6, background: PIPE.surface,
              fontSize: 11.5, fontWeight: 700, color: PIPE.textMuted,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 5px',
            }}>
              {tasks.length}
            </div>
          </div>
        </div>
        <div style={{
          marginTop: 4, fontSize: 11, fontWeight: 500, color: PIPE.placeholder,
          direction: 'rtl', textAlign: 'right',
        }}>
          {stage.label_ar}
        </div>
      </div>

      <div style={{
        padding: '0 6px 10px', display: 'flex', flexDirection: 'column', gap: 10,
        flex: 1, minHeight: 96, overflowY: 'auto',
      }}>
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              currentStageOwner={stageOwner}
              currentUser={currentUser}
              slaConfig={slaConfig}
              today={today}
              onSelect={onSelectTask}
              selected={selectedIds?.has(task.id)}
              selecting={selecting}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>

        {onAddTask && (
          <button
            type="button"
            onClick={onAddTask}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '10px 0 2px', fontSize: 12.5, fontWeight: 700, color: PIPE.purple,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={PIPE.purple}
                 strokeWidth="2.6" aria-hidden="true">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            Add task
          </button>
        )}
      </div>
    </div>
  )
}
