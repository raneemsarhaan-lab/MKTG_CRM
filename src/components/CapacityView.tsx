import React from 'react'
import { useStore } from '../store/useStore'

const BRAND_COLORS: Record<string, string> = {
  'Islam Personal Branding':  '#f59e0b',
  'The Strategy Community':   '#3b82f6',
  'Omnisight':                '#8b5cf6',
  'Forefront':                '#10b981',
}

const PRIORITY_COLORS: Record<string, string> = {
  High: '#ef4444', Medium: '#f97316', Low: '#64748b',
}

export function CapacityView() {
  const { members, tasks } = useStore()

  // Only active tasks (not published)
  const activeTasks = tasks.filter(t => t.status !== 'publish')

  // Per-member summary
  const memberStats = members.map(member => {
    const myTasks = activeTasks.filter(t => t.assignee === member.name)
    const totalHours = myTasks.reduce((s, t) => s + t.hours, 0)
    const highCount = myTasks.filter(t => t.priority === 'High').length

    const byBrand: Record<string, number> = {}
    myTasks.forEach(t => {
      byBrand[t.account] = (byBrand[t.account] ?? 0) + t.hours
    })

    return { member, myTasks, totalHours, highCount, byBrand }
  }).filter(s => s.myTasks.length > 0 || true) // show all members

  const maxHours = Math.max(...memberStats.map(s => s.totalHours), 1)
  const CAPACITY = 40 // assumed weekly capacity hours

  return (
    <div style={{ padding: '1.5rem', maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#f1f5f9', fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.2rem' }}>Capacity Dashboard</h2>
        <p style={{ color: '#475569', fontSize: '0.8rem', margin: 0 }}>
          Active workload across the team — {activeTasks.length} tasks, {activeTasks.reduce((s, t) => s + t.hours, 0)}h total
        </p>
      </div>

      {/* Overall brand breakdown */}
      <div style={{ backgroundColor: '#141720', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '1.25rem', marginBottom: '1.25rem' }}>
        <h3 style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 1rem' }}>
          Hours by Brand
        </h3>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {Object.entries(BRAND_COLORS).map(([brand, color]) => {
            const hrs = activeTasks.filter(t => t.account === brand).reduce((s, t) => s + t.hours, 0)
            const count = activeTasks.filter(t => t.account === brand).length
            if (hrs === 0 && count === 0) return null
            return (
              <div key={brand} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color }} />
                <div>
                  <div style={{ color: '#e2e8f0', fontSize: '0.82rem', fontWeight: 500 }}>{brand.split(' ')[0]}</div>
                  <div style={{ color: '#475569', fontSize: '0.7rem' }}>{hrs}h · {count} tasks</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Per-member rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {memberStats.map(({ member, myTasks, totalHours, highCount, byBrand }) => {
          const pct = Math.min(totalHours / CAPACITY, 1)
          const overloaded = totalHours > CAPACITY
          const barColor = overloaded ? '#ef4444' : totalHours > CAPACITY * 0.75 ? '#f97316' : '#6366f1'

          return (
            <div
              key={member.name}
              style={{ backgroundColor: '#141720', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '1rem 1.25rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.75rem' }}>
                {/* Avatar */}
                <div style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: member.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
                  {member.name.slice(0, 2).toUpperCase()}
                </div>

                {/* Name + role */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                    <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: '0.9rem' }}>{member.name}</span>
                    <span style={{ color: '#334155', fontSize: '0.72rem' }}>{member.role}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.15rem' }}>
                    <span style={{ fontSize: '0.72rem', color: overloaded ? '#ef4444' : '#64748b' }}>
                      {totalHours}h / {CAPACITY}h
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#334155' }}>{myTasks.length} tasks</span>
                    {highCount > 0 && (
                      <span style={{ fontSize: '0.67rem', color: '#fca5a5', backgroundColor: '#ef444418', borderRadius: 4, padding: '0.05rem 0.35rem' }}>
                        {highCount} high priority
                      </span>
                    )}
                  </div>
                </div>

                {/* Hours number */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: overloaded ? '#ef4444' : '#e2e8f0' }}>{totalHours}</div>
                  <div style={{ fontSize: '0.65rem', color: '#334155' }}>hours</div>
                </div>
              </div>

              {/* Bar */}
              <div style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden', marginBottom: '0.6rem' }}>
                <div style={{ height: '100%', width: `${pct * 100}%`, backgroundColor: barColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
              </div>

              {/* Brand breakdown mini-bars */}
              {Object.entries(byBrand).length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {Object.entries(byBrand).map(([brand, hrs]) => (
                    <div key={brand} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: BRAND_COLORS[brand] ?? '#475569' }} />
                      <span style={{ fontSize: '0.67rem', color: '#475569' }}>{brand.split(' ')[0]} {hrs}h</span>
                    </div>
                  ))}
                </div>
              )}

              {myTasks.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: '#1e293b' }}>No active tasks</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Priority breakdown */}
      <div style={{ backgroundColor: '#141720', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '1.25rem', marginTop: '1.25rem' }}>
        <h3 style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 1rem' }}>
          Priority Distribution
        </h3>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {(['High', 'Medium', 'Low'] as const).map(p => {
            const count = activeTasks.filter(t => t.priority === p).length
            return (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: PRIORITY_COLORS[p] }} />
                <span style={{ color: '#94a3b8', fontSize: '0.82rem' }}>{p}</span>
                <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '0.82rem' }}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
