import React, { useState } from 'react'
import { Task, StageId } from '../types'
import { differenceInDays, parseISO } from 'date-fns'
import { useStore } from '../store/useStore'
import { playPop, playMove, playVictory, playCelebration } from '../lib/sounds'
import { getNextStage, getStageOwner, STAGE_MAP } from '../data/stages'

const UI = {
  ink: '#1B1A13',
  muted: '#8A8D91',
  line: '#EFEFEC',
  lime: '#C3F53D',
  tightShadow: '0 1px 2px rgba(26,28,30,.06)',
}

const PRIORITY_COLOR: Record<string, string> = {
  High: '#D57D6F', Medium: '#E0A23F', Low: '#7C8288',
}

const ALERT_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  'On Track':  { color: '#4B7A12', bg: '#EDF6C6', label: 'On track' },
  'At Risk':   { color: '#A9791F', bg: '#F7EFD3', label: 'At risk' },
  'Overdue':   { color: '#C0453E', bg: '#F8E7E5', label: 'Overdue' },
  'Stuck':     { color: '#C0453E', bg: '#F8E7E5', label: 'Stuck' },
}

const BRAND_COLORS: Record<string, string> = {
  'Islam Personal Branding':  '#1E293B',
  'The Strategy Community':   '#7A5A2E',
  'Omnisight':                '#0E7C7B',
  'Forefront':                '#B4322F',
}

const CTYPE_ICON_NAME: Record<string, string> = {
  Post: '✏️', Video: '🎬', Reel: '🎞️', Design: '🎨',
  Email: '📧', Story: '📖', Deck: '📊', Other: '📌',
}

function PlatformBadge({ platform }: { platform?: string }) {
  const p = platform || 'LinkedIn'
  const size = 32, g = Math.round(size * 0.6)
  const base: React.CSSProperties = {
    position: 'absolute', left: 8, top: 8,
    width: size, height: size, borderRadius: 9,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 2px 7px rgba(15,26,61,.22)',
  }
  if (p === 'Instagram') return (
    <div style={{ ...base, background: 'linear-gradient(45deg,#F58529 6%,#DD2A7B 45%,#8134AF 72%,#515BD4 100%)' }}>
      <svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round">
        <rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.15" fill="#fff" stroke="none"/>
      </svg>
    </div>
  )
  if (p === 'TikTok') return (
    <div style={{ ...base, background: '#010101' }}>
      <svg width={g} height={g} viewBox="0 0 24 24" fill="#fff">
        <path d="M16.5 3c.3 2 1.6 3.5 3.5 3.8v2.4c-1.3 0-2.5-.4-3.5-1.1v5.9c0 3-2.2 5-5 5s-5-2-5-4.8c0-2.9 2.4-4.9 5.3-4.6v2.5c-.4-.1-.8-.2-1.1-.2-1.2 0-2.2.9-2.2 2.2 0 1.3 1 2.2 2.2 2.2 1.3 0 2.3-1 2.3-2.6V3z"/>
      </svg>
    </div>
  )
  if (p === 'Facebook') return (
    <div style={{ ...base, background: '#1877F2' }}>
      <svg width={g} height={g} viewBox="0 0 24 24" fill="#fff">
        <path d="M13.5 21v-8h2.3l.35-2.7H13.5V8.5c0-.78.22-1.31 1.34-1.31h1.43V4.77c-.25-.03-1.1-.1-2.09-.1-2.07 0-3.48 1.26-3.48 3.58v2.05H8.4V13h2.3v8z"/>
      </svg>
    </div>
  )
  return (
    <div style={{ ...base, background: '#0A66C2' }}>
      <svg width={g} height={g} viewBox="0 0 24 24" fill="#fff">
        <path d="M6.94 7.5a1.94 1.94 0 1 1 0-3.88 1.94 1.94 0 0 1 0 3.88ZM5.4 8.9h3.08v9.7H5.4zM10.6 8.9h2.95v1.33h.04c.41-.78 1.42-1.6 2.92-1.6 3.12 0 3.7 2.05 3.7 4.72v5.25h-3.08v-4.65c0-1.11-.02-2.54-1.55-2.54-1.55 0-1.79 1.21-1.79 2.46v4.73H10.6z"/>
      </svg>
    </div>
  )
}

function getAlertStatus(task: Task): string {
  const today = new Date()
  const dueDate = parseISO(task.due)
  if (task.status === 'publish') return 'On Track'
  if (dueDate < today) return 'Overdue'
  const daysIn = differenceInDays(today, parseISO(task.stageDate))
  if (daysIn > 4) return 'Stuck'
  if (differenceInDays(dueDate, today) <= 2) return 'At Risk'
  return 'On Track'
}

interface Props { task: Task }

