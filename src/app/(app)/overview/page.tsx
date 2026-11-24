import { redirect } from 'next/navigation'
import { getSessionMember, isHoursManager } from '@/lib/authz'
import { GreetingHeader } from '@/components/myboard/GreetingHeader'
import { TodayHoursApp } from '@/components/hours/pages'
import { HoursReport } from '@/components/hours/HoursReport'
import { hoursStatus, teamHours } from '@/actions/hours'
import { isDate, weekOf } from '@/lib/hours'
import { DEFAULT_TZ, teamClock, teamDay } from '@/lib/notify/days'

export const dynamic = 'force-dynamic'

/**
 * Working Hours (approved design `design/working-hours.html`).
 *
 * The page that was My Day: the greeting, then "Today's hours" for everyone,
 * then the team's weekly hours for the Marketing Manager only (the report that
 * was /hours). The dashboard that used to be here (stat cards, the day
 * planner, This Week, Last Week, SLA Breached) is hidden; its components are
 * kept in `components/myboard` for when it comes back.
 */
export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')

  // The team's day and hour (Cairo unless NOTIFY_TZ says otherwise), not UTC:
  // just after midnight in Cairo UTC still says yesterday, which would leave
  // yesterday unmarked as Missing and the greeting a day behind.
  const now   = new Date()
  const tz    = process.env.NOTIFY_TZ || DEFAULT_TZ
  const today = teamDay(now, tz)
  const hour  = teamClock(now, tz).h
  const manager = await isHoursManager(member)
  const { week } = await searchParams
  const [hoursRes, reportRes] = await Promise.all([
    hoursStatus(today),
    manager ? teamHours(weekOf(week && isDate(week) && week <= today ? week : today), today) : null,
  ])

  return (
    <div className="fx-myboard fx-wh-page" style={{ padding: '36px 44px 44px' }}>
      <GreetingHeader firstName={member.name.split(' ')[0]} today={today} hour={hour} />
      <TodayHoursApp initial={hoursRes.success ? hoursRes : null} />
      {reportRes?.success && <HoursReport report={reportRes} today={today} />}
    </div>
  )
}
