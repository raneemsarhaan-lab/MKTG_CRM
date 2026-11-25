'use client'

/**
 * The full history (spec 012 US9, contracts/ui.md §5): filter by kind (any
 * number of chips) and by date (any time, today, the last 7 or 30 days), the
 * same rows as the panel, loading as the list scrolls.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { AppNotification, NotificationKind } from '@/types/index'
import { useNotify } from './NotifyProvider'
import { useNotificationList } from './useNotificationList'
import { NotificationList } from './NotificationList'
import { SETTINGS_ORDER } from './NotificationSettings'

type Range = 'any' | 'today' | 'week' | 'month'

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
  const [kinds, setKinds] = useState<NotificationKind[]>([])
  const [range, setRange] = useState<Range>('any')
  const from = useMemo(() => rangeStart(range, new Date()), [range])
  const list = useNotificationList({ tab: 'all', kinds, from })
  const filtered = kinds.length > 0 || range !== 'any'

  function toggleKind(k: NotificationKind) {
    setKinds(ks => (ks.includes(k) ? ks.filter(x => x !== k) : [...ks, k]))
  }

  function open(n: AppNotification) {
    if (!n.read) void list.setRead(n.id, true)
    void ctx?.open(n.id)
  }

  return (
    <div className="fx-nt-page" data-nt-history="">
      <Link href="/board" className="fx-nt-link fx-nt-back">← {t('back')}</Link>
      <h1>{t('history.title')}</h1>
      <div className="fx-nt-filters">
        <div className="fx-nt-chips" role="group" aria-label={t('history.kinds')}>
          {SETTINGS_ORDER.map(k => (
            <button key={k} type="button" className="fx-nt-chip" aria-pressed={kinds.includes(k)} data-nt-filter-kind={k}
                    onClick={() => toggleKind(k)}>
              {t(`kinds.${k}`)}
            </button>
          ))}
        </div>
        <div className="fx-nt-chips" role="group" aria-label={t('history.dates')}>
          {(['any', 'today', 'week', 'month'] as const).map(r => (
            <button key={r} type="button" className="fx-nt-chip" aria-pressed={range === r} data-nt-filter-range={r}
                    onClick={() => setRange(r)}>
              {t(`history.${r}`)}
            </button>
          ))}
          {filtered && (
            <button type="button" className="fx-nt-link" data-nt-clear="" onClick={() => { setKinds([]); setRange('any') }}>
              {t('history.clear')}
            </button>
          )}
        </div>
      </div>
      <section className="fx-nt-card">
        <NotificationList list={list} meId={ctx?.meId ?? ''} onOpen={open}
                          emptyText={filtered ? { title: t('history.none') } : undefined} />
      </section>
    </div>
  )
}
