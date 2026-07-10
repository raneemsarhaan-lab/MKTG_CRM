import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { Brand, ContentType, Priority, Platform } from '../types'
import { playCreate } from '../lib/sounds'

const UI = {
  ink: '#1B1A13',
  muted: '#8A8D91',
  soft: '#F7F7F7',
  line: '#E1E1E0',
  lime: '#C3F53D',
  dark: '#111111',
}

const BRANDS: Brand[] = ['Islam Personal Branding', 'The Strategy Community', 'Omnisight', 'Forefront']
const CTYPES: ContentType[] = ['Post', 'Video', 'Reel', 'Design', 'Email', 'Story', 'Deck', 'Other']
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low']
const PLATFORMS: Platform[] = ['LinkedIn', 'Instagram', 'TikTok', 'Facebook']

const BRAND_SHORT: Record<string, string> = {
  'Islam Personal Branding': 'Islam',
  'The Strategy Community': 'Strategy',
  'Omnisight': 'Omnisight',
  'Forefront': 'Forefront',
}

const PRIORITY_COLOR: Record<string, string> = { High: '#D57D6F', Medium: '#E0A23F', Low: '#7C8288' }

const FIELD: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem',
  backgroundColor: UI.soft, border: `1px solid ${UI.line}`, borderRadius: 10,
  color: UI.ink, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
}
const LBL: React.CSSProperties = {
  display: 'block', fontSize: '0.65rem', color: UI.muted, marginBottom: '0.3rem',
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
}

interface Props { onClose: () => void }

export function TaskForm({ onClose }: Props) {
  const { addTask, members, currentUser } = useStore()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    name: '',
    account: BRANDS[0] as Brand,
    priority: 'Medium' as Priority,
    ctype: 'Post' as ContentType,
    platform: 'LinkedIn' as Platform,
    assignee: members[0]?.name ?? '',
    due: today,
    hours: 2,
    campaign: '',
  })
  const [error, setError] = useState('')

  function patch<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Task name is required'); return }
    addTask({
      name: form.name.trim(),
      account: form.account,
      initiator: currentUser?.role ?? 'Content Manager',
      assignee: form.assignee,
      priority: form.priority,
      due: form.due,
      hours: form.hours,
      status: 'todo',
      ctype: form.ctype,
      platform: form.platform,
      campaign: form.campaign || undefined,
    })
    playCreate()
    onClose()
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(23,19,33,.58)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#fff', borderRadius: 22, width: '100%', maxWidth: 500,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 28px 80px rgba(23,19,33,.38)',
          fontFamily: "'Montserrat','Inter',system-ui,sans-serif",
        }}
      >
        {/* Header bar */}
        <div style={{ background: UI.soft, borderRadius: '22px 22px 0 0', padding: '1rem 1.25rem 0.75rem', borderBottom: `1px solid ${UI.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: UI.ink, paddingBottom: 6, borderBottom: `3px solid ${UI.lime}` }}>Task</span>
            </div>
            <button
              onClick={onClose}
              style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,.72)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: UI.ink, fontSize: '0.85rem' }}
            >✕</button>
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
              style={{ width: '100%', fontSize: '1.2rem', fontWeight: 700, color: UI.ink, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              autoFocus
            />
          </div>

          {/* Brand + Priority pill row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div>
              <label style={LBL}>Brand</label>
              <select value={form.account} onChange={e => patch('account', e.target.value as Brand)}
                style={{ ...FIELD, width: 'auto', fontSize: '0.78rem', cursor: 'pointer' }}>
                {BRANDS.map(b => <option key={b} value={b}>{BRAND_SHORT[b] || b}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Priority</label>
              <select value={form.priority} onChange={e => patch('priority', e.target.value as Priority)}
                style={{ ...FIELD, width: 'auto', fontSize: '0.78rem', cursor: 'pointer', color: PRIORITY_COLOR[form.priority] }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Type</label>
              <select value={form.ctype} onChange={e => patch('ctype', e.target.value as ContentType)}
                style={{ ...FIELD, width: 'auto', fontSize: '0.78rem', cursor: 'pointer' }}>
                {CTYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Platform</label>
              <select value={form.platform} onChange={e => patch('platform', e.target.value as Platform)}
                style={{ ...FIELD, width: 'auto', fontSize: '0.78rem', cursor: 'pointer' }}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee + Campaign */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={LBL}>Assignee</label>
              <select value={form.assignee} onChange={e => patch('assignee', e.target.value)} style={{ ...FIELD, cursor: 'pointer' }}>
                {members.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
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
              <input type="date" value={form.due} onChange={e => patch('due', e.target.value)} style={FIELD} />
            </div>
            <div>
              <label style={LBL}>Est. Hours</label>
              <input type="number" min={0.5} max={100} step={0.5} value={form.hours} onChange={e => patch('hours', parseFloat(e.target.value) || 1)} style={FIELD} />
            </div>
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '0.78rem', margin: 0 }}>{error}</p>}

          <div style={{ fontSize: '0.7rem', color: UI.muted }}>
            As <strong style={{ color: UI.ink }}>{currentUser?.role}</strong>
            {currentUser?.role === 'Content Creator' ? ' → 9-stage flow (incl. C-Check)' : ' → 8-stage flow'}
          </div>

          <button
            type="submit"
            style={{
              padding: '0.75rem', background: UI.dark, border: 'none', borderRadius: 12,
              color: UI.lime, fontSize: '0.9rem', fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 6px 18px rgba(17,17,17,.25)', fontFamily: 'inherit',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Create Task
          </button>
        </form>
      </div>
    </div>
  )
}
