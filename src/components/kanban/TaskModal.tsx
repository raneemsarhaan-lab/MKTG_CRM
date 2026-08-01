'use client'

import { useState, useTransition } from 'react'
import type { Task, Member, Stage, TaskComment, SLAConfig } from '@/types/index'
import type { Brand } from '@/types/index'
import { STAGE_META, nextStageId } from '@/lib/stage-meta'
import { ALERT_BADGE_STYLES, COLORS } from '@/lib/tokens'
import { getAlertStatus } from '@/lib/alert-status'
import { initials, avatarColor, calDaysBetween } from '@/lib/utils'
import { moveTask, addComment, updateTask, type TaskPatch } from '@/actions/tasks'
import { InlineValue } from './EditableCell'
import { useUIStore } from '@/store/useUIStore'
import { brandGradient } from '@/lib/utils'

type FullTask = Task & {
  brand: Brand
  task_owner: Member
  comments: (TaskComment & { author: Member })[]
}

const PLATFORMS  = ['LinkedIn', 'Instagram', 'TikTok', 'Facebook', 'Twitter', 'YouTube', 'Email']
const PRIORITIES = ['High', 'Medium', 'Low']

interface TaskModalProps {
  task: FullTask
  currentUser: Member
  stages: Stage[]
  slaConfig: SLAConfig
  today: Date
  onClose: () => void
  /** Option sources for the inline editors. */
  brands?: Brand[]
  members?: Member[]
  contentTypes?: { id: string; label: string }[]
}

/** Label/value attribute row — wireframe 1d's left pane. */
function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '150px 1fr',
      alignItems: 'center', gap: 8, minHeight: 34,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        fontSize: '0.78rem', color: COLORS.muted,
      }}>
        <span aria-hidden="true" style={{ width: 14, textAlign: 'center', opacity: .8 }}>{icon}</span>
        {label}
      </div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
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

