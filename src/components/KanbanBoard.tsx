import React, { useMemo } from 'react'
import { useStore } from '../store/useStore'
import { STAGES } from '../data/stages'
import { TaskCard } from './TaskCard'
import { Task } from '../types'
import { differenceInDays, parseISO } from 'date-fns'

const PHASE_COLORS: Record<string, { line: string; label: string }> = {
  content: { line: '#6366f1', label: '#818cf8' },
  design:  { line: '#ec4899', label: '#f472b6' },
}

function SLAIndicator({ task, slaConfig }: { task: Task; slaConfig: Record<string, number> }) {
  const maxDays = slaConfig[task.status] ?? 3
  const daysIn = differenceInDays(new Date(), parseISO(task.stageDate))
  const pct = Math.min(daysIn / maxDays, 1)

  let color = '#22c55e'
  if (pct >= 1)       color = '#ef4444'
  else if (pct >= 0.7) color = '#f97316'
  else if (pct >= 0.4) color = '#eab308'

  return (
    <div title={`${daysIn}/${maxDays}d in stage`} style={{ marginTop: '0.35rem' }}>
      <div style={{ height: 2, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 9, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: color, borderRadius: 9 }} />
      </div>
    </div>
  )
}

export function KanbanBoard() {
  const { tasks, activeBrand, searchQuery, currentUser, slaConfig } = useStore()

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (activeBrand && task.account !== activeBrand) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return task.name.toLowerCase().includes(q) || task.assignee.toLowerCase().includes(q)
      }
      return true
    })
  }, [tasks, activeBrand, searchQuery])

  // For regular users: only show tasks they are involved in
  const visibleTasks = useMemo(() => {
    if (!currentUser) return []
    if (currentUser.access === 'user') {
      return filteredTasks.filter(
        t => t.assignee === currentUser.name || t.initiator === currentUser.role
      )
    }
    return filteredTasks
  }, [filteredTasks, currentUser])

  const tasksByStage = useMemo(() => {
    const map: Record<string, Task[]> = {}
    STAGES.forEach(s => { map[s.id] = [] })
    visibleTasks.forEach(t => {
      if (map[t.status]) map[t.status].push(t)
    })
    return map
  }, [visibleTasks])

  return (
    <div
      style={{
        display: 'flex',
        gap: '0.75rem',
        overflowX: 'auto',
        padding: '1rem 1.5rem 1.5rem',
        height: '100%',
        alignItems: 'flex-start',
      }}
    >
      {STAGES.map((stage, idx) => {
        const isFirst = idx === 0
        const prevPhase = idx > 0 ? STAGES[idx - 1].phase : null
        const phaseChange = !isFirst && prevPhase !== stage.phase
        const phaseColor = PHASE_COLORS[stage.phase]
        const stageTasks = tasksByStage[stage.id] ?? []

        return (
          <React.Fragment key={stage.id}>
            {/* Phase divider */}
            {phaseChange && (
              <div
                style={{
                  flexShrink: 0,
                  width: 1,
                  alignSelf: 'stretch',
                  background: 'rgba(255,255,255,0.08)',
                  margin: '0 0.25rem',
                }}
              />
            )}

            {/* Column */}
            <div
              style={{
                flexShrink: 0,
                width: 220,
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              {/* Column header */}
              <div
                style={{
                  backgroundColor: '#141720',
                  borderRadius: 10,
                  padding: '0.6rem 0.75rem',
                  borderTop: `2px solid ${phaseColor.line}`,
                }}
              >
                {/* Phase label on first of phase */}
                {(isFirst || phaseChange) && (
                  <div
                    style={{
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: phaseColor.label,
                      marginBottom: '0.3rem',
                    }}
                  >
                    {stage.phase} phase
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{
                      color: '#e2e8f0',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      direction: stage.id === 'todo' || stage.id === 'c-prog' || stage.id === 'publish'
                        ? 'rtl' : 'ltr',
                    }}
                  >
                    {stage.label}
                  </span>
                  <span
                    style={{
                      backgroundColor: stageTasks.length > 0 ? phaseColor.line + '33' : 'rgba(255,255,255,0.06)',
                      color: stageTasks.length > 0 ? phaseColor.label : '#475569',
                      borderRadius: 99,
                      padding: '0.1rem 0.5rem',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      minWidth: 22,
                      textAlign: 'center',
                    }}
                  >
                    {stageTasks.length}
                  </span>
                </div>

                {stage.reviewer && (
                  <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: '0.2rem' }}>
                    ↳ {stage.reviewer}
                  </div>
                )}
              </div>

              {/* Task cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {stageTasks.map(task => (
                  <div key={task.id}>
                    <TaskCard task={task} />
                    <SLAIndicator task={task} slaConfig={slaConfig} />
                  </div>
                ))}

                {stageTasks.length === 0 && (
                  <div
                    style={{
                      height: 60,
                      border: '1px dashed rgba(255,255,255,0.06)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#1e293b',
                      fontSize: '0.7rem',
                    }}
                  >
                    empty
                  </div>
                )}
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
