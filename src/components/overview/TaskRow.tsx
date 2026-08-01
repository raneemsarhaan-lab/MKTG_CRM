'use client'

import type { Task, SLAConfig } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { ALERT_BADGE_STYLES, STAGE_COLORS } from '@/lib/tokens'
import { getAlertStatus } from '@/lib/alert-status'
import { calDaysBetween } from '@/lib/utils'
import { useUIStore } from '@/store/useUIStore'

interface TaskRowProps {
  task: Task
  slaConfig: SLAConfig
  today: Date
}

export function TaskRow({ task, slaConfig, today }: TaskRowProps) {
  const selectTask = useUIStore(s => s.selectTask)
  const alertStatus = getAlertStatus(task, slaConfig, today)
  const badge       = ALERT_BADGE_STYLES[alertStatus]
  const dotColor    = STAGE_COLORS[task.status] ?? '#94A3B8'
  const stageMeta   = STAGE_META[task.status]

  const daysLeft = calDaysBetween(today, new Date(task.due_date))
  const overdue  = daysLeft < 0
  const dueLabel = overdue
    ? `${Math.abs(daysLeft)}d late`
    : daysLeft === 0 ? 'Today'
    : `in ${daysLeft}d`

  return (
    <div
      onClick={() => selectTask(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') selectTask(task.id) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 0', borderTop: '1px solid #F1EFFA', cursor: 'pointer',
        outline: 'none',
      }}
    >
      {/* Stage color dot */}
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />

      {/* Task info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: '0.88rem', color: 'var(--ink)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {task.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <span style={{
            fontSize: '0.65rem', fontWeight: 700,
            background: badge.bg, color: badge.text,
            padding: '1px 7px', borderRadius: 5,
          }}>
            {alertStatus}
          </span>
          <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>
            {stageMeta.label_en}
          </span>
        </div>
      </div>

      {/* Due date */}
      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 56 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: overdue ? '#F5334F' : 'var(--ink)' }}>
          {dueLabel}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
          {new Date(task.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
        </div>
      </div>
    </div>
  )
}
