/**
 * One-time: publishing dates and due dates (runs once, then records that it did).
 *
 *   1. Content sheet pieces (tasks under a theme, not clips of a video): their
 *      planned date has lived in due_date. It becomes the publishing date. An
 *      open piece gets a due date from the rule; a published piece keeps its
 *      due date, marked as set by hand, and its publishing date is the day it
 *      went live (falling back to the old date).
 *   2. Every other task with a due date keeps it, marked as set by hand.
 *   3. Any task with a publishing date and no due date gets one from the rule.
 *
 * Safe to run twice: a second run finds due_dates_migrated_at set and stops.
 */
import { PrismaClient } from '@prisma/client'
import { calcDueDate, dayDate, dayOf, ruleFromSettings } from '../src/lib/due-dates'

const prisma = new PrismaClient()

async function main() {
  const ws = await prisma.workspaceSettings.findUnique({ where: { id: 1 } })
  if (ws?.due_dates_migrated_at) { console.log('Due dates: already migrated.'); return }
  const rule = ruleFromSettings(ws)

  const themes = new Set((await prisma.project.findMany({ where: { is_theme: true }, select: { id: true } })).map(p => p.id))
  const tasks = await prisma.task.findMany({
    select: { id: true, project_id: true, parent_task_id: true, kind: true, status: true, content_type_label: true, due_date: true, publish_date: true, stage_date: true },
  })
  const videos = new Set(tasks.filter(t => t.content_type_label === 'Video' && !t.parent_task_id).map(t => t.id))
  const isPiece = (t: typeof tasks[number]) =>
    !!t.project_id && themes.has(t.project_id) && t.kind !== 'simple' && !(t.parent_task_id && videos.has(t.parent_task_id))

  let pieces = 0, manual = 0, calculated = 0
  for (const t of tasks) {
    const due = dayOf(t.due_date), publish = dayOf(t.publish_date)
    if (isPiece(t) && due && !publish) {
      if (t.status === 'publish') {
        await prisma.task.update({ where: { id: t.id }, data: { publish_date: t.stage_date ?? dayDate(due), due_manual: true } })
      } else {
        await prisma.task.update({ where: { id: t.id }, data: { publish_date: dayDate(due), due_date: dayDate(calcDueDate(due, rule)), due_manual: false } })
      }
      pieces++
    } else if (due) {
      await prisma.task.update({ where: { id: t.id }, data: { due_manual: true } })
      manual++
    } else if (publish) {
      await prisma.task.update({ where: { id: t.id }, data: { due_date: dayDate(calcDueDate(publish, rule)), due_manual: false } })
      calculated++
    }
  }
  await prisma.workspaceSettings.upsert({
    where: { id: 1 },
    update: { due_dates_migrated_at: new Date() },
    create: { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false, due_dates_migrated_at: new Date() },
  })
  console.log(`Due dates: ${pieces} Content pieces moved to publishing dates, ${manual} due dates kept as set by hand, ${calculated} calculated.`)
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
