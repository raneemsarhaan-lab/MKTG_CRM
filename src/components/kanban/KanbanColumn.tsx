'use client'

import { useDroppable } from '@dnd-kit/core'
import { useLocale } from 'next-intl'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Task, Member, SLAConfig, StageMeta, StageId } from '@/types/index'
import { PIPE, PIPE_ACCENT, PIPE_ACCENT_INK } from '@/lib/pipeline-tokens'
import { TaskCard } from './TaskCard'

/**
 * Pipeline column — handoff §7 "Column shell".
 *
 * 244px wide, on a 1px #ECECF1 border: an uppercase title against a count
 * chip. "Add task" closes the column body.
 *
 * The header is a section washed with the stage's colour at 14%, a dot in the
 * colour itself and the titles in ink; it alone carries the colour. The body
 * below is the same light grey for every stage, so empty columns stay quiet
 * and the white cards stand off it.
 * Where the colour has to be read (the count) or seen as a control (the
 * select box), it's the darkened shade (PIPE_ACCENT_INK): the light accents
 * on white fall well short of 4.5:1 (amber 2.2:1).
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
  const ink = PIPE_ACCENT_INK[stage.id] ?? PIPE.ink
  // The title in the reader's language. Arabic takes no extra tracking: it
  // would pull the joined letters apart.
  const arabic = useLocale() === 'ar'

  const allSelected = tasks.length > 0 && tasks.every(t => selectedIds?.has(t.id))

  const stageOwner = stage.owner_role
    ? members.find(m => m.role === stage.owner_role) ?? null
    : null

  return (
    // The whole column is the drop target, not just the card list — a column
    // holding one card would otherwise offer a 100px-tall place to aim at.
    <div
      role="region"
      aria-label={`${stage.label_en} column`}
      ref={setNodeRef}
      style={{
        // One neutral grey for every column: the header alone carries the
        // stage colour, and the white cards still stand off the panel.
        background: '#F6F6F9',
        border: `1px solid ${active ? accent : PIPE.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: active ? `0 0 0 3px ${accent}22` : 'none',
        transition: 'box-shadow .15s, border-color .15s',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      {/* The header: the stage's colour as a light wash, a dot in the colour
          itself, and the titles in ink. The count and the select box carry
          the colour too, in its darker shade where it has to be read. */}
      <div style={{ padding: '12px 10px 10px', flexShrink: 0, background: `${accent}24`, marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
            {/* Level with the first line when a long title wraps. */}
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: accent, flexShrink: 0, marginTop: 5 }} />
            <div style={{
              // 15px keeps "READY FOR DESIGN" on one line beside the select box
              // and a two-digit count in 244px, with the tracking eased to suit.
              // A longer name (the Arabic for C-Check) wraps rather than being
              // cut off.
              fontSize: 15, lineHeight: 1.25, fontWeight: 800, letterSpacing: arabic ? 0 : '0.01em',
              color: PIPE.ink, textTransform: 'uppercase', overflowWrap: 'break-word', minWidth: 0,
            }}>
              {arabic ? stage.label_ar : stage.label_en}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {onSelectAll && tasks.length > 0 && (
              <button
                type="button"
                onClick={() => onSelectAll(stage.id as StageId, !allSelected)}
                title={allSelected ? `Deselect all in ${stage.label_en}` : `Select all in ${stage.label_en}`}
                // One name for both states; aria-pressed says which it is in.
                aria-label={`Select all in ${stage.label_en}`}
                aria-pressed={allSelected}
                className="fx-focus"
                style={{
                  width: 18, height: 18, borderRadius: 5, cursor: 'pointer',
                  border: `1.5px solid ${ink}`,
                  background: allSelected ? ink : '#FFFFFF',
                  color: '#FFFFFF', fontSize: 11, fontWeight: 900, lineHeight: '15px',
                  padding: 0, fontFamily: 'inherit',
                }}
              >
                <span aria-hidden="true">{allSelected ? '✓' : ''}</span>
              </button>
            )}
            <div style={{
              minWidth: 22, height: 22, borderRadius: 6, background: '#FFFFFF',
              border: `1.5px solid ${accent}`, boxSizing: 'border-box',
              fontSize: 11.5, fontWeight: 700, color: ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '0 5px',
            }}>
              {tasks.length}
            </div>
          </div>
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
            className="fx-hov-tint fx-focus"
            style={{
              // The same 10px above the label as before, split between margin
              // and padding so the hover tint has a little room round the text.
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              marginTop: 6, padding: '4px 0', borderRadius: 8,
              fontSize: 12.5, fontWeight: 700, color: PIPE.purple,
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
