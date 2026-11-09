'use server'

/**
 * Daily working hours (spec 014, contracts/server.md).
 *
 * Dates are the member's own calendar days, sent by the browser as
 * 'YYYY-MM-DD' (research R1). The server checks them against its own UTC day,
 * allowing one day ahead for time zones east of UTC.
 *
 * Every action acts for the session member. Other people's hours, the weekly
 * report, and days older than 30 are admin-only (R7).
 */
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import type { HoursStatus, HoursWeekReport, WorkDayEntry } from '@/types/index'
import {
  MAX_LINES, addDays, isDate, isWorkingDay, lastWorkingDayBefore, missingDays, sum, validateLines, weekComplete,
  weekDays, weekOf, hoursOf, weekTotals, type Line, type LineError,
} from '@/lib/hours'

type Fail = { success: false; error: string }
const fail = (error: string): Fail => ({ success: false, error })
const isAdmin = (m: { access: string }) => m.access === 'admin'

const serverToday = () => new Date().toISOString().slice(0, 10)
const asDate = (d: string) => new Date(`${d}T00:00:00.000Z`)
const ymd = (d: Date) => d.toISOString().slice(0, 10)
/** The browser's date if it is within a day of the server's; otherwise the server's. */
function trustDate(local: string): string {
  const today = serverToday()
  if (!isDate(local)) return today
  return local >= addDays(today, -1) && local <= addDays(today, 1) ? local : today
}
const entryOf = (r: { date: Date; hours: unknown; off: boolean }): WorkDayEntry => ({
  date: ymd(r.date), off: r.off, hours: r.off || r.hours === null ? null : Number(r.hours),
})

/** My Day and the reminder: what the member has logged, and what is missing (R2). */
export async function hoursStatus(localDate: string): Promise<({ success: true } & HoursStatus) | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const today = trustDate(localDate)
  const since = ymd(m.created_at)
  const from = addDays(today, -30)
  const rows = await prisma.workDay.findMany({ where: { member_id: m.id, date: { gte: asDate(from), lte: asDate(today) } } })
  const byDate = new Map(rows.map(r => [ymd(r.date), entryOf(r)]))
  const logged = new Set(byDate.keys())
  const remind = lastWorkingDayBefore(today, since)
  const remindDay = remind && !logged.has(remind) ? remind : null
  const missing = missingDays(logged, from, addDays(today, -1), since).filter(d => d !== remindDay)
  const recent = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map(d =>
    byDate.get(d) ?? { date: d, hours: null, off: false as const, missing: isWorkingDay(d) && d < today && d >= since })
  const weekStart = weekOf(today)
  const weekTotal = sum([...byDate.values()].filter(e => e.date >= weekStart && e.date <= today).map(e => hoursOf(e)))
  const prompted = !!m.hours_prompted_on && ymd(m.hours_prompted_on) === today
  return { success: true, localDate: today, remindDay, missing, prompted, recent, weekTotal, capacity: m.capacity_hrs_wk, since }
}

/** The member's own days in a range of at most 31 days. */
export async function myHours(from: string, to: string): Promise<{ success: true; entries: WorkDayEntry[] } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  if (!isDate(from) || !isDate(to) || from > to || addDays(from, 31) < to) return fail('bad_date')
  const rows = await prisma.workDay.findMany({ where: { member_id: m.id, date: { gte: asDate(from), lte: asDate(to) } }, orderBy: { date: 'asc' } })
  return { success: true, entries: rows.map(entryOf) }
}

/**
 * Save several days at once, all or nothing (R3). `hours: null, off: false`
 * clears a day. Admins may pass `memberId` to correct someone else's days, and
 * may save days older than 30.
 */
export async function saveDays(entries: Line[], opts: { memberId?: string } = {}): Promise<
  | { success: true; saved: WorkDayEntry[] }
  | { success: false; error: 'invalid'; lines: { date: string; error: LineError }[] }
  | Fail
> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const admin = isAdmin(m)
  const memberId = opts.memberId ?? m.id
  if (memberId !== m.id && !admin) return fail('not_authorized')
  if (!Array.isArray(entries) || !entries.length) return fail('invalid')
  if (entries.length > MAX_LINES) return fail('too_many')
  const lines = entries.map(e => ({ date: String(e.date), off: !!e.off, hours: e.off || e.hours === null || e.hours === undefined ? null : Number(e.hours) }))
  const errors = validateLines(lines, { today: serverToday(), admin })
  if (errors.length) return { success: false, error: 'invalid', lines: errors }
  if (memberId !== m.id && !(await prisma.member.findUnique({ where: { id: memberId }, select: { id: true } }))) return fail('gone')

  await prisma.$transaction(async tx => {
    for (const l of lines) {
      const where = { member_id_date: { member_id: memberId, date: asDate(l.date) } }
      if (!l.off && l.hours === null) { await tx.workDay.deleteMany({ where: { member_id: memberId, date: asDate(l.date) } }); continue }
      const data = { hours: l.off ? null : l.hours, off: l.off, updated_by: m.id }
      await tx.workDay.upsert({ where, create: { member_id: memberId, date: asDate(l.date), ...data }, update: data })
    }
  })
  return { success: true, saved: lines.filter(l => l.off || l.hours !== null) }
}

/** The reminder opened, or was put off with Later: not again today, on any device (R2). */
export async function dismissReminder(localDate: string): Promise<{ success: true } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  await prisma.member.update({ where: { id: m.id }, data: { hours_prompted_on: asDate(trustDate(localDate)) } })
  return { success: true }
}

/** The admin's weekly report (R4): every member, Sunday to Saturday, with totals. */
export async function teamHours(weekStart: string, localDate?: string): Promise<({ success: true } & HoursWeekReport) | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  if (!isAdmin(m)) return fail('not_authorized')
  if (!isDate(weekStart)) return fail('bad_date')
  const sunday = weekOf(weekStart)
  const days = weekDays(sunday)
  const today = trustDate(localDate ?? serverToday())
  const [members, rows] = await Promise.all([
    prisma.member.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, capacity_hrs_wk: true, created_at: true } }),
    prisma.workDay.findMany({ where: { date: { gte: asDate(days[0]), lte: asDate(days[6]) } } }),
  ])
  const byMember = new Map<string, Record<string, WorkDayEntry | null>>()
  for (const r of rows) {
    const map = byMember.get(r.member_id) ?? {}
    map[ymd(r.date)] = entryOf(r)
    byMember.set(r.member_id, map)
  }
  const list = members
    .filter(mm => ymd(mm.created_at) <= days[6])
    .map(mm => {
      const own = byMember.get(mm.id) ?? {}
      const dayMap = Object.fromEntries(days.map(d => [d, own[d] ?? null])) as Record<string, WorkDayEntry | null>
      return {
        memberId: mm.id, name: mm.name, capacity: mm.capacity_hrs_wk, days: dayMap,
        total: sum(days.map(d => hoursOf(dayMap[d]))),
        complete: weekComplete(dayMap, days, addDays(today, 1), ymd(mm.created_at)),
      }
    })
  const totals = weekTotals(list, days)
  return {
    success: true, weekStart: sunday, days, rows: list, dayTotals: totals.perDay,
    completeCount: list.filter(r => r.complete).length,
  }
}
