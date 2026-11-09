'use client'

/**
 * The admin's weekly hours report (spec 014 US4, FR-030–FR-034; contracts/ui.md §4).
 * One row per member, Sunday to Thursday (Friday and Saturday only when
 * someone logged them), totals against capacity, per-day totals, and Missing
 * marked with a word and an icon, not colour alone.
 */
import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import type { HoursWeekReport } from '@/types/index'
import { addDays, isWorkingDay } from '@/lib/hours'

export function HoursReport({ report, today }: { report: HoursWeekReport; today: string }) {
  const t = useTranslations('hours')
  const f = useFormatter()
  const num = (n: number) => f.number(n, { maximumFractionDigits: 2 })
  const day = (d: string, o: { weekday?: 'short'; day?: 'numeric'; month?: 'short' }) => f.dateTime(new Date(`${d}T12:00:00`), o as never)
  const shown = report.days.filter(d => isWorkingDay(d) || report.rows.some(r => r.days[d]))
  const span = `${day(report.days[0], { day: 'numeric', month: 'short' })} – ${day(report.days[6], { day: 'numeric', month: 'short' })}`
  const prev = addDays(report.weekStart, -7), next = addDays(report.weekStart, 7)
  const total = Object.values(report.dayTotals).reduce((a, b) => a + b, 0)

  return (
    <section className="fx-hr-report" data-hours-report="" aria-labelledby="fx-hr-rep-title">
      <div className="fx-hr-rep-head">
        <h1 id="fx-hr-rep-title">{t('report.title')}</h1>
        <nav className="fx-hr-weeknav" aria-label={span}>
          <Link href={`/hours?week=${prev}`} aria-label={t('report.prev')} data-week-prev="">‹</Link>
          <span>{span}</span>
          {next <= today
            ? <Link href={`/hours?week=${next}`} aria-label={t('report.next')} data-week-next="">›</Link>
            : <span className="is-dim" aria-hidden="true">›</span>}
        </nav>
        <a className="fx-hr-dl" href={`/hours/export?week=${report.weekStart}`} download data-hours-export="">{t('report.download')}</a>
      </div>
      <p className="fx-hr-sum">{t('report.complete', { done: num(report.completeCount), all: num(report.rows.length) })}</p>
      {report.rows.length === 0
        ? <p className="fx-hr-sum">{t('report.empty')}</p>
        : (
          <div className="fx-hr-tbl" tabIndex={0} role="region" aria-labelledby="fx-hr-cap">
            <table>
              <caption id="fx-hr-cap">{t('report.caption', { week: span })}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('report.member')}</th>
                  {shown.map(d => <th key={d} scope="col" className={isWorkingDay(d) ? '' : 'is-weekend'}>{day(d, { weekday: 'short', day: 'numeric' })}</th>)}
                  <th scope="col">{t('report.total')}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map(r => (
                  <tr key={r.memberId} data-hours-row={r.memberId}>
                    <th scope="row">{r.name}</th>
                    {shown.map(d => {
                      const e = r.days[d]
                      if (e?.off) return <td key={d} className="is-off">{t('off')}</td>
                      if (e && typeof e.hours === 'number') return <td key={d}>{num(e.hours)}</td>
                      const missing = isWorkingDay(d) && d < today
                      return <td key={d} className={missing ? 'is-miss' : 'is-empty'}>{missing ? <><span aria-hidden="true">⚠ </span>{t('missing')}</> : '–'}</td>
                    })}
                    <td className="is-total">{num(r.total)} <small>{t('report.of', { capacity: num(r.capacity) })}</small></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t('report.dayTotal')}</th>
                  {shown.map(d => <td key={d}>{num(report.dayTotals[d] ?? 0)}</td>)}
                  <td className="is-total">{num(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
    </section>
  )
}
