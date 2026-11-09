import { redirect } from 'next/navigation'
import { getSessionMember } from '@/lib/authz'
import { teamHours } from '@/actions/hours'
import { isDate, weekOf } from '@/lib/hours'
import { HoursReport } from '@/components/hours/HoursReport'

export const dynamic = 'force-dynamic'

/** The admin's weekly hours report (spec 014 US4). Everyone else goes to My Day. */
export default async function HoursPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const member = await getSessionMember()
  if (!member) redirect('/login')
  if (member.access !== 'admin') redirect('/overview')
  const today = new Date().toISOString().slice(0, 10)
  const { week } = await searchParams
  const sunday = weekOf(week && isDate(week) && week <= today ? week : today)
  const res = await teamHours(sunday, today)
  if (!res.success) redirect('/overview')
  return (
    <div className="fx-hr-page">
      <HoursReport report={res} today={today} />
    </div>
  )
}
