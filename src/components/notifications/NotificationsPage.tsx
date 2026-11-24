'use client'

/**
 * The full history (spec 012 US9, contracts/ui.md §5): the same rows as the
 * panel, loading as the list scrolls. One row of filters (user, 24 Nov 2026):
 * All or one group of kinds, and one list for the dates.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { AppNotification, NotificationKind } from '@/types/index'
import { useNotify } from './NotifyProvider'
import { useNotificationList } from './useNotificationList'
import { NotificationList } from './NotificationList'

type Range = 'any' | 'today' | 'week' | 'month'

/** The twelve kinds, in the four groups people look for. */
export const KIND_GROUPS: Record<'mentions' | 'comments' | 'assigned' | 'deadlines', NotificationKind[]> = {
  mentions: ['mention', 'sheet_mention'],
  comments: ['comment', 'reply', 'sheet_reply', 'attachment'],
  assigned: ['assigned', 'task_created_in_stage', 'task_moved_to_stage'],
  deadlines: ['due_soon', 'overdue', 'urgent'],
}
type Group = keyof typeof KIND_GROUPS | 'all'
const GROUPS: Group[] = ['all', 'mentions', 'comments', 'assigned', 'deadlines']

/** The start of a range, in the member's own day. */
export function rangeStart(range: Range, now: Date): string | null {
  if (range === 'any') return null
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (range === 'week') d.setDate(d.getDate() - 6)
  if (range === 'month') d.setDate(d.getDate() - 29)
  return d.toISOString()
}

export function NotificationsPage() {
  const ctx = useNotify()
  const t = useTranslations('notifications')
  const [group, setGroup] = useState<Group>('all')
  const [range, setRange] = useState<Range>('any')
  const kinds = useMemo(() => (group === 'all' ? [] : KIND_GROUPS[group]), [group])
  const from = useMemo(() => rangeStart(range, new Date()), [range])
  const list = useNotificationList({ tab: 'all', kinds, from })
  const filtered = group !== 'all' || range !== 'any'

  function open(n: AppNotification) {
    if (!n.read) void list.setRead(n.id, true)
    void ctx?.open(n.id)
  }

  return (
    <div className="fx-nt-page" data-nt-history="">
      <Link href="/me" className="fx-nt-link fx-nt-back">← {t('back')}</Link>
      <h1>{t('history.title')}</h1>
      <div className="fx-nt-filters">
        <div className="fx-nt-chips" role="group" aria-label={t('history.kinds')}>
          {GROUPS.map(g => (
            <button key={g} type="button" className="fx-nt-chip" aria-pressed={group === g} data-nt-filter-group={g} onClick={() => setGroup(g)}>
              {t(`history.groups.${g}`)}
            </button>
          ))}
        </div>
        <select className="fx-nt-range" id="fx-nt-range" aria-label={t('history.dates')} data-nt-filter-range="" value={range}
                onChange={e => setRange(e.target.value as Range)}>
          {(['any', 'today', 'week', 'month'] as const).map(r => <option key={r} value={r}>{t(`history.${r}`)}</option>)}
        </select>
      </div>
      <section className="fx-nt-card">
        <NotificationList list={list} meId={ctx?.meId ?? ''} onOpen={open}
                          emptyText={filtered ? { title: t('history.none') } : undefined} />
      </section>
    </div>
  )
}
