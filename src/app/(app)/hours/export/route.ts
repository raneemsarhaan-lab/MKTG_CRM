import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { getSessionMember } from '@/lib/authz'
import { teamHours } from '@/actions/hours'
import { isDate, toCsv, weekOf } from '@/lib/hours'

/** The weekly report as CSV (spec 014 R4): admins only, UTF-8 with a BOM. */
export async function GET(req: Request) {
  const member = await getSessionMember()
  if (!member || member.access !== 'admin') return new Response('Forbidden', { status: 403 })
  const week = new URL(req.url).searchParams.get('week') ?? ''
  const today = new Date().toISOString().slice(0, 10)
  const sunday = weekOf(isDate(week) ? week : today)
  const res = await teamHours(sunday, today)
  if (!res.success) return new Response('Forbidden', { status: 403 })
  const locale = (await cookies()).get('fluxo-locale')?.value === 'ar' ? 'ar' : 'en'
  const t = await getTranslations({ locale, namespace: 'hours' })
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  const csv = toCsv(res, {
    member: t('report.member'), total: t('report.total'), capacity: t('report.capacity'), dayTotal: t('report.dayTotal'),
    off: t('off'), missing: t('missing'), dayHeading: d => fmt.format(new Date(`${d}T00:00:00Z`)),
  })
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hours-${sunday}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
