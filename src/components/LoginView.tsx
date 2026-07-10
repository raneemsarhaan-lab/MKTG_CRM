import React, { useState } from 'react'
import { useStore } from '../store/useStore'
import { Member } from '../types'
import { playPop } from '../lib/sounds'

const UI = {
  ink: '#1B1A13',
  muted: '#8A8D91',
  soft: '#F7F7F7',
  line: '#E1E1E0',
  lime: '#C3F53D',
  dark: '#111111',
}

const ACCESS_LABELS: Record<string, string> = {
  admin: 'Admin', superuser: 'Super User', user: 'User',
}
const ACCESS_STYLES: Record<string, { bg: string; fg: string }> = {
  admin:     { bg: '#C3F53D', fg: '#111111' },
  superuser: { bg: '#B79CF5', fg: '#111111' },
  user:      { bg: '#EDEDEA', fg: '#6B6B6B' },
}

const MEMBER_PALETTE: Record<string, string> = {
  'Raneem':    '#B79CF5',
  'Islam':     '#1B1A13',
  'Nour':      '#5B93F5',
  'Omar':      '#3FA34D',
  'Sara':      '#D4537E',
  'Youssef':   '#E0A23F',
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function Avatar({ member, size = 52 }: { member: Member; size?: number }) {
  const color = MEMBER_PALETTE[member.name] || member.bg
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 800, fontSize: size * 0.32, flexShrink: 0,
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
    }}>
      {initials(member.name)}
    </div>
  )
}

export function LoginView() {
  const { members, login } = useStore()
  const [selected, setSelected] = useState<string | null>(null)

  function handleSelect(member: Member) {
    playPop()
    setSelected(member.name)
    setTimeout(() => login(member), 180)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(900px 500px at 50% -10%, #232427 0%, transparent 60%), #17181A',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
      fontFamily: "'Montserrat','Inter',system-ui,sans-serif",
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 13,
            background: UI.lime,
            display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
            gap: 5, padding: 10,
          }}>
            {[0,1,2,3].map(i => (
              <span key={i} style={{ background: UI.dark, borderRadius: 3 }} />
            ))}
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.5rem', letterSpacing: '.1em', color: '#fff' }}>FLUXO</span>
        </div>
        <p style={{ color: '#5E6064', fontSize: '0.85rem', margin: 0 }}>
          Forefront Consulting — Creative Ops
        </p>
      </div>

      <p style={{ color: '#9BA0A5', marginBottom: '1.25rem', fontSize: '0.85rem' }}>
        Who are you today?
      </p>

      {/* Member cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', maxWidth: 580, width: '100%' }}>
        {members.map((member) => {
          const ac = ACCESS_STYLES[member.access] || ACCESS_STYLES.user
          const isSelected = selected === member.name
          return (
            <button
              key={member.name}
              onClick={() => handleSelect(member)}
              style={{
                background: isSelected ? 'rgba(195,245,61,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isSelected ? UI.lime : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 18,
                padding: '1.2rem 0.75rem',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '0.65rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
                color: '#fff',
                boxShadow: isSelected ? `0 0 0 2px ${UI.lime}22` : 'none',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }
              }}
            >
              <Avatar member={member} size={52} />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.15rem', color: '#fff' }}>
                  {member.name}
                </div>
                <div style={{ color: '#9BA0A5', fontSize: '0.72rem', marginBottom: '0.4rem' }}>
                  {member.role}
                </div>
                <span style={{
                  display: 'inline-block',
                  backgroundColor: ac.bg,
                  color: ac.fg,
                  borderRadius: 99, padding: '0.15rem 0.6rem',
                  fontSize: '0.65rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  {ACCESS_LABELS[member.access]}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <p style={{ marginTop: '2.5rem', color: '#3A3D42', fontSize: '0.75rem' }}>
        Fluxo v2.0 — Internal tool
      </p>
    </div>
  )
}
