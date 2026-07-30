import React, { useMemo, useState } from 'react'
import { useStore } from '../store/useStore'
import { STAGES } from '../data/stages'
import { TaskCard } from './TaskCard'
import { Task, StageId } from '../types'
import { playVictory, playMove } from '../lib/sounds'
import { STAGE_MAP } from '../data/stages'

const STAGE_META: Record<string, { en: string; color: string }> = {
  'todo':        { en: 'To Do',             color: '#64748B' },
  'c-prog':      { en: 'C-In Progress',     color: '#3B82F6' },
  'c-final':     { en: 'C-Review',          color: '#2E6FB0' },
  'c-check':     { en: 'C-Check',           color: '#1F5A94' },
  'r-design':    { en: 'Ready For Design',  color: '#8B5CF6' },
  'd-prog':      { en: 'D-In Progress',     color: '#7C3AED' },
  'd-check':     { en: 'D-Check',           color: '#5B3FB5' },
  'final-check': { en: 'F-Check',           color: '#F59E0B' },
  'publish':     { en: 'Published',         color: '#22C55E' },
}

const UI = {
  ink: '#1B1A13',
  muted: '#9A9A94',
  cardShadow: '0 1px 2px rgba(26,28,30,.04), 0 4px 12px rgba(26,28,30,.06)',
}

const BRAND_COLORS: Record<string, string> = {
  'Forefront':               '#B4322F',
  'Omnisight':               '#0E7C7B',
  'The Strategy Community':  '#7A5A2E',
  'Islam Personal Branding': '#1E293B',
}

export function KanbanBoard() {
  const { tasks, activeBrand, searchQuery, currentUser, setActiveBrand, moveTask } = useStore()
  const [search, setSearch] = useState('')
  const [dragOverStage, setDragOverStage] = useState<string | null>(null)

  const filteredTasks = useMemo(() => tasks.filter(task => {
    if (activeBrand && task.account !== activeBrand) return false
    const q = (search || searchQuery || '').toLowerCase()
    if (q) return task.name.toLowerCase().includes(q) || task.assignee.toLowerCase().includes(q)
    return true
  }), [tasks, activeBrand, searchQuery, search])

  const visibleTasks = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.access === 'user') {
      return filteredTasks.filter(t => t.assignee === currentUser.name || t.initiator === currentUser.role)
    }
    return filteredTasks
  }, [filteredTasks, currentUser])

  const tasksByStage = useMemo(() => {
    const map: Record<string, Task[]> = {}
    STAGES.forEach(s => { map[s.id] = [] })
    visibleTasks.forEach(t => { if (map[t.status]) map[t.status].push(t) })
    return map
  }, [visibleTasks])

  const brands = ['Forefront', 'Omnisight', 'The Strategy Community', 'Islam Personal Branding']

  function handleDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault()
    setDragOverStage(null)
    const taskId = parseInt(e.dataTransfer.getData('taskId'))
    if (isNaN(taskId)) return
    const task = tasks.find(t => t.id === taskId)
    if (!task || task.status === stageId) return

    if (stageId === 'publish') {
      playVictory()
      moveTask(taskId, stageId as StageId)
      const stageLabel = STAGE_MAP[stageId]?.label ?? 'Published'
      useStore.setState({ celebration: { taskName: task.name, stageLabel } })
    } else {
      playMove()
      moveTask(taskId, stageId as StageId)
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Brand filter + search bar */}
      <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {/* Brand chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveBrand(null)}
              style={{
                padding: '5px 14px', borderRadius: 99, border: `1px solid ${!activeBrand ? '#C3F53D' : '#E1E1E0'}`,
                background: !activeBrand ? '#C3F53D' : '#fff',
                color: !activeBrand ? '#111' : UI.muted,
                fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              All brands
            </button>
            {brands.map(b => {
              const on = activeBrand === b
              const bc = BRAND_COLORS[b] || '#94A3B8'
              return (
                <button
                  key={b}
                  onClick={() => setActiveBrand(on ? null : b)}
                  title={b}
                  style={{
                    width: 34, height: 34, borderRadius: '50%', border: `2px solid ${on ? '#C3F53D' : 'transparent'}`,
                    background: on ? '#C3F53D' : '#111',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', flexShrink: 0,
                    boxShadow: on ? '0 4px 12px rgba(195,245,61,.5)' : 'none',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: on ? '#111' : bc }} />
                </button>
              )
            })}
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tasks..."
              style={{
                width: 200, padding: '6px 12px 6px 32px',
                background: '#fff', border: '1px solid #E1E1E0', borderRadius: 10,
                fontSize: '0.78rem', outline: 'none', color: UI.ink, fontFamily: 'inherit',
              }}
            />
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={UI.muted} strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
        </div>
      </div>

      {/* Board columns */}
      <div style={{
        display: 'flex', gap: 14, overflowX: 'auto',
        padding: '14px 20px 20px', flex: 1, alignItems: 'flex-start',
      }}>
        {STAGES.map(stage => {
          const meta = STAGE_META[stage.id] || { en: stage.id, color: '#94A3B8' }
          const stageTasks = tasksByStage[stage.id] ?? []
          const isOver = dragOverStage === stage.id

          return (
            <div
              key={stage.id}
              onDragOver={e => { e.preventDefault(); setDragOverStage(stage.id) }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverStage(null)
                }
              }}
              onDrop={e => handleDrop(e, stage.id)}
              style={{
                flexShrink: 0, width: 248, display: 'flex', flexDirection: 'column',
                borderRadius: 16,
                outline: isOver ? `2px solid ${meta.color}` : '2px solid transparent',
                outlineOffset: 2,
                background: isOver ? `${meta.color}0A` : 'transparent',
                transition: 'outline 0.1s, background 0.1s',
              }}
            >
              {/* Column header */}
              <div style={{
                background: '#FFFFFF',
                border: '1px solid #EFEFEC',
                borderTop: `3px solid ${meta.color}`,
                borderRadius: '0 0 14px 14px',
                padding: '0.75rem 0.875rem',
                boxShadow: UI.cardShadow,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div className="mont" style={{ fontSize: '0.85rem', fontWeight: 700, color: UI.ink }}>
                    {meta.en}
                  </div>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 600, color: meta.color,
                    background: `${meta.color}18`, borderRadius: 99, padding: '1px 8px',
                  }}>
                    {stageTasks.length}
                  </span>
                </div>
                {stage.reviewer && (
                  <div style={{ fontSize: '0.62rem', color: UI.muted, marginTop: '0.2rem' }}>↳ {stage.reviewer}</div>
                )}
              </div>

              {/* Cards */}
              <div style={{ paddingTop: 10, paddingBottom: 4 }}>
                {stageTasks.map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}
                {stageTasks.length === 0 && (
                  <div style={{
                    height: 56, border: `1px dashed ${isOver ? meta.color : '#E0E0DC'}`, borderRadius: 12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isOver ? meta.color : '#C8C8C6', fontSize: '0.7rem',
                    transition: 'border-color 0.1s, color 0.1s',
                  }}>
                    {isOver ? 'Drop here' : 'Empty'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
