'use client'

/**
 * The team's weekly hours (spec 014 US4, FR-030–FR-034; contracts/ui.md §4), on
 * Working Hours under Today's hours, for the Marketing Manager only (approved
 * design `design/working-hours.html`).
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
    <section className="fx-hr-report fx-hr-card" id="team-hours" data-hours-report="" aria-labelledby="fx-hr-rep-title">
      <div className="fx-hr-rep-head">
        <h2 id="fx-hr-rep-title">{t('report.teamTitle')}</h2>
        <span className="fx-hr-mgr" data-hours-manager-only="">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          {t('report.managerOnly')}
        </span>
        <nav className="fx-hr-weeknav" aria-label={span}>
          <Link href={`/overview?week=${prev}#team-hours`} scroll={false} aria-label={t('report.prev')} data-week-prev="">‹</Link>
          <span>{span}</span>
          {next <= today
            ? <Link href={`/overview?week=${next}#team-hours`} scroll={false} aria-label={t('report.next')} data-week-next="">›</Link>
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
