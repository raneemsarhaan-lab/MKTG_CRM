'use client'

import type { Task, SLAConfig } from '@/types/index'
import { calDaysBetween } from '@/lib/utils'
import { TaskRow } from './TaskRow'

interface TaskPanelProps {
  title: string
  variant: 'my-day' | 'up-next'
  tasks: Task[]
  slaConfig: SLAConfig
  today: Date
  accentColor?: string
}

export function TaskPanel({ title, variant, tasks, slaConfig, today, accentColor = 'var(--lime)' }: TaskPanelProps) {
  const filtered = tasks
    .filter(t => {
      if (t.status === 'publish') return false
      const d = calDaysBetween(today, new Date(t.due_date))
      if (variant === 'my-day')  return d <= 0
      if (variant === 'up-next') return d >= 1 && d <= 7
      return false
    })
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  const ICON = variant === 'my-day' ? '☀️' : '📅'

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: '1px solid var(--line)',
      boxShadow: '0 1px 3px rgba(28,24,54,.04)',
      padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1rem', color: 'var(--ink)' }}>
          {ICON} {title}
        </span>
        <span style={{
          fontSize: '0.72rem', fontWeight: 700,
          background: `${accentColor}22`, color: accentColor,
          padding: '2px 8px', borderRadius: 99,
        }}>
          {filtered.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--muted)', fontSize: '0.82rem', borderTop: '1px solid #F1EFFA', marginTop: 8 }}>
          Nothing here 🎉
        </div>
      ) : (
        filtered.slice(0, 5).map(t => (
          <TaskRow key={t.id} task={t} slaConfig={slaConfig} today={today} />
        ))
      )}
    </div>
  )
}
