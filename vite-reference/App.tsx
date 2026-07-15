import React, { useState, useEffect } from 'react'
import { useStore } from './store/useStore'
import { supabase } from './lib/supabase'
import { MEMBERS } from './data/seed'
import { LoginView } from './components/LoginView'
import { KanbanBoard } from './components/KanbanBoard'
import { CapacityView } from './components/CapacityView'
import { PersonalBoard } from './components/PersonalBoard'
import { TaskModal } from './components/TaskModal'
import { TaskForm } from './components/TaskForm'
import { CelebrationOverlay } from './components/CelebrationOverlay'
import { TeamView } from './components/TeamView'
import { SettingsView } from './components/SettingsView'

type View = 'home' | 'kanban' | 'team' | 'capacity' | 'settings'

const UI = {
  ink: '#1B1A13',
  rail: '#36332B',
  lime: '#C3F53D',
  dark: '#111111',
  muted: '#8A8D91',
}

const NAV = [
  { id: 'home' as View, label: 'Overview', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
  { id: 'kanban' as View, label: 'Pipeline', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="5" height="16" rx="1"/></svg> },
  { id: 'team' as View, label: 'Team', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="19" cy="9" r="2.5"/><path d="M22 21v-1.5a2.5 2.5 0 0 0-2.5-2.5H17"/></svg> },
  { id: 'capacity' as View, label: 'Capacity', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg> },
  { id: 'settings' as View, label: 'Settings', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> },
]

function initials(name: string) {
  return name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
}

function Sidebar({ view, setView }: { view: View; setView: (v: View) => void }) {
  const { currentUser, setProfileOpen } = useStore()
  const isAdmin = currentUser?.access === 'admin'

  const items = NAV.filter(item => {
    if (item.id === 'capacity') return isAdmin
    if (item.id === 'settings') return isAdmin
    return true
  })

  return (
    <aside style={{
      position: 'sticky', top: 0, alignSelf: 'flex-start',
      height: '100vh', padding: 10, flexShrink: 0, zIndex: 30,
    }}>
      <div style={{
        height: '100%', width: 62,
        background: UI.rail, borderRadius: 24,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '14px 0 12px',
        boxShadow: '0 16px 44px rgba(26,28,30,.26)',
      }}>
        {/* Logo */}
        <div style={{
          width: 38, height: 38, borderRadius: 12,
          background: UI.lime,
          display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
          gap: 4, padding: 9, marginBottom: 18, flexShrink: 0,
        }}>
          {[0,1,2,3].map(i => (
            <span key={i} style={{ background: UI.dark, borderRadius: 2 }} />
          ))}
        </div>

        {/* Nav buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          {items.map(item => {
            const on = view === item.id
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                title={item.label}
                style={{
                  width: 44, height: 44, borderRadius: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: 'pointer',
                  background: on ? UI.lime : 'transparent',
                  color: on ? UI.dark : '#9BA0A5',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (!on) { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#fff' } }}
                onMouseLeave={e => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9BA0A5' } }}
              >
                {item.svg}
              </button>
            )
          })}
        </div>

        {/* Avatar button */}
        {currentUser && (
          <button
            onClick={() => setProfileOpen(true)}
            title="Your profile"
            style={{
              width: 38, height: 38, borderRadius: '50%',
              background: '#4A4740',
              border: '2px solid #4A4740',
              color: '#fff', fontSize: '0.75rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', marginTop: 10, flexShrink: 0,
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = UI.lime }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#4A4740' }}
          >
            {initials(currentUser.name)}
          </button>
        )}
      </div>
    </aside>
  )
}

function ProfileModal() {
  const { profileOpen, setProfileOpen, currentUser, logout } = useStore()
  if (!profileOpen || !currentUser) return null

  const ACCESS_STYLE: Record<string, { bg: string; fg: string }> = {
    admin:     { bg: '#C3F53D', fg: '#111111' },
    superuser: { bg: '#B79CF5', fg: '#111111' },
    user:      { bg: '#EDEDEA', fg: '#6B6B6B' },
  }
  const ACCESS_LABELS: Record<string, string> = { admin: 'Admin', superuser: 'Super User', user: 'User' }
  const ac = ACCESS_STYLE[currentUser.access]

  return (
    <div
      onClick={() => setProfileOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 65,
        background: 'rgba(16,16,11,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 360,
          background: '#fff', borderRadius: 22, padding: 24,
          boxShadow: '0 30px 80px rgba(16,16,11,.4)',
          fontFamily: "'Montserrat','Inter',system-ui,sans-serif",
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem', color: UI.ink, margin: 0 }}>Your profile</h2>
          <button
            onClick={() => setProfileOpen(false)}
            style={{ width: 30, height: 30, borderRadius: '50%', background: '#F7F7F7', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: UI.ink, fontSize: '0.9rem' }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            background: currentUser.bg, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '1.2rem',
          }}>
            {initials(currentUser.name)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: UI.ink }}>{currentUser.name}</div>
            <div style={{ fontSize: '0.8rem', color: UI.muted, marginBottom: 8 }}>{currentUser.role}</div>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: ac.bg, color: ac.fg }}>
              {ACCESS_LABELS[currentUser.access]}
            </span>
          </div>
        </div>

        <button
          onClick={() => { logout(); setProfileOpen(false) }}
          style={{
            width: '100%', padding: '0.7rem', borderRadius: 12,
            border: '1px solid #E1E1E0', background: '#F7F7F7',
            color: '#ef4444', fontSize: '0.85rem', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

function AppShell() {
  const { currentUser, selectedTaskId, showTaskForm, setShowTaskForm, activeBrand } = useStore()
  const [view, setView] = useState<View>('home')

  if (!currentUser) return <LoginView />

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#F6F6F4', overflow: 'hidden' }}>
      <Sidebar view={view} setView={setView} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Top bar */}
        <div style={{
          padding: '16px 24px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="mont" style={{ fontWeight: 800, fontSize: '1.35rem', color: UI.ink, letterSpacing: '-0.02em' }}>Fluxo</span>
            <span style={{ fontSize: '0.65rem', fontWeight: 600, padding: '3px 9px', borderRadius: 99, background: '#EEF6C8', color: '#4B7A12' }}>Creative Ops</span>
          </div>
          <button
            onClick={() => setShowTaskForm(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 16px', borderRadius: 99,
              background: UI.lime, color: UI.dark, border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 800,
              boxShadow: '0 6px 18px rgba(195,245,61,.4)',
              fontFamily: 'inherit',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            New task
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'home'     && <PersonalBoard />}
          {view === 'kanban'   && <KanbanBoard />}
          {view === 'team'     && <div style={{ overflowY: 'auto', flex: 1 }}><TeamView /></div>}
          {view === 'capacity' && <div style={{ overflowY: 'auto', flex: 1 }}><CapacityView /></div>}
          {view === 'settings' && <div style={{ overflowY: 'auto', flex: 1, display: 'flex' }}><SettingsView /></div>}
        </div>
      </main>

      {selectedTaskId !== null && <TaskModal />}
      {showTaskForm && <TaskForm onClose={() => setShowTaskForm(false)} />}
      <CelebrationOverlay />
      <ProfileModal />
    </div>
  )
}

export default function App() {
  const { login, logout } = useStore()
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    function resolveUser(email: string | undefined) {
      if (!email) { logout(); return }
      const member = MEMBERS.find(m => m.email?.toLowerCase() === email.toLowerCase())
      if (member) login(member)
      else {
        supabase.auth.signOut()
        logout()
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      resolveUser(data.session?.user?.email)
      setAuthReady(true)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      resolveUser(session?.user?.email)
    })

    return () => subscription.unsubscribe()
  }, [login, logout])

  if (!authReady) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#17181A', fontFamily: "'Montserrat','Inter',system-ui,sans-serif",
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: '#C3F53D',
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 9,
            margin: '0 auto 16px', animation: 'bob 1.2s ease-in-out infinite',
          }}>
            {[0,1,2,3].map(i => <span key={i} style={{ background: '#111', borderRadius: 2 }} />)}
          </div>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem' }}>Loading…</span>
        </div>
      </div>
    )
  }

  return <AppShell />
}
