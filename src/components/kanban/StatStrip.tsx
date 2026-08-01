'use client'

import type { Task } from '@/types/index'
import { calDaysBetween } from '@/lib/utils'

interface StatStripProps {
  tasks: Task[]
  today: Date
}

export function StatStrip({ tasks, today }: StatStripProps) {
  const total      = tasks.length
  const inProgress = tasks.filter(t => t.status !== 'publish').length
  const dueToday   = tasks.filter(t => {
    if (!t.due_date) return false
    const d = calDaysBetween(today, new Date(t.due_date))
    return d === 0 && t.status !== 'publish'
  }).length

  const stats = [
    { label: 'Total tasks',  value: total },
    { label: 'In progress',  value: inProgress },
    { label: 'Due today',    value: dueToday },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 24,
      padding: '8px 20px',
      borderBottom: '1px solid var(--line)',
      flexShrink: 0,
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && (
            <div style={{ width: 1, height: 16, background: 'var(--line)' }} />
          )}
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)', fontWeight: 500 }}>
            {s.label}
          </span>
          <span style={{ fontSize: '0.82rem', color: 'var(--ink)', fontWeight: 700 }}>
            {s.value}
          </span>
        </div>
      ))}
    </div>
  )
}
