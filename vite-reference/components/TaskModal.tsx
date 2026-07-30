import React, { useState, useRef } from 'react'
import { useStore } from '../store/useStore'
import { getNextStage, getPrevStage, getStageOwner, STAGE_MAP, getStageFlow } from '../data/stages'
import { Task, StageId } from '../types'
import { playMove, playVictory, playCelebration, playError } from '../lib/sounds'
import { differenceInDays, parseISO, format } from 'date-fns'

const UI = {
  ink: '#1B1A13',
  muted: '#8A8D91',
  soft: '#F7F7F7',
  line: '#E1E1E0',
  lime: '#C3F53D',
  dark: '#111111',
  cardShadow: '0 1px 2px rgba(26,28,30,.04), 0 20px 60px rgba(26,28,30,.18)',
}

const BRAND_COLORS: Record<string, string> = {
  'Islam Personal Branding':  '#1E293B',
  'The Strategy Community':   '#7A5A2E',
  'Omnisight':                '#0E7C7B',
  'Forefront':                '#B4322F',
}

const PRIORITY_COLOR: Record<string, string> = {
  High: '#D57D6F', Medium: '#E0A23F', Low: '#7C8288',
}

const CTYPE_EMOJI: Record<string, string> = {
  Post: '📝', Video: '🎬', Reel: '🎞️', Design: '🎨',
  Email: '📧', Story: '📖', Deck: '📊', Other: '📌',
}

const STAGE_META: Record<string, { color: string }> = {
  'todo':        { color: '#64748B' },
  'c-prog':      { color: '#3B82F6' },
  'c-final':     { color: '#2E6FB0' },
  'c-check':     { color: '#1F5A94' },
  'r-design':    { color: '#8B5CF6' },
  'd-prog':      { color: '#7C3AED' },
  'd-check':     { color: '#5B3FB5' },
  'final-check': { color: '#F59E0B' },
  'publish':     { color: '#22C55E' },
}

function canCurrentUserMove(task: Task, name: string, access: string): boolean {
  if (access === 'admin' || access === 'superuser') return true
  return getStageOwner(task, task.status) === name
}

