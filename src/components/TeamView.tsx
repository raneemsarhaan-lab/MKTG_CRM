import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { Member, AccessLevel } from '../types'

const ACCESS_LABELS: Record<AccessLevel, string> = {
  admin: 'Admin',
  superuser: 'Super User',
  user: 'User',
}
const ACCESS_COLORS: Record<AccessLevel, { bg: string; text: string; border: string }> = {
  admin:     { bg: '#7c3aed22', text: '#a78bfa', border: '#7c3aed44' },
  superuser: { bg: '#1d4ed822', text: '#60a5fa', border: '#1d4ed844' },
  user:      { bg: '#33415522', text: '#64748b', border: '#33415544' },
}

const MEMBER_COLORS = [
  '#7c3aed','#1d4ed8','#065f46','#be185d','#b45309','#0369a1','#0f766e','#b91c1c',
]

const FIELD: React.CSSProperties = {
  width: '100%', padding: '0.6rem 0.75rem', backgroundColor: '#1a1d28',
  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
  color: '#e2e8f0', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
}
const LBL: React.CSSProperties = {
  display: 'block', fontSize: '0.72rem', color: '#64748b', marginBottom: '0.35rem',
  textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600,
}

function MemberCard({ member, isAdmin, onRemove }: { member: Member; isAdmin: boolean; onRemove: () => void }) {
  const initials = member.name.slice(0, 2).toUpperCase()
  const ac = ACCESS_COLORS[member.access]
  const { tasks } = useStore()
  const activeTasks = tasks.filter(t => t.assignee === member.name && t.status !== 'publish').length
  const totalHours = tasks.filter(t => t.assignee === member.name && t.status !== 'publish').reduce((sum, t) => sum + t.hours, 0)

  return (
    <div
      style={{
        backgroundColor: '#141720', border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, padding: '1.25rem', display: 'flex', gap: '1rem',
      }}
    >
      {/* Avatar */}
      <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: member.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '1rem', flexShrink: 0 }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.95rem' }}>{member.name}</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, backgroundColor: ac.bg, color: ac.text, border: `1px solid ${ac.border}`, borderRadius: 99, padding: '0.1rem 0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {ACCESS_LABELS[member.access]}
          </span>
        </div>
        <div style={{ color: '#64748b', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{member.role}</div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ fontSize: '0.72rem', color: '#475569' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{activeTasks}</span> active tasks
          </div>
          <div style={{ fontSize: '0.72rem', color: '#475569' }}>
            <span style={{ color: '#94a3b8', fontWeight: 600 }}>{totalHours}h</span> allocated
          </div>
        </div>
      </div>

      {/* Remove (admin only) */}
      {isAdmin && member.access !== 'admin' && (
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', color: '#1e293b', cursor: 'pointer', fontSize: '0.75rem', alignSelf: 'flex-start', padding: '0.25rem' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#1e293b' }}
          title="Remove member"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export function TeamView() {
  const { members, currentUser, addMember, removeMember } = useStore()
  const isAdmin = currentUser?.access === 'admin'
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', role: '', access: 'user' as AccessLevel, colorIdx: 0 })
  const [err, setErr] = useState('')

  function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.role.trim()) { setErr('Name and role required'); return }
    if (members.find(m => m.name.toLowerCase() === form.name.trim().toLowerCase())) { setErr('Name already taken'); return }
    const bg = MEMBER_COLORS[form.colorIdx % MEMBER_COLORS.length]
    addMember({ name: form.name.trim(), role: form.role.trim(), access: form.access, color: bg, bg, tc: 'white' })
    setForm({ name: '', role: '', access: 'user', colorIdx: 0 })
    setErr('')
    setShowForm(false)
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: 760, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.2rem' }}>Team</h2>
          <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>{members.length} members</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowForm(!showForm)}
            style={{ padding: '0.55rem 1rem', backgroundColor: '#6366f1', border: 'none', borderRadius: 10, color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}
          >
            {showForm ? 'Cancel' : '+ Add Member'}
          </button>
        )}
      </div>

      {/* Add form */}
      {showForm && isAdmin && (
        <div style={{ backgroundColor: '#141720', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '1.25rem', marginBottom: '1.25rem' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={LBL}>Name</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full name" style={FIELD} autoFocus />
              </div>
              <div>
                <label style={LBL}>Role</label>
                <input type="text" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} placeholder="e.g. Content Creator" style={FIELD} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={LBL}>Access Level</label>
                <select value={form.access} onChange={e => setForm(f => ({ ...f, access: e.target.value as AccessLevel }))} style={{ ...FIELD, cursor: 'pointer' }}>
                  <option value="user">User</option>
                  <option value="superuser">Super User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label style={LBL}>Avatar Color</label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
                  {MEMBER_COLORS.map((c, i) => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, colorIdx: i }))}
                      style={{ width: 22, height: 22, borderRadius: '50%', backgroundColor: c, border: form.colorIdx === i ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
                    />
                  ))}
                </div>
              </div>
            </div>
            {err && <p style={{ color: '#f87171', fontSize: '0.78rem', margin: 0 }}>{err}</p>}
            <button type="submit" style={{ padding: '0.6rem', backgroundColor: '#6366f1', border: 'none', borderRadius: 10, color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', alignSelf: 'flex-start', minWidth: 120 }}>
              Add Member
            </button>
          </form>
        </div>
      )}

      {/* Members grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.75rem' }}>
        {members.map(member => (
          <MemberCard
            key={member.name}
            member={member}
            isAdmin={isAdmin}
            onRemove={() => removeMember(member.name)}
          />
        ))}
      </div>
    </div>
  )
}
