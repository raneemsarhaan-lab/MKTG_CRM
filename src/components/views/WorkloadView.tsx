'use client'

/**
 * Workload view (spec 021 US2): open hours per person for the tasks on this
 * page, split by brand, against each person's weekly capacity.
 */
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { addDays, cairoToday, weekday } from '@/lib/due-dates'
import { getWorkWeekend } from '@/lib/utils'
import type { Brand, Member } from '@/types/index'
import { PIPE } from '@/lib/pipeline-tokens'
import { dayLoad, taskLoad } from '@/lib/task-load'
import { initials, avatarColor } from '@/lib/utils'
import type { ViewTask } from './types'

export function WorkloadView({ tasks, members, brands }: { tasks: ViewTask[]; members: Member[]; brands: Brand[] }) {
  const t = useTranslations('views')
  const locale = useLocale()
  const rows = taskLoad(tasks)
  const brandColor = new Map(brands.map(b => [b.id, b.color]))
  // Spec 023 (US6): a week of days; each task's hours spread from its start to its due date.
  const today = cairoToday()
  const [weekStart, setWeekStart] = useState(() => addDays(today, -weekday(today)))
  const weekend = getWorkWeekend()
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const perDay = useMemo(() => dayLoad(tasks, days, weekend), [tasks, days, weekend])
  const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
  const nav: React.CSSProperties = { border: `1px solid ${PIPE.border}`, background: '#FFFFFF', borderRadius: 8, padding: '2px 9px', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: PIPE.ink }
  return (
    <div data-workload-view style={{ padding: '18px 26px 30px 38px', display: 'grid', gap: 12, maxWidth: 820 }}>
      <div data-workload-week={weekStart} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: PIPE.textSecondary }}>
        <button type="button" style={nav} aria-label={t('weekPrev')} data-workload-nav="prev" onClick={() => setWeekStart(w => addDays(w, -7))}>‹</button>
        <span style={{ fontWeight: 700, color: PIPE.ink }}>{t('weekOf', { day: dayLabel(weekStart) })}</span>
        <button type="button" style={nav} aria-label={t('weekNext')} data-workload-nav="next" onClick={() => setWeekStart(w => addDays(w, 7))}>›</button>
        <span style={{ color: PIPE.textMuted }}>{t('weekNote')}</span>
      </div>
      {rows.length === 0 && <p style={{ color: PIPE.textMuted, fontSize: 13 }}>—</p>}
      {rows.map(r => {
        const m = members.find(x => x.id === r.memberId)
        if (!m) return null
        const cap = m.capacity_hrs_wk || 40
        return (
          <div key={r.memberId} data-load={r.memberId} style={{ display: 'grid', gridTemplateColumns: '170px minmax(0,1fr) 110px', gap: 12, alignItems: 'center' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: PIPE.ink, minWidth: 0 }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: avatarColor(m.name), color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 800, flexShrink: 0 }}>{initials(m.name)}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
            </span>
            <div aria-label={`${r.hours}h of ${cap}h`} style={{ height: 14, background: PIPE.surface, border: `1px solid ${PIPE.border}`, borderRadius: 999, overflow: 'hidden', display: 'flex' }}>
              {Object.entries(r.byBrand).map(([b, h]) => (
                <span key={b} style={{ width: `${Math.min(100, (h / cap) * 100)}%`, background: brandColor.get(b) ?? PIPE.textFaint }} />
              ))}
            </div>
            <span style={{ fontSize: 12, textAlign: 'end', color: r.hours > cap ? '#D22040' : PIPE.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
              {r.hours}h / {cap}h · {r.tasks}
            </span>
            <div style={{ gridColumn: '2 / 3', display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
              {days.map(d => {
                const h = perDay[r.memberId]?.[d] ?? 0
                const off = weekend.includes(weekday(d))
                const daily = cap / 5
                return (
                  <span key={d} data-load-day={d} data-hours={h} title={`${dayLabel(d)} · ${h}h`}
                    style={{ fontSize: 11, textAlign: 'center', padding: '2px 0', borderRadius: 6, fontVariantNumeric: 'tabular-nums',
                      background: off ? PIPE.surface : h > daily ? '#FDE8EC' : h > 0 ? '#F4FBD6' : '#FFFFFF',
                      color: h > daily ? '#D22040' : off ? PIPE.textFaint : PIPE.textSecondary, border: `1px solid ${PIPE.border}` }}>
                    {h ? `${Math.round(h * 10) / 10}h` : '·'}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
      <p style={{ margin: 0, fontSize: 12, color: PIPE.textMuted }}>{t('workload')}: {t('workloadNote')}</p>
    </div>
  )
}
