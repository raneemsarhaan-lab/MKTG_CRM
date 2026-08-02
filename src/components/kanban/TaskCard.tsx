'use client'

import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Linkedin, Instagram, Facebook, Twitter, Music2, Globe } from 'lucide-react'
import type { Task, Member, SLAConfig } from '@/types/index'
import { getAlertStatus } from '@/lib/alert-status'
import { ALERT_BADGE_STYLES } from '@/lib/tokens'
import { initials, avatarColor, calDaysBetween, brandGradient } from '@/lib/utils'
import { coverImageFor } from '@/lib/attachments'

interface TaskCardProps {
  task: Task & { brand: { id: string; name: string; color: string }; task_owner: Member }
  currentStageOwner: Member | null
  currentUser: Member
  slaConfig: SLAConfig
  today: Date
  onSelect: (id: string) => void
}

function PlatformIcon({ platform }: { platform?: string }) {
  const size = 14
  switch (platform?.toLowerCase()) {
    case 'linkedin':  return <Linkedin size={size} />
    case 'instagram': return <Instagram size={size} />
    case 'facebook':  return <Facebook size={size} />
    case 'twitter':
    case 'x':        return <Twitter size={size} />
    case 'tiktok':   return <Music2 size={size} />
    default:         return <Globe size={size} />
  }
}

function PlatformBadge({ platform }: { platform?: string }) {
  return (
    <div
      style={{
        position: 'absolute', left: 8, top: 8,
        width: 28, height: 28, borderRadius: 8,
        background: 'rgba(17,17,17,0.72)',
        backdropFilter: 'blur(4px)',
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 7px rgba(15,26,61,.22)',
      }}
    >
      <PlatformIcon platform={platform} />
    </div>
  )
}

function Avatar({
  name, size = 22, style = {},
}: {
  name: string; size?: number; style?: React.CSSProperties
}) {
  return (
    <div
      title={name}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: avatarColor(name),
        color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.36, fontWeight: 700,
        flexShrink: 0,
        ...style,
      }}
    >
      {initials(name)}
    </div>
  )
}

/**
 * The card's visual body, with no drag wiring.
 *
 * Split out so the same markup can be rendered inside dnd-kit's DragOverlay.
 * A sortable item across columns doesn't follow the pointer on its own — the
 * overlay is what does — and the overlay must not call useSortable with an id
 * that is already registered.
 */