export function TaskCard({ task }: Props) {
  const { selectTask, moveTask, currentUser } = useStore()
  const [isDragging, setIsDragging] = useState(false)

  const alert = getAlertStatus(task)
  const aStyle = ALERT_STYLE[alert] || ALERT_STYLE['On Track']
  const brandColor = BRAND_COLORS[task.account] || '#94A3B8'
  const brandInitial = task.account.charAt(0).toUpperCase()
  const today = new Date()
  const dueDate = parseISO(task.due)
  const dueDays = differenceInDays(dueDate, today)
  const overdue = dueDays < 0
  const dueLabel = overdue ? `${Math.abs(dueDays)}d over` : dueDays === 0 ? 'Due today' : `${dueDays}d left`

  const nextStage = getNextStage(task)
  const canMove = currentUser && (
    currentUser.access === 'admin' ||
    currentUser.access === 'superuser' ||
    getStageOwner(task, task.status) === currentUser.name
  )

  function handleNext(e: React.MouseEvent) {
    e.stopPropagation()
    if (!nextStage || !canMove || !currentUser) return
    const stageLabel = STAGE_MAP[nextStage]?.label ?? nextStage
    if (nextStage === 'publish') {
      playVictory()
      moveTask(task.id, nextStage as StageId)
      useStore.setState({ celebration: { taskName: task.name, stageLabel } })
    } else {
      const nextOwner = getStageOwner(task, nextStage)
      if (nextOwner === currentUser.name) playCelebration()
      else playMove()
      moveTask(task.id, nextStage as StageId)
    }
  }

  return (
    <div
      draggable
      onDragStart={e => {
        setIsDragging(true)
        e.dataTransfer.setData('taskId', task.id.toString())
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragEnd={() => setIsDragging(false)}
      onClick={() => { playPop(); selectTask(task.id) }}
      style={{
        background: '#FAFAF9',
        border: `1px solid ${UI.line}`,
        borderRadius: 18, overflow: 'hidden',
        boxShadow: UI.tightShadow,
        cursor: 'grab',
        transition: 'box-shadow 0.12s, transform 0.12s, opacity 0.12s',
        marginBottom: 10,
        opacity: isDragging ? 0.4 : 1,
      }}
      onMouseEnter={e => {
        if (isDragging) return
        e.currentTarget.style.boxShadow = '0 4px 14px rgba(26,28,30,.1)'
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = UI.tightShadow
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {/* Cover area */}
      <div style={{ position: 'relative', height: 68, background: '#F1F1EF' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#C4C7CB" strokeWidth="1.5" strokeLinecap="round" opacity="0.7">
            <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
          </svg>
        </div>
        <PlatformBadge platform={task.platform} />
        <div
          title={task.account}
          style={{
            position: 'absolute', right: 8, top: 8,
            width: 28, height: 28, borderRadius: 99,
            background: brandColor, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800,
            border: '2px solid #fff',
            boxShadow: '0 2px 7px rgba(15,26,61,.20)',
          }}
        >
          {brandInitial}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0.65rem 0.75rem 0.6rem' }}>
        {/* Title */}
        <p style={{
          color: UI.ink, fontSize: '0.82rem', fontWeight: 700,
          margin: '0 0 0.5rem', lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {task.name}
        </p>

        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: '0.5rem' }}>
          {overdue && task.status !== 'publish' && (
            <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 5, background: '#F7E3E3', color: '#C03A3A', textTransform: 'uppercase' }}>
              Overdue
            </span>
          )}
          <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: aStyle.bg, color: aStyle.color }}>
            {aStyle.label}
          </span>
          <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px', borderRadius: 5, background: '#F1F1EF', color: UI.ink }}>
            {CTYPE_ICON_NAME[task.ctype] || '📌'} {task.ctype}
          </span>
        </div>

        {/* Priority */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: '0.55rem' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill={PRIORITY_COLOR[task.priority]} stroke={PRIORITY_COLOR[task.priority]} strokeWidth="1">
            <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>
          </svg>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: PRIORITY_COLOR[task.priority] }}>
            {task.priority} priority
          </span>
        </div>

        {/* Footer: assignee + due + next button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid #EDF0F6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              background: '#6B6B7A', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.55rem', fontWeight: 700,
            }}>
              {task.assignee.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: UI.ink }}>
              {task.assignee.split(' ')[0]}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={overdue ? '#C03A3A' : UI.muted} strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: overdue ? '#C03A3A' : UI.muted }}>
                {dueLabel}
              </span>
            </div>

            {/* Next stage button */}
            {nextStage && canMove && (
              <button
                onClick={handleNext}
                title={`Move to ${STAGE_MAP[nextStage]?.label ?? nextStage}`}
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: nextStage === 'publish' ? '#22C55E' : UI.lime,
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(0,0,0,.12)',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,.18)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,.12)' }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={nextStage === 'publish' ? '#fff' : '#111'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Comments/attachments indicators */}
        {((task.comments?.length || 0) > 0 || (task.attachments?.length || 0) > 0) && (
          <div style={{ display: 'flex', gap: 10, marginTop: '0.4rem', color: UI.muted }}>
            {(task.attachments?.length || 0) > 0 && (
              <span style={{ fontSize: '0.62rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                📎 {task.attachments!.length}
              </span>
            )}
            {(task.comments?.length || 0) > 0 && (
              <span style={{ fontSize: '0.62rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                💬 {task.comments!.length}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
