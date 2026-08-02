'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Task, Member, SLAConfig, AlertStatus } from '@/types/index'
import { getAlertStatus } from '@/lib/alert-status'
import { initials, avatarColor, calDaysBetween } from '@/lib/utils'
import { coverImageFor } from '@/lib/attachments'
import { ImageWithFallback } from '@/components/shared/ImageWithFallback'
import { PIPE } from '@/lib/pipeline-tokens'

/**
 * Board task card — Pipeline handoff §7 "Task card".
 *
 * Cover, brand badge, title, status + type chips, then a footer of assignee
 * avatars against the due date. Every value below is literal from the spec.
 */

interface TaskCardProps {
  task: Task & { brand: { id: string; name: string; color: string; logo_url?: string }; task_owner: Member }
  currentStageOwner: Member | null
  currentUser: Member
  slaConfig: SLAConfig
  today: Date
  onSelect: (id: string) => void
  /** Selection state for bulk actions. Absent on the drag overlay. */
  selected?: boolean
  selecting?: boolean
  onToggleSelect?: (id: string, shiftKey: boolean) => void
}

/**
 * The handoff draws three status chips; the pipeline computes six.
 *
 * Stuck is a worse Overdue and Will Miss a worse At Risk, so they take those
 * treatments rather than inventing colour the design never specified. Idle is
 * neither good nor bad and uses the neutral chip.
 */
const CHIP: Record<AlertStatus, { bg: string; color: string; weight: number; upper?: boolean }> = {
  'On Track':  { bg: '#E9F8EE', color: '#16A34A', weight: 700 },
  'At Risk':   { bg: '#FFF1E3', color: '#E07C0B', weight: 700 },
  'Will Miss': { bg: '#FFF1E3', color: '#E07C0B', weight: 700 },
  'Idle':      { bg: PIPE.surface, color: PIPE.textMuted, weight: 600 },
  'Stuck':     { bg: '#FDE7EA', color: '#D22040', weight: 800, upper: true },
  'Overdue':   { bg: '#FDE7EA', color: '#D22040', weight: 800, upper: true },
}

/** The placeholder cover: three bars on a grey gradient (§7.1). */
const BAR_SETS = [[14, 30, 20], [24, 14, 32], [16, 32, 22], [22, 30, 16], [20, 32, 16]]

function Chip({ bg, color, weight, upper, children }: {
  bg: string; color: string; weight: number; upper?: boolean; children: React.ReactNode
}) {
  return (
    <span style={{
      background: bg, color, fontSize: 10.5, fontWeight: weight,
      padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap',
      letterSpacing: upper ? '0.02em' : undefined,
    }}>
      {children}
    </span>
  )
}

function AssigneeDot({ name, stacked }: { name: string; stacked?: boolean }) {
  const label = initials(name)
  return (
    <span
      title={name}
      style={{
        width: 22, height: 22, borderRadius: '50%', background: avatarColor(name),
        color: '#FFFFFF', fontSize: label.length > 1 ? 9 : 10, fontWeight: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        border: stacked ? '1.5px solid #FFFFFF' : undefined,
        marginLeft: stacked ? -7 : undefined,
      }}
    >
      {label}
    </span>
  )
}

