import React, { useState } from 'react'
import { useStore } from './store/useStore'
import { LoginView } from './components/LoginView'
import { KanbanBoard } from './components/KanbanBoard'
import { TeamView } from './components/TeamView'
import { CapacityView } from './components/CapacityView'
import { TaskModal } from './components/TaskModal'
import { TaskForm } from './components/TaskForm'
import { CelebrationOverlay } from './components/CelebrationOverlay'
import { Header } from './components/Header'

type View = 'kanban' | 'team' | 'capacity'

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'kanban',   label: 'Pipeline', icon: '⚡' },
  { id: 'team',     label: 'Team',     icon: '👥' },
  { id: 'capacity', label: 'Capacity', icon: '📊' },
]

function Sidebar({ view, setView }: { view: View; setView: (v: View) => void }) {
  const { currentUser } = useStore()
  const isAdmin = currentUser?.access === 'admin'

  const items = NAV_ITEMS.filter(item => {
    if (item.id === 'capacity') return isAdmin
    return true
  })

  return (
    <aside
      style={{
        width: 56,
        backgroundColor: '#0d0f18',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: '0.75rem',
        gap: '0.25rem',
        flexShrink: 0,
      }}
    >
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setView(item.id)}
          title={item.label}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            border: 'none',
            cursor: 'pointer',
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: view === item.id ? 'rgba(99,102,241,0.2)' : 'transparent',
            outline: view === item.id ? '1px solid rgba(99,102,241,0.35)' : 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            if (view !== item.id) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'
          }}
          onMouseLeave={e => {
            if (view !== item.id) e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {item.icon}
        </button>
      ))}
    </aside>
  )
}

function AppShell() {
  const { currentUser, selectedTaskId, showTaskForm, setShowTaskForm } = useStore()
  const [view, setView] = useState<View>('kanban')

  if (!currentUser) return <LoginView />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#0a0c12', overflow: 'hidden' }}>
      <Header onNewTask={() => setShowTaskForm(true)} />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar view={view} setView={setView} />
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {view === 'kanban'   && <KanbanBoard />}
          {view === 'team'     && <div style={{ overflowY: 'auto', flex: 1 }}><TeamView /></div>}
          {view === 'capacity' && <div style={{ overflowY: 'auto', flex: 1 }}><CapacityView /></div>}
        </main>
      </div>

      {/* Modals */}
      {selectedTaskId !== null && <TaskModal />}
      {showTaskForm && <TaskForm onClose={() => setShowTaskForm(false)} />}

      {/* Celebration */}
      <CelebrationOverlay />
    </div>
  )
}

export default function App() {
  return <AppShell />
}
