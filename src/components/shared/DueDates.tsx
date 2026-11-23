'use client'

/**
 * Publishing and due dates as they show on cards, rows and panels: each with
 * its own label, written one way ("Tue 15 Dec"), a due date past in Cairo in
 * red, and a small ✎ on a due date someone set by hand.
 */
import { useLocale, useTranslations } from 'next-intl'
import { formatDay, isOverdue } from '@/lib/due-dates'

/** The subtle mark on a hand-set due date. */
export function ManualMark({ label }: { label: string }) {
  return (
    <span data-due-manual-mark="" title={label} aria-label={label}
          style={{ marginInlineStart: 4, fontSize: '0.85em', opacity: 0.6, fontWeight: 400 }}>✎</span>
  )
}

/** "Publishing Tue 15 Dec · Due Tue 8 Dec ✎" for a card or a row. */
export function TaskDates({ task, size = 11.5 }: {
  task: { publish_date?: string | null; due_date?: string | null; due_manual?: boolean; status?: string; kind?: string | null; simple_status?: string | null; dropped_at?: string | null }
  size?: number
}) {
  const t = useTranslations('dates')
  const locale = useLocale()
  if (!task.publish_date && !task.due_date) return null
  const late = isOverdue(task)
  return (
    <span data-task-dates="" style={{ display: 'flex', flexWrap: 'wrap', columnGap: 10, rowGap: 2, fontSize: size, color: '#6B7280' }}>
      {task.publish_date && (
        <span data-card-publish={task.publish_date.slice(0, 10)}>
          <span style={{ fontWeight: 600 }}>{t('publishShort')}</span> {formatDay(task.publish_date, locale)}
        </span>
      )}
      {task.due_date && (
        <span data-card-due={task.due_date.slice(0, 10)} data-overdue={late ? 'true' : undefined} style={late ? { color: '#D22040' } : undefined}>
          <span style={{ fontWeight: 600 }}>{t('dueShort')}</span> {formatDay(task.due_date, locale)}
          {task.due_manual && <ManualMark label={t('manual')} />}
        </span>
      )}
    </span>
  )
}
