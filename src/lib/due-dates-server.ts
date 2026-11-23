/**
 * Publishing and due dates on the server: the workspace's rule, and what a
 * change writes (see src/lib/due-dates.ts for the rule itself).
 */
import { prisma } from '@/lib/prisma'
import { calcDueDate, dayDate, dayOf, isDay, nextDueDate, ruleFromSettings, type DueRule } from '@/lib/due-dates'

/** The workspace's due-date rule (Settings › Due Dates). */
export async function dueRule(): Promise<DueRule> {
  return ruleFromSettings(await prisma.workspaceSettings.findUnique({ where: { id: 1 } }))
}

/**
 * The date columns a patch writes. A due date given is set by hand
 * (due_manual); a publishing date moves the due date unless it was set by
 * hand; due_reset recalculates. A string back is why it was refused.
 */
export async function datesFor(
  task: { publish_date: Date | null; due_date: Date | null; due_manual: boolean },
  patch: { due_date?: string | null; publish_date?: string | null; due_reset?: boolean },
): Promise<Record<string, unknown> | string> {
  const out: Record<string, unknown> = {}
  let publish = dayOf(task.publish_date), due = dayOf(task.due_date), manual = task.due_manual
  if (patch.publish_date !== undefined) {
    const v = patch.publish_date ? String(patch.publish_date).slice(0, 10) : null
    if (v && !isDay(v)) return 'Invalid publishing date'
    publish = v
    out.publish_date = v ? dayDate(v) : null
  }
  if (patch.due_date !== undefined) {
    const v = patch.due_date ? String(patch.due_date).slice(0, 10) : null
    if (v && !isDay(v)) return 'Invalid due date'
    due = v; manual = true
    out.due_date = v ? dayDate(v) : null
    out.due_manual = true
  }
  if (patch.due_reset) { manual = false; out.due_manual = false }
  if (!manual && (patch.publish_date !== undefined || patch.due_reset)) {
    const next = nextDueDate({ publish, due, manual }, await dueRule())
    out.due_date = next ? dayDate(next) : null
  }
  return out
}

/** A new task's dates: a due date given is set by hand; else it comes from the publishing date. */
export async function newTaskDates(publish?: string | null, due?: string | null) {
  const p = publish && isDay(publish.slice(0, 10)) ? publish.slice(0, 10) : null
  const d = due && isDay(String(due).slice(0, 10)) ? String(due).slice(0, 10) : null
  if (d) return { publish_date: p ? dayDate(p) : null, due_date: dayDate(d), due_manual: true }
  return { publish_date: p ? dayDate(p) : null, due_date: p ? dayDate(calcDueDate(p, await dueRule())) : null, due_manual: false }
}


/**
 * The open tasks whose due date a rule would change: worked out (not set by
 * hand), with a publishing date, not dropped, not published or done.
 */
export async function tasksToRecalc(rule: DueRule): Promise<{ id: string; due: string }[]> {
  const rows = await prisma.task.findMany({
    where: {
      due_manual: false, publish_date: { not: null }, dropped_at: null,
      NOT: [{ kind: 'pipeline', status: 'publish' }, { kind: 'simple', simple_status: 's-done' }],
    },
    select: { id: true, publish_date: true, due_date: true },
  })
  const out: { id: string; due: string }[] = []
  for (const r of rows) {
    const due = calcDueDate(dayOf(r.publish_date)!, rule)
    if (due !== dayOf(r.due_date)) out.push({ id: r.id, due })
  }
  return out
}
