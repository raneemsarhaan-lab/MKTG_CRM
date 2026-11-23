/**
 * Spec 023 SC-005: a weekly repeat over 8 weeks makes exactly 8 tasks, each on
 * its creation day, with no duplicates after a missed scheduler day or a
 * second run. Runs the real job (runRecurring) against the lab database with
 * a simulated clock, then removes what it made.
 *
 *   DATABASE_URL=… npx tsx scripts/spaces-lab/recurring-8-weeks.ts
 */
import { prisma } from '@/lib/prisma'
import { runRecurring } from '@/lib/recurrence-server'
import { creationDay } from '@/lib/recurrence'
import { dueRule } from '@/lib/due-dates-server'
import { dayDate, addDays } from '@/lib/due-dates'

const fail = (m: string) => { console.log(`FAIL ${m}`); process.exitCode = 1 }

async function main() {
  const admin = await prisma.member.findFirstOrThrow({ where: { access: 'admin' } })
  const brand = await prisma.brand.findFirstOrThrow()
  const name = `SC-005 weekly ${Date.now()}`
  // The series starts Sunday 3 Jan 2027; ends after 8 occurrences.
  const src = await prisma.task.create({ data: {
    name, brand_id: brand.id, content_type_label: 'Post', task_owner_id: admin.id, assignee_id: admin.id, initiator_role: admin.role,
    status: 'todo', stage_date: new Date(), publish_date: dayDate('2027-01-03'), due_date: dayDate('2026-12-27'), created_by: admin.id,
  } })
  const sla = (await prisma.slaConfig.findMany({ where: { content_type_label: 'Post' } })).reduce((n, r) => n + r.max_business_days, 0)
  const rule = await prisma.repeatRule.create({ data: {
    source_task_id: src.id, brand_id: brand.id, freq: 'weeks', interval: 1, weekdays: [0], max_count: 8, lead_working_days: sla,
    anchor: dayDate('2027-01-03'), next_publish: dayDate('2027-01-10'), created_by: admin.id,
  } })
  await prisma.task.update({ where: { id: src.id }, data: { repeat_rule_id: rule.id } })
  const r = await dueRule()
  try {
    // Every day for 14 weeks from 1 Dec at 10:00 Cairo, skipping (missing) every Tuesday, and running twice on Thursdays.
    const made: { day: string; publish: string }[] = []
    for (let i = 0; i < 100; i++) {
      const day = addDays('2026-12-01', i)
      const wd = new Date(`${day}T00:00:00Z`).getUTCDay()
      if (wd === 2) continue
      const before = await prisma.task.findMany({ where: { recurrence_key: { startsWith: `${rule.id}:` } }, select: { recurrence_key: true } })
      await runRecurring(new Date(`${day}T08:00:00Z`))
      if (wd === 4) await runRecurring(new Date(`${day}T09:00:00Z`))
      const after = await prisma.task.findMany({ where: { recurrence_key: { startsWith: `${rule.id}:` } }, select: { recurrence_key: true } })
      for (const t of after.filter(a => !before.some(b => b.recurrence_key === a.recurrence_key))) made.push({ day, publish: t.recurrence_key!.split(':')[1] })
    }
    const keys = new Set(made.map(m => m.publish))
    if (made.length !== 8) fail(`expected 8 occurrences, got ${made.length}`)
    else console.log('PASS exactly 8 occurrences')
    if (keys.size !== made.length) fail('a publishing date was made twice'); else console.log('PASS no duplicates (missed Tuesdays, two runs on Thursdays)')
    let onTime = true
    for (const m of made) {
      const due = creationDay(m.publish, sla, r)
      // Made on its creation day, or the next run after it (the day after a missed Tuesday).
      if (m.day < due || m.day > addDays(due, 1)) { onTime = false; fail(`${m.publish}: made ${m.day}, creation day ${due}`) }
    }
    if (onTime) console.log(`PASS each made on its creation day (lead ${sla} working days)`)
    console.log(made.map(m => `${m.publish} ← ${m.day}`).join('\n'))
  } finally {
    await prisma.task.deleteMany({ where: { OR: [{ id: src.id }, { recurrence_key: { startsWith: `${rule.id}:` } }] } })
    await prisma.repeatRule.delete({ where: { id: rule.id } })
    await prisma.$disconnect()
  }
}
main()
