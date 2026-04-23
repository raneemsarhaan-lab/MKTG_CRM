import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { Brand, ContentType, Priority } from '../types'
import { playCreate } from '../lib/sounds'

const BRANDS: Brand[] = ['Islam Personal Branding', 'The Strategy Community', 'Omnisight', 'Forefront']
const CTYPES: ContentType[] = ['Post', 'Video', 'Reel', 'Design', 'Email', 'Story', 'Deck', 'Other']
const PRIORITIES: Priority[] = ['High', 'Medium', 'Low']

const FIELD: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem',
  backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
  color: '#0f172a', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
}
const LBL: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', color: '#64748b', marginBottom: '0.35rem',
  textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
}

interface Props { onClose: () => void }

export function TaskForm({ onClose }: Props) {
  const { addTask, members, currentUser } = useStore()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ name: '', account: BRANDS[0] as Brand, priority: 'Medium' as Priority, ctype: 'Post' as ContentType, assignee: members[0]?.name ?? '', due: today, hours: 2 })
  const [error, setError] = useState('')

  function patch<K extends keyof typeof form>(k: K, v: typeof form[K]) { setForm(p => ({ ...p, [k]: v })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Task name is required'); return }
    addTask({ name: form.name.trim(), account: form.account, initiator: currentUser?.role ?? 'Content Manager', assignee: form.assignee, priority: form.priority, due: form.due, hours: form.hours, status: 'todo', ctype: form.ctype })
    playCreate()
    onClose()
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', backdropFilter: 'blur(2px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem', boxShadow: '0 20px 50px rgba(0,0,0,0.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#0f172a', fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>New Task</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={LBL}>Task Name *</label>
            <input type="text" value={form.name} onChange={e => patch('name', e.target.value)} placeholder="e.g. Ramadan Campaign Post" style={FIELD} autoFocus />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={LBL}>Brand</label>
              <select value={form.account} onChange={e => patch('account', e.target.value as Brand)} style={{ ...FIELD, cursor: 'pointer' }}>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Priority</label>
              <select value={form.priority} onChange={e => patch('priority', e.target.value as Priority)} style={{ ...FIELD, cursor: 'pointer' }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={LBL}>Content Type</label>
              <select value={form.ctype} onChange={e => patch('ctype', e.target.value as ContentType)} style={{ ...FIELD, cursor: 'pointer' }}>
                {CTYPES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Assignee</label>
              <select value={form.assignee} onChange={e => patch('assignee', e.target.value)} style={{ ...FIELD, cursor: 'pointer' }}>
                {members.map(m => <option key={m.name} value={m.name}>{m.name} — {m.role}</option>)}
              </select>
            </div>
          </div>

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

          {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', margin: 0 }}>{error}</p>}

          <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
            As <span style={{ color: '#64748b' }}>{currentUser?.role}</span>
            {currentUser?.role === 'Content Creator' ? ' → 9-stage flow (incl. C-Check)' : ' → 8-stage flow (no C-Check)'}
          </p>

          <button type="submit"
            style={{ padding: '0.75rem', backgroundColor: '#6366f1', border: 'none', borderRadius: 10, color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 8px rgba(99,102,241,0.3)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#4f46e5' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#6366f1' }}
          >
            Create Task
          </button>
        </form>
      </div>
    </div>
  )
}
