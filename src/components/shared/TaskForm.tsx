'use client'

import { useState, useTransition } from 'react'
import type { Member, Brand, ContentType } from '@/types/index'
import { createTask } from '@/actions/tasks'
import { useUIStore } from '@/store/useUIStore'
import { COLORS } from '@/lib/tokens'

interface TaskFormProps {
  currentUser: Member
  brands: Brand[]
  contentTypes: ContentType[]
  members: Member[]
}

const FIELD: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem',
  background: '#F7F7F7', border: `1px solid ${COLORS.line}`, borderRadius: 10,
  color: COLORS.ink, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
}
const LBL: React.CSSProperties = {
  display: 'block', fontSize: '0.62rem', color: COLORS.muted,
  marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
}

const PLATFORMS = ['LinkedIn', 'Instagram', 'TikTok', 'Facebook', 'Twitter', 'YouTube', 'Email'] as const
const PRIORITIES = ['High', 'Medium', 'Low'] as const

export function TaskForm({ currentUser, brands, contentTypes, members }: TaskFormProps) {
  const setShowTaskForm = useUIStore(s => s.setShowTaskForm)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    name: '',
    brand_id: brands[0]?.id ?? '',
    content_type_label: contentTypes[0]?.label ?? 'Post',
    platform: 'LinkedIn' as typeof PLATFORMS[number],
    task_owner_id: members[0]?.id ?? '',
    due_date: today,
    hours_estimate: 2,
    priority: 'Medium' as typeof PRIORITIES[number],
    campaign: '',
    cover_image_url: '',
  })

  // Guard: only admin/superuser can see this form
  if (currentUser.access === 'user') return null

  function patch<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Task name is required'); return }
    if (!form.brand_id)    { setError('Select a brand'); return }
    setError('')

    startTransition(async () => {
      const result = await createTask({
        name: form.name.trim(),
        brand_id: form.brand_id,
        content_type_label: form.content_type_label,
        platform: form.platform,
        task_owner_id: form.task_owner_id,
        due_date: form.due_date,
        hours_estimate: form.hours_estimate,
        priority: form.priority,
        campaign: form.campaign || undefined,
        cover_image_url: form.cover_image_url || undefined,
      })
      if (result.success) {
        setShowTaskForm(false)
      } else {
        setError(result.error ?? 'Failed to create task')
      }
    })
  }

  const nineStage = currentUser.role === 'Content Creator'

  return (
    <div
      onClick={() => setShowTaskForm(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(23,19,33,.58)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 22, width: '100%', maxWidth: 500,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 28px 80px rgba(23,19,33,.38)',
        }}
      >
        {/* Header */}
        <div style={{ background: '#F7F7F7', borderRadius: '22px 22px 0 0', padding: '1rem 1.25rem 0.75rem', borderBottom: `1px solid ${COLORS.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: COLORS.ink, paddingBottom: 6, borderBottom: `3px solid ${COLORS.lime}` }}>
              New Task
            </span>
            <button
              onClick={() => setShowTaskForm(false)}
              aria-label="Close"
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,.72)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.ink, fontSize: '0.85rem' }}
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Task name */}
          <div>
            <input
              type="text"
              value={form.name}
              onChange={e => patch('name', e.target.value)}
              placeholder="Task name..."
              autoFocus
              style={{ width: '100%', fontSize: '1.1rem', fontWeight: 700, color: COLORS.ink, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          {/* Brand + Content Type + Priority + Platform */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 140px' }}>
              <label style={LBL}>Brand</label>
              <select value={form.brand_id} onChange={e => patch('brand_id', e.target.value)} style={{ ...FIELD, cursor: 'pointer' }}>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <label style={LBL}>Content Type</label>
              <select value={form.content_type_label} onChange={e => patch('content_type_label', e.target.value)} style={{ ...FIELD, cursor: 'pointer' }}>
                {contentTypes.map(c => <option key={c.id} value={c.label}>{c.label}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 90px' }}>
              <label style={LBL}>Priority</label>
              <select value={form.priority} onChange={e => patch('priority', e.target.value as typeof form['priority'])} style={{ ...FIELD, cursor: 'pointer' }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <label style={LBL}>Platform</label>
              <select value={form.platform} onChange={e => patch('platform', e.target.value as typeof form['platform'])} style={{ ...FIELD, cursor: 'pointer' }}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Task owner + Campaign */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={LBL}>Task Owner</label>
              <select value={form.task_owner_id} onChange={e => patch('task_owner_id', e.target.value)} style={{ ...FIELD, cursor: 'pointer' }}>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Campaign (optional)</label>
              <input type="text" value={form.campaign} onChange={e => patch('campaign', e.target.value)} placeholder="e.g. Brand Launch" style={FIELD} />
            </div>
          </div>

          {/* Due date + hours */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={LBL}>Due Date</label>
              <input type="date" value={form.due_date} onChange={e => patch('due_date', e.target.value)} style={FIELD} min={today} />
            </div>
            <div>
              <label style={LBL}>Est. Hours</label>
              <input type="number" min={0.5} max={200} step={0.5} value={form.hours_estimate} onChange={e => patch('hours_estimate', parseFloat(e.target.value) || 1)} style={FIELD} />
            </div>
          </div>

          {/* Cover image URL */}
          <div>
            <label style={LBL}>Cover Image URL (optional)</label>
            <input type="url" value={form.cover_image_url} onChange={e => patch('cover_image_url', e.target.value)} placeholder="https://..." style={FIELD} />
          </div>

          {/* Pipeline indicator */}
          <div style={{ fontSize: '0.72rem', color: COLORS.muted, padding: '0.4rem 0.75rem', background: '#F7F7F7', borderRadius: 8 }}>
            Creating as <strong style={{ color: COLORS.ink }}>{currentUser.role}</strong>
            {' → '}
            {nineStage ? '9-stage flow (includes Islam Check)' : '8-stage flow'}
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: 0 }}>{error}</p>}

          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: '0.75rem', background: COLORS.ink, border: 'none', borderRadius: 12,
              color: COLORS.lime, fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(17,17,17,.25)', fontFamily: 'inherit',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {isPending ? 'Creating…' : 'Create Task'}
          </button>
        </form>
      </div>
    </div>
  )
}
