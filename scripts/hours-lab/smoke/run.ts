/**
 * Smoke test of src/actions/hours.ts against local PostgreSQL (spec 014 T010).
 * Run: DATABASE_URL=… npx tsx --tsconfig scripts/hours-lab/smoke/tsconfig.json scripts/hours-lab/smoke/run.ts
 * The member is SMOKE_MEMBER (an admin by default); the content creator is used for the member-only checks.
 */
import * as A from '@/actions/hours'
import { prisma } from '@/lib/prisma'
import { addDays, lastWorkingDayBefore } from '@/lib/hours'

let failed = 0
const ok = (cond: unknown, msg: string) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failed++ }
const ADMIN = 'raneem.sarhaan@forefront.consulting', MEMBER = 'content@forefront.consulting'
const as = (email: string) => { process.env.SMOKE_MEMBER = email }
const today = new Date().toISOString().slice(0, 10)

async function main() {
  const member = await prisma.member.findFirstOrThrow({ where: { email: MEMBER } })
  const admin = await prisma.member.findFirstOrThrow({ where: { email: ADMIN } })
  const reset = async () => {
    await prisma.workDay.deleteMany({ where: { member_id: { in: [member.id, admin.id] }, date: { gte: new Date(`${addDays(today, -60)}T00:00:00Z`) } } })
    await prisma.member.updateMany({ where: { id: { in: [member.id, admin.id] } }, data: { hours_prompted_on: null } })
  }
  await reset()

  as(MEMBER)
  let st = await A.hoursStatus(today)
  const want = lastWorkingDayBefore(today, member.created_at.toISOString().slice(0, 10))
  ok(st.success && st.remindDay === want && !st.prompted, `the reminder asks about ${want}`)
  ok(st.success && st.recent.length === 7 && st.recent[6].date === today, 'the last 7 days end today')

  const save = await A.saveDays([{ date: today, hours: 7.5, off: false }])
  ok(save.success, 'save today 7.5')
  st = await A.hoursStatus(today)
  ok(st.success && st.recent[6].hours === 7.5, 'today shows 7.5')
  ok(st.success && st.weekTotal >= 7.5, 'counted in this week')
  await A.saveDays([{ date: today, hours: 8, off: false }])
  const rows = await prisma.workDay.findMany({ where: { member_id: member.id, date: new Date(`${today}T00:00:00Z`) } })
  ok(rows.length === 1 && Number(rows[0].hours) === 8, 'saving again replaces: one row, 8')

  const bad = await A.saveDays([{ date: addDays(today, -1), hours: 8, off: false }, { date: addDays(today, -2), hours: 30, off: false }])
  ok(!bad.success && 'lines' in bad && bad.lines.length === 1 && bad.lines[0].error === 'bad_hours', 'one bad line: refused, named')
  ok((await prisma.workDay.count({ where: { member_id: member.id, date: new Date(`${addDays(today, -1)}T00:00:00Z`) } })) === 0, 'all or nothing: the good line was not saved')

  const many = await A.saveDays([{ date: addDays(today, -1), hours: 8, off: false }, { date: addDays(today, -2), hours: null, off: true }, { date: addDays(today, -3), hours: 6.25, off: false }])
  ok(many.success && many.saved.length === 3, 'three days in one save')
  ok((await A.saveDays([{ date: addDays(today, -3), hours: null, off: false }])).success, 'clear a day')
  ok((await prisma.workDay.count({ where: { member_id: member.id, date: new Date(`${addDays(today, -3)}T00:00:00Z`) } })) === 0, 'cleared means no row (Missing)')

  const old = await A.saveDays([{ date: addDays(today, -40), hours: 8, off: false }])
  ok(!old.success && 'lines' in old && old.lines[0].error === 'too_old', 'a member can’t change a day older than 30')
  const fut = await A.saveDays([{ date: addDays(today, 3), hours: 8, off: false }])
  ok(!fut.success && 'lines' in fut && fut.lines[0].error === 'future', 'no future days')
  ok(!(await A.saveDays([{ date: today, hours: 8, off: false }], { memberId: admin.id })).success, 'a member can’t save someone else’s day')
  ok(!(await A.teamHours(today)).success, 'a member can’t see the report')

  await A.dismissReminder(today)
  st = await A.hoursStatus(today)
  ok(st.success && st.prompted, 'Later: prompted today, on every device')

  as(ADMIN)
  ok((await A.saveDays([{ date: addDays(today, -40), hours: 5, off: false }], { memberId: member.id })).success, 'an admin can correct an old day for someone')
  const rep = await A.teamHours(today, today)
  ok(rep.success && rep.days.length === 7 && rep.days[0] <= today && rep.days[6] >= today, 'the report covers this week')
  const row = rep.success ? rep.rows.find(r => r.memberId === member.id) : undefined
  ok(row && row.days[today]?.hours === 8, 'the member’s today shows in the report')
  ok(rep.success && typeof rep.dayTotals[today] === 'number' && rep.dayTotals[today] >= 8, 'day totals')

  await reset()
  console.log(failed ? `\n${failed} failed` : '\nall passed')
  await prisma.$disconnect()
  process.exit(failed ? 1 : 0)
}
main().catch(async e => { console.error(e); await prisma.$disconnect(); process.exit(1) })
