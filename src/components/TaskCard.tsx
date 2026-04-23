import React from 'react'
import { Task, Member } from '../types'
import { differenceInDays, parseISO } from 'date-fns'
import { useStore } from '../store/useStore'
import { playPop } from '../lib/sounds'

const BRAND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Islam Personal Branding':  { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  'The Strategy Community':   { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  'Omnisight':                { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  'Forefront':                { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
}

const PRIORITY_COLORS: Record<string, { dot: string }> = {
  High:   { dot: '#ef4444' },
  Medium: { dot: '#f97316' },
  Low:    { dot: '#94a3b8' },
}

const CTYPE_ICONS: Record<string, string> = {
  Post: '📝', Video: '🎬', Reel: '🎞️', Design: '🎨',
  Email: '📧', Story: '📖', Deck: '📊', Other: '📌',
}

function MemberAvatar({ name, members, size = 22 }: { name: string; members: Member[]; size?: number }) {
  const member = members.find(m => m.name === name)
  const initials = name.slice(0, 2).toUpperCase()
  const bg = member?.bg ?? '#94a3b8'
  return (
    <div title={name} style={{ width: size, height: size, borderRadius: '50%', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: size * 0.38, fontWeight: 700, flexShrink: 0 }}>
      {initials}
    </div>
  )
}

function DueBadge({ due }: { due: string }) {
  const today = new Date()
  const dueDate = parseISO(due)
  const diff = differenceInDays(dueDate, today)
  let color = '#94a3b8'
  let bg = 'transparent'
  if (diff < 0)       { color = '#ef4444'; bg = '#fef2f2' }
  else if (diff === 0) { color = '#f97316'; bg = '#fff7ed' }
  else if (diff <= 2)  { color = '#ca8a04'; bg = '#fefce8' }

  const label = diff < 0 ? `${Math.abs(diff)}d late` : diff === 0 ? 'Today' : `${diff}d`
  return (
    <span style={{ fontSize: '0.67rem', color, backgroundColor: bg, borderRadius: 4, padding: '0.1rem 0.35rem', fontWeight: 600 }}>
      {label}
    </span>
  )
}

interface Props { task: Task }

export function TaskCard({ task }: Props) {
  const { selectTask, members } = useStore()
  const brand = BRAND_COLORS[task.account] ?? { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' }
  const priority = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.Low

  return (
    <div
      onClick={() => { playPop(); selectTask(task.id) }}
      style={{
        backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
        padding: '0.75rem', cursor: 'pointer', transition: 'all 0.12s', userSelect: 'none',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#c7d2fe'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#e2e8f0'
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.04)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.9rem' }}>{CTYPE_ICONS[task.ctype] ?? '📌'}</span>
        <span style={{ fontSize: '0.65rem', fontWeight: 600, backgroundColor: brand.bg, color: brand.text, border: `1px solid ${brand.border}`, borderRadius: 4, padding: '0.1rem 0.4rem', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={task.account}>
          {task.account.split(' ')[0]}
        </span>
      </div>

      {/* Task name */}
      <p style={{ color: '#0f172a', fontSize: '0.82rem', fontWeight: 500, margin: '0 0 0.55rem', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {task.name}
      </p>

      {/* Bottom row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: priority.dot, flexShrink: 0 }} />
          <DueBadge due={task.due} />
        </div>
        <MemberAvatar name={task.assignee} members={members} />
      </div>
    </div>
  )
}
