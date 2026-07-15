'use client'

import { useState, useTransition } from 'react'
import type { Task, Member, Stage, StageMeta, TaskComment, SLAConfig } from '@/types/index'
import type { Brand } from '@/types/index'
import { STAGE_META, nextStageId, ALL_STAGES } from '@/lib/stage-meta'
import { ALERT_BADGE_STYLES, COLORS } from '@/lib/tokens'
import { getAlertStatus } from '@/lib/alert-status'
import { initials, avatarColor, calDaysBetween } from '@/lib/utils'
import { moveTask, addComment } from '@/actions/tasks'
import { useUIStore } from '@/store/useUIStore'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { brandGradient } from '@/lib/utils'

type FullTask = Task & {
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
}

interface TaskModalProps {
  task: FullTask
  currentUser: Member
  stages: Stage[]
  slaConfig: SLAConfig
  today: Date
  onClose: () => void
}

function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: avatarColor(name), color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.37, fontWeight: 700, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  )
}

function StageTimeline({ task }: { task: FullTask }) {
  const nineStage  = task.nine_stage
  const path: string[] = nineStage
    ? ['todo','c-prog','c-final','c-check','r-design','d-prog','d-check','final-check','publish']
    : ['todo','c-prog','c-final','r-design','d-prog','d-check','final-check','publish']
  const currentIdx = path.indexOf(task.status)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: '1.25rem', overflowX: 'auto', paddingBottom: 4 }}>
      {path.map((stageId, idx) => {
        const meta  = STAGE_META[stageId as keyof typeof STAGE_META]
        const done   = idx < currentIdx
        const active = idx === currentIdx
        const dotColor = done ? '#22c55e' : active ? COLORS.lime : COLORS.line
        const textColor = done ? '#3FA34D' : active ? COLORS.ink : COLORS.muted
        return (
          <div key={stageId} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', background: dotColor,
                border: active ? `2px solid ${COLORS.ink}` : '2px solid transparent',
                outline: active ? `2px solid ${COLORS.lime}44` : 'none',
              }} />
              <span style={{
                fontSize: '0.52rem', color: textColor, textAlign: 'center',
                maxWidth: 44, lineHeight: 1.2, fontWeight: active ? 700 : 400,
              }}>
                {meta.label_en}
              </span>
            </div>
            {idx < path.length - 1 && (
              <div style={{ width: 14, height: 1, background: idx < currentIdx ? '#BBF7D0' : COLORS.line, marginBottom: 12, flexShrink: 0 }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function TaskModal({ task, currentUser, stages: _stages, slaConfig, today, onClose }: TaskModalProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details')
  const [cmtText, setCmtText]     = useState('')
  const [isPending, startTransition] = useTransition()
  const setCelebration = useUIStore(s => s.setCelebration)

  const stageMeta   = STAGE_META[task.status]
  const nextStage   = nextStageId(task.status, task.nine_stage)
  const nextMeta    = nextStage ? STAGE_META[nextStage] : null
  const alertStatus = getAlertStatus(task, slaConfig, today)
  const badgeStyle  = ALERT_BADGE_STYLES[alertStatus]
  const daysLeft    = calDaysBetween(today, new Date(task.due_date))
  const overdue     = daysLeft < 0

  const isAdmin    = currentUser.access === 'admin'
  const isSuperuser = currentUser.access === 'superuser'
  const isPublished = task.status === 'publish'

  // Own-stage check: working stage → task owner; review stage → role match
  const isOwnStage = stageMeta.owner_role === null
    ? task.task_owner_id === currentUser.id
    : stageMeta.owner_role === currentUser.role

  const canAdvance = !isPublished && nextStage !== null && (isOwnStage || isAdmin || isSuperuser)
  const isOverride = canAdvance && !isOwnStage && (isAdmin || isSuperuser)

  function handleAdvance() {
    if (!canAdvance) return
    startTransition(async () => {
      const result = await moveTask(task.id)
      if (result.success) {
        if (result.shouldCelebrate && nextMeta) {
          const payload = { taskName: task.name, stageLabel: nextMeta.label_en }
          // Direct call for immediate same-tab response
          setCelebration(payload)
          // Broadcast to user-scoped channel for cross-tab sync
          const supabase = getSupabaseBrowserClient()
          const ch = supabase.channel(`celebration-${currentUser.id}`, {
            config: { broadcast: { selfBroadcast: false } },
          })
          ch.subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              ch.send({ type: 'broadcast', event: 'celebration', payload })
              setTimeout(() => supabase.removeChannel(ch), 3000)
            }
          })
        }
        onClose()
      }
    })
  }

  function handleComment() {
    const text = cmtText.trim()
    if (!text) return
    startTransition(async () => {
      await addComment(task.id, text)
      setCmtText('')
    })
  }

  const TAB = (tab: typeof activeTab) => ({
    padding: '0.4rem 0.85rem', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: '0.78rem', fontWeight: activeTab === tab ? 700 : 500,
    background: activeTab === tab ? COLORS.ink : 'transparent',
    color: activeTab === tab ? COLORS.lime : COLORS.muted,
    transition: 'all 0.12s', fontFamily: 'inherit',
  })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)',
        zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.5rem', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 22, width: '100%', maxWidth: 560,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 1px 2px rgba(26,28,30,.04), 0 20px 60px rgba(26,28,30,.18)',
        }}
      >
        {/* Cover area — uses cover image or brand gradient fallback (spec.md FR-011) */}
        {(() => {
          const coverBg = task.cover_image_url
            ? `url(${task.cover_image_url}) center/cover no-repeat`
            : brandGradient(task.brand.color)
          const brandLabel = task.brand.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
          return (
            <div style={{ position: 'relative', height: 72, background: coverBg, borderRadius: '22px 22px 0 0', overflow: 'hidden' }}>
              {!task.cover_image_url && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: `${task.brand.color}99`, letterSpacing: '-0.03em' }}>
                    {brandLabel}
                  </span>
                </div>
              )}
              {/* Brand color accent bar at bottom */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: task.brand.color }} />
            </div>
          )
        })()}

        <div style={{ padding: '1.5rem 1.5rem 0.75rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ flex: 1, paddingRight: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, background: `${task.brand.color}18`, color: task.brand.color, borderRadius: 5, padding: '0.1rem 0.5rem' }}>
                  {task.brand.name}
                </span>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, background: badgeStyle.bg, color: badgeStyle.text, borderRadius: 5, padding: '0.1rem 0.5rem' }}>
                  {alertStatus}
                </span>
                <span style={{ fontSize: '0.62rem', fontWeight: 600, background: '#F1F1EF', color: COLORS.ink, borderRadius: 5, padding: '0.1rem 0.5rem' }}>
                  {task.priority}
                </span>
              </div>
              <h2 style={{ color: COLORS.ink, fontSize: '1.05rem', fontWeight: 800, margin: 0, lineHeight: 1.3 }}>
                {task.name}
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Close task modal"
              style={{ background: '#F7F7F7', border: 'none', color: COLORS.muted, cursor: 'pointer', fontSize: '0.9rem', padding: '0.4rem', borderRadius: 8 }}
            >
              ✕
            </button>
          </div>

          <StageTimeline task={task} />

          {/* Current stage chip */}
          <div style={{
            background: `${stageMeta.color}10`, border: `1px solid ${stageMeta.color}33`,
            borderRadius: 12, padding: '0.65rem 0.9rem', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '0.6rem', color: COLORS.muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Current Stage
              </div>
              <div style={{ color: stageMeta.color, fontWeight: 700, fontSize: '0.9rem' }}>
                {stageMeta.label_en}
              </div>
              <div style={{ fontFamily: 'var(--font-accent)', fontSize: '0.72rem', color: stageMeta.color, direction: 'rtl' }}>
                {stageMeta.label_ar}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.62rem', color: overdue ? '#ef4444' : COLORS.muted, marginBottom: 2 }}>
                {Math.abs(daysLeft)}d {overdue ? 'overdue' : 'left'}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', background: '#F7F7F7', borderRadius: 10, padding: 4 }}>
            <button onClick={() => setActiveTab('details')} style={TAB('details')}>Details</button>
            <button onClick={() => setActiveTab('comments')} style={TAB('comments')}>
              Comments{task.comments.length > 0 ? ` (${task.comments.length})` : ''}
            </button>
          </div>

          {/* Details tab */}
          {activeTab === 'details' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: '1.1rem' }}>
              {[
                { label: 'Task Owner', value: task.task_owner.name },
                { label: 'Content Type', value: task.content_type_label },
                { label: 'Due Date', value: new Date(task.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
                { label: 'Est. Hours', value: `${task.hours_estimate}h` },
                { label: 'Stage Since', value: new Date(task.stage_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) },
                { label: 'Pipeline', value: task.nine_stage ? '9-stage' : '8-stage' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: '#F7F7F7', border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: '0.55rem 0.75rem' }}>
                  <div style={{ fontSize: '0.6rem', color: COLORS.muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {label}
                  </div>
                  <div style={{ color: COLORS.ink, fontSize: '0.82rem', fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Comments tab */}
          {activeTab === 'comments' && (
            <div style={{ marginBottom: '1rem' }}>
              {task.comments.length === 0 && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#C4C4BE', fontSize: '0.78rem' }}>
                  No comments yet
                </div>
              )}
              {task.comments.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                  <Avatar name={c.author?.name ?? 'Unknown'} size={28} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: COLORS.ink }}>
                        {c.author?.name ?? 'Unknown'}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: COLORS.muted }}>
                        {new Date(c.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                    <div style={{
                      fontSize: '0.8rem', color: COLORS.ink, lineHeight: 1.5,
                      background: '#F7F7F7', borderRadius: 10, padding: '0.55rem 0.75rem',
                    }}>
                      {c.body}
                    </div>
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  value={cmtText}
                  onChange={e => setCmtText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleComment() }}
                  placeholder="Add a comment..."
                  style={{
                    flex: 1, padding: '0.55rem 0.75rem',
                    background: '#F7F7F7', border: `1px solid ${COLORS.line}`, borderRadius: 10,
                    fontSize: '0.82rem', outline: 'none', color: COLORS.ink, fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleComment}
                  disabled={isPending || !cmtText.trim()}
                  style={{
                    padding: '0.55rem 1rem', background: COLORS.ink, border: 'none',
                    borderRadius: 10, color: COLORS.lime, fontSize: '0.78rem', fontWeight: 700,
                    cursor: 'pointer', fontFamily: 'inherit', opacity: isPending ? 0.6 : 1,
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          )}

          {/* Advance button — only when not Published and user can advance */}
          {canAdvance && nextMeta && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <button
                onClick={handleAdvance}
                disabled={isPending}
                style={{
                  width: '100%', padding: '0.7rem',
                  background: isOverride ? COLORS.ink : COLORS.lime,
                  border: 'none', borderRadius: 14,
                  color: isOverride ? COLORS.lime : COLORS.ink,
                  fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: isOverride
                    ? '0 4px 14px rgba(17,17,17,.25)'
                    : '0 4px 14px rgba(200,242,78,.4)',
                  opacity: isPending ? 0.7 : 1,
                  transition: 'opacity 0.12s',
                }}
              >
                {isOverride ? '⚡ Admin: ' : ''}Move to {nextMeta.label_en}
                {nextStage === 'publish' ? ' 🚀' : ' →'}
              </button>
              {isOverride && (
                <p style={{ fontSize: '0.62rem', color: COLORS.muted, marginTop: 4, textAlign: 'center' }}>
                  Admin override — celebration will not fire
                </p>
              )}
            </div>
          )}

          {isPublished && (
            <div style={{
              textAlign: 'center', padding: '0.6rem',
              background: '#F0FDF4', borderRadius: 10,
              color: '#15803D', fontSize: '0.78rem', fontWeight: 600, marginBottom: 8,
            }}>
              ✓ Published — this task is complete
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