function CardBody({ task, currentStageOwner, slaConfig, today }: {
  task: TaskCardProps['task']
  currentStageOwner: Member | null
  slaConfig: SLAConfig
  today: Date
}) {
  const [coverFailed, setCoverFailed] = useState(false)

  const alertStatus = getAlertStatus(task, slaConfig, today)
  const badgeStyle  = ALERT_BADGE_STYLES[alertStatus]
  const daysLeft    = task.due_date ? calDaysBetween(today, new Date(task.due_date)) : null
  const overdue     = daysLeft !== null && daysLeft < 0
  const dueLabel    = daysLeft === null
    ? 'No date'
    : overdue ? `${Math.abs(daysLeft)}d over`
    : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`

  const attachmentCount = task.attachments?.length ?? 0
  const commentCount    = task.comments?.length ?? 0

  const brandColor = task.brand?.color ?? '#8A8D91'
  const brandLabel = (task.brand?.name ?? '—').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  // Set cover first, else the newest image attachment (see coverImageFor).
  const cover = coverImageFor(task)

  return (
    <>
      <style>{`
        .task-card {
          background: #FAFAF9;
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(26,28,30,.06);
          cursor: grab;
          margin-bottom: 10px;
          transition: box-shadow 0.12s, transform 0.12s;
          user-select: none;
          outline: none;
        }
        .task-card:focus-visible {
          box-shadow: 0 0 0 2px var(--lime);
        }
        .task-card:hover {
          box-shadow: 0 4px 14px rgba(26,28,30,.10);
          transform: translateY(-1px);
        }
      `}</style>

      {/* Cover area — brand gradient underneath, image on top when there is
          one. An <img> rather than a CSS background so a URL that fails to
          load reveals the gradient instead of an empty box. */}
      <div style={{ position: 'relative', height: 68, background: brandGradient(brandColor), overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: `${brandColor}99`, letterSpacing: '-0.03em' }}>
            {brandLabel}
          </span>
        </div>
        {cover && !coverFailed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            loading="lazy"
            onError={() => setCoverFailed(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <PlatformBadge platform={task.platform} />
        <div
          title={task.brand?.name ?? 'No brand'}
          style={{
            position: 'absolute', right: 8, top: 8,
            width: 28, height: 28, borderRadius: '50%',
            background: brandColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800,
            border: '2px solid #fff',
            boxShadow: '0 2px 7px rgba(15,26,61,.20)',
          }}
        >
          {brandLabel}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px 10px' }}>
        {/* Task name */}
        <p style={{
          color: 'var(--ink)',
          fontSize: '0.82rem',
          fontWeight: 700,
          margin: '0 0 8px',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {task.name}
        </p>

        {/* Badges row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          <span style={{
            fontSize: '0.62rem', fontWeight: 700,
            padding: '2px 6px', borderRadius: 5,
            background: badgeStyle.bg, color: badgeStyle.text,
          }}>
            {alertStatus}
          </span>
          <span style={{
            fontSize: '0.62rem', fontWeight: 600,
            padding: '2px 6px', borderRadius: 5,
            background: '#F1F1EF', color: 'var(--ink)',
          }}>
            {task.content_type_label}
          </span>
        </div>

        {/* Footer: avatars + due date */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 8, borderTop: '1px solid #EDF0F6',
        }}>
          {/* Avatars */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Avatar name={task.task_owner.name} size={22} />
            {currentStageOwner && currentStageOwner.id !== task.task_owner.id && (
              <Avatar name={currentStageOwner.name} size={22} style={{ marginLeft: -6, border: '1.5px solid #fff' }} />
            )}
          </div>

          {/* Attachment + comment counts, then the due date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {attachmentCount > 0 && (
              <span
                title={`${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
                {attachmentCount}
              </span>
            )}
            {commentCount > 0 && (
              <span
                title={`${commentCount} comment${commentCount === 1 ? '' : 's'}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: '0.68rem', fontWeight: 600, color: 'var(--muted)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                {commentCount}
              </span>
            )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
              stroke={overdue ? '#C03A3A' : 'var(--muted)'}
              strokeWidth="2" strokeLinecap="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: overdue ? '#C03A3A' : 'var(--muted)' }}>
              {dueLabel}
            </span>
          </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function TaskCard({
  task, currentStageOwner, currentUser: _currentUser, slaConfig, today, onSelect,
}: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    // The overlay carries the card while it moves, so the original just dims.
    opacity: isDragging ? 0.35 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    // Pointer drags on touch devices are swallowed by scrolling without this.
    touchAction: 'none',
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onSelect(task.id)}
      onKeyDown={e => { if (e.key === 'Enter') onSelect(task.id) }}
      role="button"
      tabIndex={0}
      aria-label={`Task: ${task.name}`}
      className="task-card"
    >
      <CardBody
        task={task}
        currentStageOwner={currentStageOwner}
        slaConfig={slaConfig}
        today={today}
      />
    </div>
  )
}

/** What follows the cursor mid-drag. Same body, tilted and lifted. */
export function TaskCardOverlay({
  task, currentStageOwner, slaConfig, today,
}: Omit<TaskCardProps, 'onSelect' | 'currentUser'>) {
  return (
    <div
      className="task-card"
      style={{
        width: 276, cursor: 'grabbing',
        transform: 'rotate(2deg)',
        boxShadow: '0 12px 32px rgba(26,28,30,.22)',
      }}
    >
      <CardBody
        task={task}
        currentStageOwner={currentStageOwner}
        slaConfig={slaConfig}
        today={today}
      />
    </div>
  )
}