/** Card body with no drag wiring, so DragOverlay can reuse it. */
function CardBody({ task, currentStageOwner, slaConfig, today }: {
  task: TaskCardProps['task']
  currentStageOwner: Member | null
  slaConfig: SLAConfig
  today: Date
}) {
  const alert    = getAlertStatus(task, slaConfig, today)
  const chip     = CHIP[alert]
  const daysLeft = task.due_date ? calDaysBetween(today, new Date(task.due_date)) : null
  const overdue  = daysLeft !== null && daysLeft < 0
  const dueLabel = daysLeft === null
    ? ''
    : overdue ? `${Math.abs(daysLeft)}d over`
    : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`

  const attachmentCount = task.attachments?.length ?? 0
  const commentCount    = task.comments?.length ?? 0

  const brandColor = task.brand?.color ?? PIPE.textFaint
  const brandMark  = (task.brand?.name ?? '—').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const cover      = coverImageFor(task)

  // Stable per task, so a card does not reshuffle its bars on every render.
  const bars = BAR_SETS[task.id.charCodeAt(0) % BAR_SETS.length]

  return (
    <>
      {/* Cover */}
      <div style={{ position: 'relative', marginBottom: 9 }}>
        <ImageWithFallback
          src={cover}
          alt=""
          loading="lazy"
          style={{
            width: '100%', height: 126, objectFit: 'cover', display: 'block',
            borderRadius: 8, border: `1px solid ${PIPE.borderFaint}`,
          }}
          fallback={
            <div style={{
              width: '100%', height: 126, borderRadius: 8,
              background: 'linear-gradient(140deg, #F1F1F5 0%, #E7E7EE 100%)',
              border: `1px solid ${PIPE.borderFaint}`, display: 'flex',
              alignItems: 'flex-end', justifyContent: 'center', gap: 5,
              padding: '12px 16px', boxSizing: 'border-box', overflow: 'hidden',
            }}>
              {bars.map((h, i) => (
                <div key={i} style={{
                  flex: 1, height: h, borderRadius: 2,
                  background: h >= 30 ? '#B3B8C6' : '#C9CDD8',
                }} />
              ))}
            </div>
          }
        />

        {task.brand && (
          <span
            title={task.brand.name}
            style={{
              position: 'absolute', top: 7, right: 7, width: 24, height: 24,
              borderRadius: '50%', border: '2px solid #FFFFFF', overflow: 'hidden',
              background: brandColor, color: '#FFFFFF',
              fontSize: brandMark.length > 1 ? 9 : 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ImageWithFallback
              src={task.brand.logo_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={<>{brandMark}</>}
            />
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontSize: 12.5, fontWeight: 600, lineHeight: 1.35,
        color: PIPE.textPrimary, textWrap: 'pretty',
      }}>
        {task.name}
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
        <Chip {...chip}>{chip.upper ? alert.toUpperCase() : alert}</Chip>
        {task.content_type_label && (
          <Chip bg={PIPE.surface} color={PIPE.textMuted} weight={600}>
            {task.content_type_label}
          </Chip>
        )}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 10, gap: 8,
      }}>
        <div style={{ display: 'flex', flexShrink: 0 }}>
          <AssigneeDot name={task.task_owner.name} />
          {currentStageOwner && currentStageOwner.id !== task.task_owner.id && (
            <AssigneeDot name={currentStageOwner.name} stacked />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          {/* Not in the handoff, but asked for earlier — kept at the footer's
              own muted weight so it reads as metadata, not a third chip. */}
          {attachmentCount > 0 && (
            <span title={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: PIPE.textFaintest }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              {attachmentCount}
            </span>
          )}
          {commentCount > 0 && (
            <span title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10.5, fontWeight: 600, color: PIPE.textFaintest }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {commentCount}
            </span>
          )}
          {dueLabel && (
            <span style={{
              fontSize: 10.5, fontWeight: overdue ? 800 : 600,
              color: overdue ? '#D22040' : PIPE.textFaintest, whiteSpace: 'nowrap',
            }}>
              {dueLabel}
            </span>
          )}
        </div>
      </div>

      {/* A subtask says whose it is — otherwise it is indistinguishable from a
          top-level task once it is sitting in a column. */}
      {task.parent && (
        <div
          title={`Subtask of ${task.parent.name}`}
          style={{
            marginTop: 8, paddingTop: 7, borderTop: `1px solid ${PIPE.border}`,
            fontSize: 10.5, fontWeight: 600, color: PIPE.textFaint,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          ↳ {task.parent.name}
        </div>
      )}
    </>
  )
}

const SHELL: React.CSSProperties = {
  background: '#FFFFFF',
  border: `1px solid ${PIPE.border}`,
  borderRadius: 12,
  padding: 8,
}

export function TaskCard({
  task, currentStageOwner, currentUser: _currentUser, slaConfig, today, onSelect,
  selected, selecting, onToggleSelect,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        ...SHELL,
        position: 'relative',
        borderColor: selected ? PIPE.purple : PIPE.border,
        boxShadow: selected ? `0 0 0 2px ${PIPE.purple}33` : undefined,
        transform: CSS.Transform.toString(transform),
        transition,
        // The overlay carries the card while it moves, so the original dims.
        opacity: isDragging ? 0.35 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        // Pointer drags on touch devices are swallowed by scrolling without this.
        touchAction: 'none',
        userSelect: 'none',
        outline: 'none',
      }}
      {...attributes}
      {...listeners}
      onClick={e => {
        // While a selection is running, a plain click extends it rather than
        // opening the task — the same bargain ClickUp makes.
        if (selecting && onToggleSelect) { onToggleSelect(task.id, e.shiftKey); return }
        onSelect(task.id)
      }}
      onKeyDown={e => { if (e.key === 'Enter') onSelect(task.id) }}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.name}`}
      className="fx-task-card"
    >
      {onToggleSelect && (
        <span
          role="checkbox"
          aria-checked={Boolean(selected)}
          aria-label={`Select ${task.name}`}
          tabIndex={0}
          className="fx-card-check"
          data-on={selected ? 'true' : undefined}
          // Stops the click reaching the card and the drag sensor claiming it.
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggleSelect(task.id, e.shiftKey) }}
          onKeyDown={e => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault(); e.stopPropagation(); onToggleSelect(task.id, e.shiftKey)
            }
          }}
          style={{
            position: 'absolute', top: 15, left: 15, zIndex: 2,
            width: 20, height: 20, borderRadius: 6, cursor: 'pointer',
            border: `1.5px solid ${selected ? PIPE.purple : 'rgba(255,255,255,.9)'}`,
            background: selected ? PIPE.purple : 'rgba(255,255,255,.82)',
            color: '#FFFFFF', fontSize: 12, fontWeight: 900, lineHeight: '17px',
            textAlign: 'center', boxShadow: '0 1px 4px rgba(20,19,26,.25)',
          }}
        >
          {selected ? '✓' : ''}
        </span>
      )}

      <CardBody task={task} currentStageOwner={currentStageOwner} slaConfig={slaConfig} today={today} />
    </div>
  )
}

/** What follows the cursor mid-drag. Same body, tilted and lifted. */
export function TaskCardOverlay({
  task, currentStageOwner, slaConfig, today,
}: Omit<TaskCardProps, 'onSelect' | 'currentUser'>) {
  return (
    <div style={{
      ...SHELL, width: 232, cursor: 'grabbing',
      transform: 'rotate(2deg)', boxShadow: '0 12px 32px rgba(26,28,30,.22)',
    }}>
      <CardBody task={task} currentStageOwner={currentStageOwner} slaConfig={slaConfig} today={today} />
    </div>
  )
}