function StageTimeline({ task }: { task: Task }) {
  const flow = getStageFlow(task.initiator)
  const currentIdx = flow.findIndex(s => s.id === task.status)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
      {flow.map((stage, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        const dotColor = done ? '#22c55e' : active ? UI.lime : '#E1E1E0'
        const textColor = done ? '#3FA34D' : active ? UI.ink : UI.muted
        return (
          <React.Fragment key={stage.id}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', backgroundColor: dotColor,
                border: active ? '2px solid #111111' : '2px solid transparent',
                outline: active ? '2px solid rgba(195,245,61,0.3)' : 'none',
              }} />
              <span style={{ fontSize: '0.52rem', color: textColor, textAlign: 'center', maxWidth: 52, lineHeight: 1.2, fontWeight: active ? 700 : 400 }}>
                {stage.label}
              </span>
            </div>
            {idx < flow.length - 1 && (
              <div style={{ flex: 1, height: 1, minWidth: 10, backgroundColor: idx < currentIdx ? '#BBF7D0' : '#E1E1E0', marginBottom: '1rem' }} />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

export function TaskModal() {
  const {
    selectedTaskId, tasks, currentUser, selectTask, moveTask, deleteTask, slaConfig,
    addComment, addAttachment, removeAttachment,
  } = useStore()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [cmtText, setCmtText] = useState('')
  const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'attachments'>('details')
  const fileRef = useRef<HTMLInputElement>(null)

  const task = tasks.find(t => t.id === selectedTaskId)
  if (!task || !currentUser) return null

  const brandColor = BRAND_COLORS[task.account] || '#94A3B8'
  const nextStage = getNextStage(task)
  const prevStage = getPrevStage(task)
  const canMove = canCurrentUserMove(task, currentUser.name, currentUser.access)
  const daysInStage = differenceInDays(new Date(), parseISO(task.stageDate))
  const slaLimit = slaConfig[task.status] ?? 3
  const slaOver = daysInStage > slaLimit
  const stageMeta = STAGE_META[task.status] || { color: '#94A3B8' }
  const comments = task.comments || []
  const attachments = task.attachments || []

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

  function submitComment() {
    const text = cmtText.trim()
    if (!text) return
    addComment(task.id, {
      who: currentUser.name,
      text,
      when: format(new Date(), 'MMM d'),
    })
    setCmtText('')
  }

  const TAB_STYLE = (active: boolean) => ({
    padding: '0.45rem 0.9rem', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: '0.78rem', fontWeight: active ? 700 : 500,
    background: active ? UI.dark : 'transparent',
    color: active ? UI.lime : UI.muted,
    transition: 'all 0.12s', fontFamily: 'inherit',
  })

  return (
    <div
      onClick={() => selectTask(null)}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.45)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#fff', borderRadius: 22, width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: UI.cardShadow,
          fontFamily: "'Montserrat','Inter',system-ui,sans-serif",
        }}
      >
        {/* Brand color bar */}
        <div style={{ height: 5, background: brandColor, borderRadius: '22px 22px 0 0' }} />

        <div style={{ padding: '1.5rem 1.5rem 0.75rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ flex: 1, paddingRight: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '1.1rem' }}>{CTYPE_EMOJI[task.ctype] || '📌'}</span>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, background: `${brandColor}14`, color: brandColor, borderRadius: 5, padding: '0.1rem 0.5rem' }}>
                  {task.account}
                </span>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, background: `${PRIORITY_COLOR[task.priority]}15`, color: PRIORITY_COLOR[task.priority], borderRadius: 5, padding: '0.1rem 0.5rem' }}>
                  {task.priority}
                </span>
                {task.campaign && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 600, background: '#EFE7FD', color: '#6D4FD0', borderRadius: 5, padding: '0.1rem 0.5rem' }}>
                    {task.campaign}
                  </span>
                )}
              </div>
              <h2 style={{ color: UI.ink, fontSize: '1.05rem', fontWeight: 800, margin: 0, lineHeight: 1.3 }}>{task.name}</h2>
            </div>
            <button
              onClick={() => selectTask(null)}
              style={{ background: UI.soft, border: 'none', color: UI.muted, cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1, padding: '0.4rem', borderRadius: 8 }}
            >✕</button>
          </div>

          <StageTimeline task={task} />

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', background: '#F7F7F7', borderRadius: 10, padding: 4 }}>
            {(['details', 'comments', 'attachments'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={TAB_STYLE(activeTab === tab)}>
                {tab === 'comments' ? `Comments ${comments.length > 0 ? `(${comments.length})` : ''}` :
                 tab === 'attachments' ? `Files ${attachments.length > 0 ? `(${attachments.length})` : ''}` :
                 'Details'}
              </button>
            ))}
          </div>

          {/* Details tab */}
          {activeTab === 'details' && (
            <>
              {/* Current stage chip */}
              <div style={{
                background: `${stageMeta.color}10`, border: `1px solid ${stageMeta.color}33`,
                borderRadius: 12, padding: '0.65rem 0.9rem', marginBottom: '1.1rem',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: '0.6rem', color: UI.muted, marginBottom: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Stage</div>
                  <div style={{ color: stageMeta.color, fontWeight: 700, fontSize: '0.9rem' }}>{STAGE_MAP[task.status]?.label ?? task.status}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.62rem', color: slaOver ? '#ef4444' : UI.muted, marginBottom: '0.15rem' }}>{daysInStage}d / {slaLimit}d SLA</div>
                  <div style={{ height: 4, width: 72, backgroundColor: '#E1E1E0', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(daysInStage / slaLimit, 1) * 100}%`, backgroundColor: slaOver ? '#ef4444' : daysInStage / slaLimit > 0.7 ? '#f97316' : '#22c55e', borderRadius: 99 }} />
                  </div>
                </div>
              </div>

              {/* Meta grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginBottom: '1.1rem' }}>
                {[
                  { label: 'Assignee',      value: task.assignee },
                  { label: 'Initiator',     value: task.initiator },
                  { label: 'Due Date',      value: format(parseISO(task.due), 'dd MMM yyyy') },
                  { label: 'Est. Hours',    value: `${task.hours}h` },
                  { label: 'Content Type',  value: task.ctype },
                  { label: 'Stage Since',   value: format(parseISO(task.stageDate), 'dd MMM yyyy') },
                ].map(({ label, value }) => (
                  <div key={label} style={{ background: UI.soft, border: `1px solid ${UI.line}`, borderRadius: 10, padding: '0.55rem 0.75rem' }}>
                    <div style={{ fontSize: '0.6rem', color: UI.muted, marginBottom: '0.2rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                    <div style={{ color: UI.ink, fontSize: '0.82rem', fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Comments tab */}
          {activeTab === 'comments' && (
            <div style={{ marginBottom: '1rem' }}>
              {comments.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#C4C4BE', fontSize: '0.78rem' }}>No comments yet</div>
              )}
              {comments.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4A4740', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.58rem', fontWeight: 700, flexShrink: 0 }}>
                    {c.who.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: UI.ink }}>{c.who}</span>
                      <span style={{ fontSize: '0.65rem', color: UI.muted }}>{c.when}</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: UI.ink, lineHeight: 1.5, background: UI.soft, borderRadius: 10, padding: '0.55rem 0.75rem' }}>{c.text}</div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  value={cmtText}
                  onChange={e => setCmtText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitComment() }}
                  placeholder="Add a comment..."
                  style={{ flex: 1, padding: '0.55rem 0.75rem', background: UI.soft, border: `1px solid ${UI.line}`, borderRadius: 10, fontSize: '0.82rem', outline: 'none', color: UI.ink, fontFamily: 'inherit' }}
                />
                <button
                  onClick={submitComment}
                  style={{ padding: '0.55rem 1rem', background: UI.dark, border: 'none', borderRadius: 10, color: UI.lime, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Attachments tab */}
          {activeTab === 'attachments' && (
            <div style={{ marginBottom: '1rem' }}>
              {attachments.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#C4C4BE', fontSize: '0.78rem' }}>No files attached</div>
              )}
              {attachments.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: UI.soft, border: `1px solid ${UI.line}`, borderRadius: 10, padding: '0.55rem 0.75rem', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: '0.9rem' }}>📎</span>
                    <span style={{ fontSize: '0.8rem', color: UI.ink, fontWeight: 500 }}>{f}</span>
                  </div>
                  {(currentUser.access === 'admin' || currentUser.access === 'superuser') && (
                    <button
                      onClick={() => removeAttachment(task.id, i)}
                      style={{ background: 'none', border: 'none', color: UI.muted, cursor: 'pointer', fontSize: '0.8rem' }}
                    >✕</button>
                  )}
                </div>
              ))}
              <input ref={fileRef} type="file" multiple style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files || []).map(f => f.name)
                  if (files.length) addAttachment(task.id, files)
                  if (fileRef.current) fileRef.current.value = ''
                }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                style={{ width: '100%', padding: '0.6rem', background: UI.soft, border: `1px dashed ${UI.line}`, borderRadius: 10, color: UI.muted, fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                + Attach file
              </button>
            </div>
          )}

          {/* Move actions */}
          {canMove && (
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.75rem' }}>
              {prevStage && (
                <button
                  onClick={() => handleMove(prevStage)}
                  style={{ flex: 1, padding: '0.6rem', background: UI.soft, border: `1px solid ${UI.line}`, borderRadius: 12, color: UI.muted, fontSize: '0.78rem', cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#EFEFEA'}
                  onMouseLeave={e => e.currentTarget.style.background = UI.soft}
                >
                  ← {STAGE_MAP[prevStage]?.label ?? prevStage}
                </button>
              )}
              {nextStage && (
                <button
                  onClick={() => handleMove(nextStage)}
                  style={{
                    flex: 1, padding: '0.6rem',
                    background: nextStage === 'publish' ? '#C3F53D' : UI.dark,
                    border: 'none', borderRadius: 12,
                    color: nextStage === 'publish' ? UI.dark : UI.lime,
                    fontSize: '0.78rem', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit',
                    boxShadow: nextStage === 'publish' ? '0 4px 14px rgba(195,245,61,.4)' : '0 4px 14px rgba(17,17,17,.25)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                >
                  {nextStage === 'publish' ? '🚀 ' : ''}Move to {STAGE_MAP[nextStage]?.label ?? nextStage} →
                </button>
              )}
            </div>
          )}

          {/* Admin delete */}
          {currentUser.access === 'admin' && (
            <div style={{ borderTop: `1px solid ${UI.line}`, paddingTop: '0.65rem', textAlign: 'right' }}>
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <span style={{ color: '#ef4444', fontSize: '0.78rem' }}>Sure?</span>
                  <button
                    onClick={() => { deleteTask(task.id); playError() }}
                    style={{ padding: '0.3rem 0.7rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}
                  >Delete</button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{ padding: '0.3rem 0.7rem', background: UI.soft, border: `1px solid ${UI.line}`, borderRadius: 8, color: UI.muted, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}
                  >Cancel</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ background: 'none', border: 'none', color: '#C4C4BE', fontSize: '0.72rem', cursor: 'pointer', fontFamily: 'inherit' }}
                >Delete task</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
