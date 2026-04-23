import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { getNextStage, getPrevStage, getStageOwner, STAGE_MAP, getStageFlow } from '../data/stages'
import { Task, StageId } from '../types'
import { playMove, playVictory, playCelebration, playError } from '../lib/sounds'
import { differenceInDays, parseISO, format } from 'date-fns'

const BRAND_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Islam Personal Branding':  { bg: '#fef3c7', text: '#92400e', border: '#fde68a' },
  'The Strategy Community':   { bg: '#dbeafe', text: '#1e40af', border: '#bfdbfe' },
  'Omnisight':                { bg: '#ede9fe', text: '#5b21b6', border: '#ddd6fe' },
  'Forefront':                { bg: '#d1fae5', text: '#065f46', border: '#a7f3d0' },
}
const PRIORITY_COLORS: Record<string, string> = { High: '#ef4444', Medium: '#f97316', Low: '#94a3b8' }
const CTYPE_ICONS: Record<string, string> = { Post: '📝', Video: '🎬', Reel: '🎞️', Design: '🎨', Email: '📧', Story: '📖', Deck: '📊', Other: '📌' }

function canCurrentUserMove(task: Task, name: string, access: string): boolean {
  if (access === 'admin' || access === 'superuser') return true
  return getStageOwner(task, task.status) === name
}