export function TaskModal({
  task, currentUser, stages: _stages, slaConfig, today, onClose,
  brands = [], members = [], contentTypes = [],
}: TaskModalProps) {
  const [cmtText, setCmtText]     = useState('')
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefText, setBriefText]       = useState('')
  const [briefError, setBriefError]     = useState('')
  const [editingName, setEditingName]   = useState(false)
  const [nameText, setNameText]         = useState('')
  const [isPending, startTransition] = useTransition()
  const setCelebration = useUIStore(s => s.setCelebration)

  const stageMeta   = STAGE_META[task.status]
  const nextStage   = nextStageId(task.status, task.nine_stage)
  const nextMeta    = nextStage ? STAGE_META[nextStage] : null
  const alertStatus = getAlertStatus(task, slaConfig, today)
  const badgeStyle  = ALERT_BADGE_STYLES[alertStatus]
  const daysLeft    = calDaysBetween(today, new Date(task.due_date))
  const overdue     = daysLeft < 0

  // Mirrors updateTask's server-side check — the server one is authoritative.
  const canEditBrief =
    task.task_owner_id === currentUser.id ||
    currentUser.access === 'admin' ||
    currentUser.access === 'superuser'

  function applyPatch(patch: TaskPatch, after?: () => void) {
    setBriefError('')
    startTransition(async () => {
      const res = await updateTask(task.id, patch)
      if (res.success) after?.()
      else setBriefError(res.error ?? 'Could not save the change')
    })
  }

  function saveBrief() {
    applyPatch({ description: briefText }, () => setEditingBrief(false))
  }

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
          background: '#fff', borderRadius: 18, width: '100%', maxWidth: 1000,
          height: '90vh', display: 'flex', overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(26,28,30,.04), 0 20px 60px rgba(26,28,30,.18)',
        }}
      >
        {/* ── LEFT PANE — attributes (~57%) ─────────────────────────────── */}
        <div style={{ flex: '0 0 57%', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Pinned header: breadcrumb + close */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderBottom: `1px solid ${COLORS.line}`, flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: '0.72rem' }}>
              <span style={{
                width: 9, height: 9, borderRadius: 3, background: task.brand.color, flexShrink: 0,
              }} />
              <span style={{ color: COLORS.ink, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {task.brand.name}
              </span>
              <span style={{ color: COLORS.muted }}>/</span>
              <span style={{ color: COLORS.muted, whiteSpace: 'nowrap' }}>{task.content_type_label}</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close task"
              style={{
                background: '#F4F4F2', border: 'none', color: COLORS.muted, cursor: 'pointer',
                fontSize: '0.85rem', width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>

          {/* Scrolls independently */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Cover — image when set, brand gradient otherwise (spec.md FR-011) */}
            <div style={{
              height: 64, flexShrink: 0, position: 'relative',
              background: task.cover_image_url
                ? `url(${task.cover_image_url}) center/cover no-repeat`
                : brandGradient(task.brand.color),
            }}>
              <div style={{
                position: 'absolute', bottom: 0, insetInline: 0, height: 3,
                background: task.brand.color,
              }} />
            </div>

            <div style={{ padding: '18px 20px 24px' }}>
            {/* Title */}
            {editingName ? (
              <input
                value={nameText}
                autoFocus
                onChange={e => setNameText(e.target.value)}
                onBlur={() => {
                  setEditingName(false)
                  if (nameText.trim() && nameText !== task.name) applyPatch({ name: nameText })
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter')  { e.preventDefault(); e.currentTarget.blur() }
                  if (e.key === 'Escape') { setNameText(task.name); setEditingName(false) }
                }}
                style={{
                  color: COLORS.ink, fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.25,
                  width: '100%', fontFamily: 'var(--font-heading)', background: '#fff',
                  border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: '2px 6px',
                  outline: 'none', boxSizing: 'border-box', marginBottom: 18,
                }}
              />
            ) : (
              <h2
                onClick={() => { if (canEditBrief) { setNameText(task.name); setEditingName(true) } }}
                title={canEditBrief ? 'Click to rename' : undefined}
                style={{
                  color: COLORS.ink, fontFamily: 'var(--font-heading)', fontSize: '1.5rem',
                  fontWeight: 800, margin: '0 0 18px', lineHeight: 1.25,
                  cursor: canEditBrief ? 'pointer' : 'default',
                }}
              >
                {task.name}
              </h2>
            )}

            {/* Pipeline progress — Fluxo-specific, kept because a staged
                workflow is the point of this product; ClickUp has no analogue. */}
            <StageTimeline task={task} />

            {/* Attribute rows */}
            <Row icon="◎" label="Status">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  background: `${stageMeta.color}1A`, color: stageMeta.color,
                  fontWeight: 700, fontSize: '0.72rem', letterSpacing: '.03em',
                  borderRadius: 6, padding: '3px 10px', textTransform: 'uppercase',
                }}>
                  {stageMeta.label_en}
                </span>
                {canAdvance && nextMeta && (
                  <button
                    onClick={handleAdvance}
                    disabled={isPending}
                    title={`Move to ${nextMeta.label_en}`}
                    style={{
                      background: isOverride ? COLORS.ink : COLORS.lime,
                      color: isOverride ? COLORS.lime : COLORS.ink,
                      border: 'none', borderRadius: 6, cursor: 'pointer',
                      fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px',
                      fontFamily: 'inherit', opacity: isPending ? 0.7 : 1,
                    }}
                  >
                    {isOverride ? '⚡ ' : ''}→ {nextMeta.label_en}
                  </button>
                )}
                <span style={{ fontSize: '0.68rem', color: overdue ? '#ef4444' : COLORS.muted }}>
                  {Math.abs(daysLeft)}d {overdue ? 'overdue' : 'left'}
                </span>
              </div>
            </Row>

            <Row icon="☺" label="Assignee">
              <InlineValue
                canEdit={canEditBrief} type="select"
                value={task.task_owner_id}
                display={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <Avatar name={task.task_owner.name} size={20} />
                    {task.task_owner.name}
                  </span>
                }
                options={members.map(m => ({ value: m.id, label: m.name }))}
                onCommit={v => applyPatch({ task_owner_id: v })}
              />
            </Row>

            <Row icon="▦" label="Due date">
              <InlineValue
                canEdit={canEditBrief} type="date" value={task.due_date}
                display={new Date(task.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                onCommit={v => applyPatch({ due_date: v })}
              />
            </Row>

            <Row icon="⚑" label="Priority">
              <InlineValue
                canEdit={canEditBrief} type="select" value={task.priority} display={task.priority}
                options={PRIORITIES.map(p => ({ value: p, label: p }))}
                onCommit={v => applyPatch({ priority: v as 'Low' | 'Medium' | 'High' })}
              />
            </Row>

            <Row icon="⏱" label="Time estimate">
              <InlineValue
                canEdit={canEditBrief} type="number" min={0} step={0.5}
                value={task.hours_estimate} display={`${task.hours_estimate}h`}
                onCommit={v => applyPatch({ hours_estimate: parseFloat(v) })}
              />
            </Row>

            <Row icon="◆" label="Brand">
              <InlineValue
                canEdit={canEditBrief} type="select" value={task.brand_id} display={task.brand?.name}
                options={brands.map(b => ({ value: b.id, label: b.name }))}
                onCommit={v => applyPatch({ brand_id: v })}
              />
            </Row>

            <Row icon="▣" label="Content type">
              <InlineValue
                canEdit={canEditBrief} type="select" value={task.content_type_label}
                display={task.content_type_label}
                options={contentTypes.map(c => ({ value: c.label, label: c.label }))}
                onCommit={v => applyPatch({ content_type_label: v })}
              />
            </Row>

            <Row icon="◈" label="Platform">
              <InlineValue
                canEdit={canEditBrief} type="select" value={task.platform ?? ''} display={task.platform}
                options={PLATFORMS.map(p => ({ value: p, label: p }))}
                onCommit={v => applyPatch({ platform: v })}
              />
            </Row>

            <Row icon="≡" label="Campaign">
              <InlineValue
                canEdit={canEditBrief} type="text" value={task.campaign ?? ''} display={task.campaign}
                placeholder="e.g. Brand Launch"
                onCommit={v => applyPatch({ campaign: v })}
              />
            </Row>

            <Row icon="▤" label="Cover image">
              <InlineValue
                canEdit={canEditBrief} type="text" value={task.cover_image_url ?? ''}
                display={task.cover_image_url} placeholder="https://…"
                onCommit={v => applyPatch({ cover_image_url: v })}
              />
            </Row>

            {/* Read-only — the SLA clock and the pipeline shape */}
            <Row icon="◔" label="Stage since">
              <span style={{ fontSize: '0.82rem', color: COLORS.muted, padding: '3px 6px', display: 'inline-block' }}>
                {new Date(task.stage_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </Row>
            <Row icon="⋔" label="Pipeline">
              <span style={{ fontSize: '0.82rem', color: COLORS.muted, padding: '3px 6px', display: 'inline-block' }}>
                {task.nine_stage ? '9-stage' : '8-stage'}
              </span>
            </Row>

            {briefError && (
              <p role="alert" style={{ color: '#ef4444', fontSize: '0.72rem', margin: '8px 0 0' }}>
                {briefError}
              </p>
            )}

            <div style={{ borderTop: `1px solid ${COLORS.line}`, margin: '18px 0 14px' }} />

            {/* Brief */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
            }}>
              <span style={{
                fontSize: '0.6rem', color: COLORS.muted, textTransform: 'uppercase',
                letterSpacing: '0.05em', fontWeight: 700,
              }}>
                Brief
              </span>
              {canEditBrief && !editingBrief && (
                <button
                  onClick={() => { setBriefText(task.description ?? ''); setEditingBrief(true) }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    fontSize: '0.68rem', fontWeight: 700, color: COLORS.muted, fontFamily: 'inherit',
                  }}
                >
                  {task.description ? 'Edit' : '+ Add brief'}
                </button>
              )}
            </div>

            {editingBrief ? (
              <div>
                <textarea
                  value={briefText}
                  onChange={e => setBriefText(e.target.value)}
                  autoFocus
                  rows={5}
                  placeholder="What needs making, for whom, and any constraints…"
                  style={{
                    width: '100%', padding: '0.6rem 0.7rem', borderRadius: 10,
                    border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.ink,
                    fontSize: '0.85rem', lineHeight: 1.55, fontFamily: 'inherit',
                    outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={saveBrief}
                    disabled={isPending}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: 8, border: 'none',
                      background: COLORS.ink, color: COLORS.lime, fontWeight: 700,
                      fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                      opacity: isPending ? 0.7 : 1,
                    }}
                  >
                    {isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditingBrief(false)}
                    style={{
                      padding: '0.4rem 0.9rem', borderRadius: 8,
                      border: `1px solid ${COLORS.line}`, background: '#fff', color: COLORS.muted,
                      fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p style={{
                color: task.description ? COLORS.ink : COLORS.muted,
                fontSize: '0.85rem', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap',
                fontStyle: task.description ? 'normal' : 'italic',
              }}>
                {task.description || 'No brief yet.'}
              </p>
            )}

            {isPublished && (
              <div style={{
                textAlign: 'center', padding: '0.6rem', background: '#F0FDF4',
                borderRadius: 10, color: '#15803D', fontSize: '0.78rem',
                fontWeight: 600, marginTop: 18,
              }}>
                ✓ Published — this task is complete
              </div>
            )}
            </div>
          </div>
        </div>

        {/* ── RIGHT PANE — activity (~43%) ──────────────────────────────── */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          borderInlineStart: `1px solid ${COLORS.line}`, background: '#FCFCFB', minWidth: 0,
        }}>
          <div style={{
            padding: '14px 18px', borderBottom: `1px solid ${COLORS.line}`,
            fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.9rem',
            color: COLORS.ink, flexShrink: 0,
          }}>
            Activity
          </div>

          {/* Scrolls independently */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
            <div style={{ fontSize: '0.7rem', color: COLORS.muted, marginBottom: 14 }}>
              Created by {task.task_owner.name} ·{' '}
              {new Date(task.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </div>

            {task.comments.length === 0 && (
              <div style={{ color: '#C4C4BE', fontSize: '0.78rem', padding: '0.5rem 0' }}>
                No comments yet
              </div>
            )}

            {task.comments.map(c => (
              <div key={c.id} style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <Avatar name={c.author?.name ?? 'Unknown'} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: COLORS.ink }}>
                      {c.author?.name ?? 'Unknown'}
                    </span>
                    <span style={{ fontSize: '0.64rem', color: COLORS.muted }}>
                      {new Date(c.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '0.8rem', color: COLORS.ink, lineHeight: 1.5,
                    background: '#fff', border: `1px solid ${COLORS.line}`,
                    borderRadius: 10, padding: '0.5rem 0.7rem',
                  }}>
                    {c.body}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pinned composer */}
          <div style={{
            padding: '12px 18px', borderTop: `1px solid ${COLORS.line}`,
            display: 'flex', gap: 8, flexShrink: 0, background: '#fff',
          }}>
            <input
              value={cmtText}
              onChange={e => setCmtText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleComment() }}
              placeholder="Write a comment…"
              style={{
                flex: 1, minWidth: 0, padding: '0.55rem 0.75rem', background: '#F7F7F7',
                border: `1px solid ${COLORS.line}`, borderRadius: 10, fontSize: '0.8rem',
                outline: 'none', color: COLORS.ink, fontFamily: 'inherit',
              }}
            />
            <button
              onClick={handleComment}
              disabled={isPending || !cmtText.trim()}
              style={{
                padding: '0.55rem 0.9rem', background: COLORS.ink, border: 'none',
                borderRadius: 10, color: COLORS.lime, fontSize: '0.76rem', fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                opacity: isPending || !cmtText.trim() ? 0.5 : 1,
              }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
