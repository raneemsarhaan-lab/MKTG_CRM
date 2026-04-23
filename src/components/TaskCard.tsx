import React from 'react'
import { Task, Member } from '../types'
import { differenceInDays, parseISO } from 'date-fns'
import { useStore } from '../store/useStore'
import { playPop } from '../lib/sounds'

const BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  'Islam Personal Branding':   { bg: '#f59e0b22', text: '#f59e0b' },
  'The Strategy Community':    { bg: '#3b82f622', text: '#60a5fa' },
  'Omnisight':                 { bg: '#8b5cf622', text: '#a78bfa' },
  'Forefront':                 { bg: '#10b98122', text: '#34d399' },
}

const PRIORITY_COLORS: Record<string, { dot: string; label: string }> = {
  High:   { dot: '#ef4444', label: '#fca5a5' },
  Medium: { dot: '#f97316', label: '#fdba74' },
  Low:    { dot: '#64748b', label: '#94a3b8' },
}

const CTYPE_ICONS: Record<string, string> = {
  Post:    '📝',
  Video:   '🎬',
  Reel:    '🎞️',
  Design:  '🎨',
  Email:   '📧',
  Story:   '📖',
  Deck:    '📊',
  Other:   '📌',
}

function MemberAvatar({ name, members, size = 22 }: { name: string; members: Member[]; size?: number }) {
  const member = members.find(m => m.name === name)
  const initials = name.slice(0, 2).toUpperCase()
  const bg = member?.bg ?? '#374151'
  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontSize: size * 0.38,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

function DueBadge({ due }: { due: string }) {
  const today = new Date()
  const dueDate = parseISO(due)
  const diff = differenceInDays(dueDate, today)

  let color = '#64748b'
  let bg = 'transparent'

  if (diff < 0) {
    color = '#ef4444'
    bg = '#ef444418'
  } else if (diff === 0) {
    color = '#f97316'
    bg = '#f9731618'
  } else if (diff <= 2) {
    color = '#eab308'
    bg = '#eab30818'
  }

  const label = diff < 0
    ? `${Math.abs(diff)}d overdue`
    : diff === 0
      ? 'Due today'
      : `${diff}d left`

  return (
    <span
      style={{
        fontSize: '0.68rem',
        color,
        backgroundColor: bg,
        borderRadius: 4,
        padding: '0.1rem 0.35rem',
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  )
}

interface Props {
  task: Task
}

export function TaskCard({ task }: Props) {
  const { selectTask, members } = useStore()
  const brand = BRAND_COLORS[task.account] ?? { bg: '#1e293b', text: '#94a3b8' }
  const priority = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.Low

  function handleClick() {
    playPop()
    selectTask(task.id)
  }

  return (
    <div
      onClick={handleClick}
      style={{
        backgroundColor: '#1a1d28',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '0.75rem',
        cursor: 'pointer',
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget
        el.style.backgroundColor = '#21253a'
        el.style.borderColor = 'rgba(255,255,255,0.14)'
        el.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget
        el.style.backgroundColor = '#1a1d28'
        el.style.borderColor = 'rgba(255,255,255,0.07)'
        el.style.transform = 'translateY(0)'
      }}
    >
      {/* Top row: content type icon + brand badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.9rem' }}>{CTYPE_ICONS[task.ctype] ?? '📌'}</span>
        <span
          style={{
            fontSize: '0.65rem',
            fontWeight: 600,
            backgroundColor: brand.bg,
            color: brand.text,
            borderRadius: 4,
            padding: '0.1rem 0.4rem',
            maxWidth: 110,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={task.account}
        >
          {task.account.split(' ')[0]}
        </span>
      </div>

      {/* Task name */}
      <p
        style={{
          color: '#e2e8f0',
          fontSize: '0.82rem',
          fontWeight: 500,
          margin: '0 0 0.55rem',
          lineHeight: 1.35,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {task.name}
      </p>

      {/* Bottom row: priority dot + due + assignee avatar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: priority.dot,
              flexShrink: 0,
            }}
          />
          <DueBadge due={task.due} />
        </div>
        <MemberAvatar name={task.assignee} members={members} />
      </div>
    </div>
  )
}
