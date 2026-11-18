import { redirect } from 'next/navigation'
import { isDate } from '@/lib/hours'

/** The team hours report now lives on Working Hours (/overview), under Today's hours. */
export default async function HoursPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams
  redirect(week && isDate(week) ? `/overview?week=${week}#team-hours` : '/overview#team-hours')
}
