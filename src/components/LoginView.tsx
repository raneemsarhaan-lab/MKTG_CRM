import React from 'react'
import { useStore } from '../store/useStore'
import { Member } from '../types'
import { playPop } from '../lib/sounds'

function Avatar({ member, size = 56 }: { member: Member; size?: number }) {
  const initials = member.name.slice(0, 2).toUpperCase()
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: member.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: 700,
        fontSize: size * 0.32,
        flexShrink: 0,
      }}
    >
      {initials}
    </div>
  )
}

const ACCESS_LABELS: Record<string, string> = {
  admin: 'Admin',
  superuser: 'Super User',
  user: 'User',
}

const ACCESS_COLORS: Record<string, string> = {
  admin: '#7c3aed',
  superuser: '#1d4ed8',
  user: '#374151',
}

export function LoginView() {
  const { members, login } = useStore()

  function handleSelect(member: Member) {
    playPop()
    login(member)
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0c12',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
      }}
    >
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M3 6h18M3 12h12M3 18h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
            Fluxo
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: '0.95rem', margin: 0 }}>
          Forefront Consulting — Marketing Ops
        </p>
      </div>

      {/* Prompt */}
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Who are you today?
      </p>

      {/* Member cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1rem',
          maxWidth: 640,
          width: '100%',
        }}
      >
        {members.map((member) => (
          <button
            key={member.name}
            onClick={() => handleSelect(member)}
            style={{
              background: '#141720',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 16,
              padding: '1.25rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: '#e2e8f0',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.background = '#1f2437'
              el.style.borderColor = member.bg
              el.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.background = '#141720'
              el.style.borderColor = 'rgba(255,255,255,0.07)'
              el.style.transform = 'translateY(0)'
            }}
          >
            <Avatar member={member} size={52} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.2rem' }}>
                {member.name}
              </div>
              <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.4rem' }}>
                {member.role}
              </div>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: ACCESS_COLORS[member.access] + '22',
                  color: ACCESS_COLORS[member.access],
                  border: `1px solid ${ACCESS_COLORS[member.access]}44`,
                  borderRadius: 99,
                  padding: '0.15rem 0.6rem',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {ACCESS_LABELS[member.access]}
              </span>
            </div>
          </button>
        ))}
      </div>

      <p style={{ marginTop: '2.5rem', color: '#1e293b', fontSize: '0.8rem' }}>
        Fluxo v1.0 — Internal tool, not for external distribution
      </p>
    </div>
  )
}
