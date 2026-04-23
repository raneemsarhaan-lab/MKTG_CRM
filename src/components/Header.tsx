import React from 'react'
import { useStore } from '../store/useStore'

const BRANDS = ['Islam Personal Branding', 'The Strategy Community', 'Omnisight', 'Forefront'] as const

const BRAND_COLORS: Record<string, string> = {
  'Islam Personal Branding':  '#f59e0b',
  'The Strategy Community':   '#3b82f6',
  'Omnisight':                '#8b5cf6',
  'Forefront':                '#10b981',
}

const BRAND_SHORT: Record<string, string> = {
  'Islam Personal Branding':  'Islam',
  'The Strategy Community':   'Strategy',
  'Omnisight':                'Omnisight',
  'Forefront':                'Forefront',
}

export function Header({ onNewTask }: { onNewTask: () => void }) {
  const { currentUser, activeBrand, setActiveBrand, searchQuery, setSearchQuery, logout, tasks } = useStore()
  if (!currentUser) return null

  const initials = currentUser.name.slice(0, 2).toUpperCase()

  return (
    <header
      style={{
        height: 56,
        backgroundColor: '#0d0f18',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0 1.25rem',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 30,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem', flexShrink: 0 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M3 12h12M3 18h8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <span style={{ color: '#fff', fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em' }}>Fluxo</span>
      </div>

      {/* Brand filter pills */}
      <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={() => setActiveBrand(null)}
          style={{
            padding: '0.2rem 0.7rem',
            borderRadius: 99,
            border: '1px solid',
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: activeBrand === null ? 'rgba(255,255,255,0.12)' : 'transparent',
            borderColor: activeBrand === null ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
            color: activeBrand === null ? '#e2e8f0' : '#475569',
          }}
        >
          All
        </button>
        {BRANDS.map(b => {
          const color = BRAND_COLORS[b]
          const active = activeBrand === b
          const count = tasks.filter(t => t.account === b && t.status !== 'publish').length
          return (
            <button
              key={b}
              onClick={() => setActiveBrand(active ? null : b)}
              style={{
                padding: '0.2rem 0.7rem',
                borderRadius: 99,
                border: `1px solid ${active ? color + '66' : 'rgba(255,255,255,0.07)'}`,
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                backgroundColor: active ? color + '22' : 'transparent',
                color: active ? color : '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
              }}
            >
              {BRAND_SHORT[b]}
              {count > 0 && (
                <span style={{ fontSize: '0.6rem', backgroundColor: active ? color + '33' : 'rgba(255,255,255,0.06)', borderRadius: 99, padding: '0 0.3rem', color: active ? color : '#334155' }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Search */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search tasks..."
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: '0.35rem 0.75rem 0.35rem 2rem',
            color: '#e2e8f0',
            fontSize: '0.8rem',
            outline: 'none',
            width: 180,
          }}
        />
        <svg style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.35 }} width="12" height="12" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="#fff" strokeWidth="2" />
          <path d="m21 21-4.35-4.35" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      {/* New Task button */}
      <button
        onClick={onNewTask}
        style={{
          padding: '0.35rem 0.85rem',
          backgroundColor: '#6366f1',
          border: 'none',
          borderRadius: 8,
          color: '#fff',
          fontSize: '0.8rem',
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
        }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#4f46e5' }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#6366f1' }}
      >
        + New Task
      </button>

      {/* Current user + logout */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        <div
          title={`${currentUser.name} · ${currentUser.role}`}
          style={{ width: 28, height: 28, borderRadius: '50%', backgroundColor: currentUser.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.65rem', fontWeight: 700 }}
        >
          {initials}
        </div>
        <button
          onClick={logout}
          title="Switch user"
          style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: '0.72rem' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#94a3b8' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#334155' }}
        >
          ↩
        </button>
      </div>
    </header>
  )
}
