'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Linkedin, Instagram, Facebook, Twitter, Music2, Globe } from 'lucide-react'
import type { Task, Member, SLAConfig } from '@/types/index'
import { getAlertStatus } from '@/lib/alert-status'
import { ALERT_BADGE_STYLES } from '@/lib/tokens'
import { initials, avatarColor, calDaysBetween, brandGradient } from '@/lib/utils'

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

export function TaskCard({ task, currentStageOwner, currentUser: _currentUser, slaConfig, today, onSelect }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const alertStatus = getAlertStatus(task, slaConfig, today)
  const badgeStyle  = ALERT_BADGE_STYLES[alertStatus]
  const daysLeft    = calDaysBetween(today, new Date(task.due_date))
  const overdue     = daysLeft < 0
  const dueLabel    = overdue
    ? `${Math.abs(daysLeft)}d over`
    : daysLeft === 0 ? 'Due today' : `${daysLeft}d left`

  const brandColor = task.brand.color
  const brandLabel = task.brand.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  const coverBg = task.cover_image_url
    ? `url(${task.cover_image_url}) center/cover no-repeat`
    : brandGradient(brandColor)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
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

      {/* Cover area */}
      <div style={{ position: 'relative', height: 68, background: coverBg }}>
        {!task.cover_image_url && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: `${brandColor}99`, letterSpacing: '-0.03em' }}>
              {brandLabel}
            </span>
          </div>
        )}
        <PlatformBadge platform={task.platform} />
        <div
          title={task.brand.name}
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

          {/* Due date */}
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
  )
}