function StageTimeline({ task }: { task: Task }) {
  const flow = getStageFlow(task.initiator)
  const currentIdx = flow.findIndex(s => s.id === task.status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
      {flow.map((stage, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        const dotColor = done ? '#22c55e' : active ? '#6366f1' : '#e2e8f0'
        const textColor = done ? '#16a34a' : active ? '#6366f1' : '#94a3b8'
        return (
          <React.Fragment key={stage.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: dotColor, border: active ? '2px solid #6366f1' : '2px solid transparent', outline: active ? '2px solid #6366f120' : 'none' }} />
              <span style={{ fontSize: '0.55rem', color: textColor, textAlign: 'center', maxWidth: 52, lineHeight: 1.2 }}>{stage.label}</span>
            </div>
            {idx < flow.length - 1 && (
              <div style={{ flex: 1, height: 1, minWidth: 12, backgroundColor: idx < currentIdx ? '#bbf7d0' : '#e2e8f0', marginBottom: '1rem' }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function TaskModal() {
  const { selectedTaskId, tasks, currentUser, members, selectTask, moveTask, deleteTask, slaConfig } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const task = tasks.find(t => t.id === selectedTaskId)
  if (!task || !currentUser) return null

  const brand = BRAND_COLORS[task.account] ?? { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' }
  const nextStage = getNextStage(task)
  const prevStage = getPrevStage(task)
  const canMove = canCurrentUserMove(task, currentUser.name, currentUser.access)
  const daysInStage = differenceInDays(new Date(), parseISO(task.stageDate))
  const slaLimit = slaConfig[task.status] ?? 3
  const slaOver = daysInStage > slaLimit
  const assigneeMember = members.find(m => m.name === task.assignee)

  function handleMove(toStage: StageId) {
    const stageLabel = STAGE_MAP[toStage]?.label ?? toStage
    if (toStage === 'publish') {
      playVictory()
    } else {
      const nextOwner = getStageOwner(task, toStage)
      if (nextOwner === currentUser.name) playCelebration()
      else playMove()
    }
    moveTask(task.id, toStage)
    if (toStage === 'publish') {
      useStore.setState({ celebration: { taskName: task.name, stageLabel }, selectedTaskId: null })
    } else {
      selectTask(null)
    }
  }

  return (
    <div onClick={() => selectTask(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(2px)' }}>
      <div
        onClick={e => e.stopPropagation()}
        style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, paddingRight: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.1rem' }}>{CTYPE_ICONS[task.ctype]}</span>
              <span style={{ fontSize: '0.7rem', fontWeight: 600, backgroundColor: brand.bg, color: brand.text, border: `1px solid ${brand.border}`, borderRadius: 4, padding: '0.1rem 0.5rem' }}>
                {task.account}
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, backgroundColor: PRIORITY_COLORS[task.priority] + '15', color: PRIORITY_COLORS[task.priority], border: `1px solid ${PRIORITY_COLORS[task.priority]}33`, borderRadius: 4, padding: '0.1rem 0.5rem' }}>
                {task.priority}
              </span>
            </div>
            <h2 style={{ color: '#0f172a', fontSize: '1.1rem', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{task.name}</h2>
          </div>
          <button onClick={() => selectTask(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
        </div>

        <StageTimeline task={task} />

        {/* Current stage chip */}
        <div style={{ backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 10, padding: '0.6rem 0.9rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Stage</div>
            <div style={{ color: '#6366f1', fontWeight: 600, fontSize: '0.9rem' }}>{STAGE_MAP[task.status]?.label ?? task.status}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.65rem', color: slaOver ? '#ef4444' : '#94a3b8', marginBottom: '0.15rem' }}>{daysInStage}d / {slaLimit}d SLA</div>
            <div style={{ height: 4, width: 80, backgroundColor: '#e2e8f0', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(daysInStage / slaLimit, 1) * 100}%`, backgroundColor: slaOver ? '#ef4444' : daysInStage / slaLimit > 0.7 ? '#f97316' : '#22c55e', borderRadius: 99 }} />
            </div>
          </div>
        </div>

        {/* Meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'Assignee',    value: task.assignee },
            { label: 'Initiator',   value: task.initiator },
            { label: 'Due Date',    value: format(parseISO(task.due), 'dd MMM yyyy') },
            { label: 'Est. Hours',  value: `${task.hours}h` },
            { label: 'Content Type', value: task.ctype },
            { label: 'Stage Since', value: format(parseISO(task.stageDate), 'dd MMM yyyy') },
          ].map(({ label, value }) => (
            <div key={label} style={{ backgroundColor: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: 8, padding: '0.55rem 0.75rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
              <div style={{ color: '#0f172a', fontSize: '0.85rem', fontWeight: 500 }}>
                {label === 'Assignee' && assigneeMember ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: assigneeMember.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 700 }}>
                      {assigneeMember.name.slice(0, 2).toUpperCase()}
                    </div>
                    {value}
                  </div>
                ) : value}
              </div>
            </div>
          ))}
        </div>

        {/* Move actions */}
        {canMove && (
          <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
            {prevStage && (
              <button onClick={() => handleMove(prevStage)}
                style={{ flex: 1, padding: '0.65rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, color: '#64748b', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 500 }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f1f5f9' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f8fafc' }}
              >
                ← {STAGE_MAP[prevStage]?.label ?? prevStage}
              </button>
            )}
            {nextStage && (
              <button onClick={() => handleMove(nextStage)}
                style={{ flex: 1, padding: '0.65rem', backgroundColor: nextStage === 'publish' ? '#f0fdf4' : '#f5f3ff', border: `1px solid ${nextStage === 'publish' ? '#bbf7d0' : '#ddd6fe'}`, borderRadius: 10, color: nextStage === 'publish' ? '#16a34a' : '#6366f1', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = nextStage === 'publish' ? '#dcfce7' : '#ede9fe' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = nextStage === 'publish' ? '#f0fdf4' : '#f5f3ff' }}
              >
                {nextStage === 'publish' ? '🚀 ' : ''}Move to {STAGE_MAP[nextStage]?.label ?? nextStage} →
              </button>
            )}
          </div>
        )}

        {/* Admin delete */}
        {currentUser.access === 'admin' && (
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem', textAlign: 'right' }}>
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Sure?</span>
                <button onClick={() => { deleteTask(task.id); playError() }} style={{ padding: '0.35rem 0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#ef4444', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                <button onClick={() => setConfirmDelete(false)} style={{ padding: '0.35rem 0.75rem', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, color: '#64748b', fontSize: '0.78rem', cursor: 'pointer' }}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={{ background: 'none', border: 'none', color: '#cbd5e1', fontSize: '0.75rem', cursor: 'pointer' }}>Delete task</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
