import React from 'react'
import { useStore } from '../store/useStore'
import { Member } from '../types'
import { playPop } from '../lib/sounds'

function Avatar({ member, size = 56 }: { member: Member; size?: number }) {
  const initials = member.name.slice(0, 2).toUpperCase()
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', backgroundColor: member.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontWeight: 700, fontSize: size * 0.32, flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

const ACCESS_LABELS: Record<string, string> = {
  admin: 'Admin', superuser: 'Super User', user: 'User',
}
const ACCESS_COLORS: Record<string, string> = {
  admin: '#7c3aed', superuser: '#1d4ed8', user: '#475569',
}

export function LoginView() {
  const { members, login } = useStore()

  function handleSelect(member: Member) {
    playPop()
    login(member)
  }

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#f8fafc',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h12M3 18h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em' }}>Fluxo</span>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.95rem', margin: 0 }}>
          Forefront Consulting — Marketing Ops
        </p>
      </div>

      <p style={{ color: '#64748b', marginBottom: '1.5rem', fontSize: '0.9rem' }}>Who are you today?</p>

      {/* Member cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', maxWidth: 640, width: '100%' }}>
        {members.map((member) => (
          <button
            key={member.name}
            onClick={() => handleSelect(member)}
            style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
              padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '0.75rem', cursor: 'pointer',
              transition: 'all 0.15s', color: '#0f172a',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = member.bg
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = `0 8px 24px rgba(0,0,0,0.1)`
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '#e2e8f0'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'
            }}
          >
            <Avatar member={member} size={52} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem', color: '#0f172a' }}>{member.name}</div>
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.4rem' }}>{member.role}</div>
              <span style={{
                display: 'inline-block',
                backgroundColor: ACCESS_COLORS[member.access] + '15',
                color: ACCESS_COLORS[member.access],
                border: `1px solid ${ACCESS_COLORS[member.access]}33`,
                borderRadius: 99, padding: '0.15rem 0.6rem',
                fontSize: '0.68rem', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {ACCESS_LABELS[member.access]}
              </span>
            </div>
          </button>
        ))}
      </div>

      <p style={{ marginTop: '2.5rem', color: '#e2e8f0', fontSize: '0.8rem' }}>
        Fluxo v1.0 — Internal tool
      </p>
    </div>
  )
}
