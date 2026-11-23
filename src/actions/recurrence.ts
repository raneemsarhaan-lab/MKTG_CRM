'use server'

/**
 * Recurring tasks (spec 023 US8, D17–D18). Whoever may edit a task may make it
 * repeat. The series is anchored on the task's publishing date; each next
 * occurrence is made on its creation day (its due date minus the lead time in
 * working days). A lead time shorter than the type's total SLA working days is
 * refused, naming the minimum.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { canActOn } from '@/lib/task-access'
import { withAssignees } from '@/lib/assignees-server'
import { dayDate, dayOf, isDay } from '@/lib/due-dates'
import { dueRule } from '@/lib/due-dates-server'
import { creationDay, nextOccurrence, type Freq } from '@/lib/recurrence'
import { followingPublish, slaWorkingDays } from '@/lib/recurrence-server'

type Fail = { success: false; error: string; min?: number }
const UUID = /^[0-9a-f-]{36}$/i

export interface RepeatInput {
  freq: Freq
  interval: number
  weekdays?: number[]
  month_day?: number | null
  ends_on?: string | null
  max_count?: number | null
  /** Working days before the due date; empty = the minimum. */
  lead?: number | null
  space_id?: string | null
}

export interface RepeatView {
  id: string | null
  freq: Freq
  interval: number
  weekdays: number[]
  month_day: number | null
  ends_on: string | null
  max_count: number | null
  lead: number
  minLead: number
  next_publish: string | null
  next_creation: string | null
  made_count: number
  publish_date: string | null
}

async function taskFor(taskId: string) {
  const me = await getSessionMember()
  if (!me) return { error: 'not_authenticated' as const }
  if (!UUID.test(taskId)) return { error: 'not_found' as const }
  const found = await prisma.task.findUnique({ where: { id: taskId } })
  if (!found) return { error: 'not_found' as const }
  const task = await withAssignees(found)
  if (!canActOn(task, me)) return { error: 'not_authorized' as const }
  return { me, task }
}

async function view(ruleId: string | null, task: { publish_date: Date | null; content_type_label: string | null }): Promise<RepeatView> {
  const min = await slaWorkingDays(task.content_type_label)
  const r = ruleId ? await prisma.repeatRule.findUnique({ where: { id: ruleId } }) : null
  const live = r && !r.stopped_at ? r : null
  const next = dayOf(live?.next_publish ?? null)
  return {
    id: live?.id ?? null,
    freq: (live?.freq as Freq) ?? 'weeks',
    interval: live?.interval ?? 1,
    weekdays: live?.weekdays ?? [],
    month_day: live?.month_day ?? null,
    ends_on: dayOf(live?.ends_on ?? null),
    max_count: live?.max_count ?? null,
    lead: live?.lead_working_days ?? min,
    minLead: min,
    next_publish: next,
    next_creation: next && live ? creationDay(next, live.lead_working_days, await dueRule()) : null,
    made_count: live?.made_count ?? 0,
    publish_date: dayOf(task.publish_date),
  }
}

/** The task's repeat rule as the editor shows it (a default when it doesn't repeat). */
export async function loadRepeat(taskId: string): Promise<{ success: true; repeat: RepeatView } | Fail> {
  const a = await taskFor(taskId)
  if (a.error) return { success: false, error: a.error }
  return { success: true, repeat: await view(a.task.repeat_rule_id, a.task) }
}

export async function setRepeat(taskId: string, input: RepeatInput): Promise<{ success: true; repeat: RepeatView } | Fail> {
  const a = await taskFor(taskId)
  if (a.error) return { success: false, error: a.error }
  const { me, task } = a
  const publish = dayOf(task.publish_date)
  if (!publish) return { success: false, error: 'needs_publish' }
  if (!['days', 'weeks', 'monthly'].includes(input.freq)) return { success: false, error: 'invalid' }
  const interval = Math.trunc(Number(input.interval))
  if (!(interval >= 1 && interval <= 99)) return { success: false, error: 'invalid' }
  const weekdays = input.freq === 'weeks' ? [...new Set((input.weekdays ?? []).map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : []
  const monthDay = input.freq === 'monthly' ? (input.month_day == null ? Number(publish.slice(8, 10)) : Math.trunc(Number(input.month_day))) : null
  if (monthDay != null && !(monthDay >= 1 && monthDay <= 31)) return { success: false, error: 'invalid' }
  const endsOn = input.ends_on ? String(input.ends_on).slice(0, 10) : null
  if (endsOn && !isDay(endsOn)) return { success: false, error: 'invalid' }
  const maxCount = input.max_count == null ? null : Math.trunc(Number(input.max_count))
  if (maxCount != null && !(maxCount >= 1 && maxCount <= 999)) return { success: false, error: 'invalid' }
  const min = await slaWorkingDays(task.content_type_label)
  const lead = input.lead == null || input.lead === ('' as never) ? min : Math.trunc(Number(input.lead))
  if (!Number.isFinite(lead) || lead > 365) return { success: false, error: 'invalid' }
  // D17: never shorter than the type's total SLA working days.
  if (lead < min) return { success: false, error: 'lead_too_short', min }

  const existing = task.repeat_rule_id ? await prisma.repeatRule.findUnique({ where: { id: task.repeat_rule_id } }) : null
  const live = existing && !existing.stopped_at ? existing : null
  const anchor = live ? dayOf(live.anchor)! : publish
  const made = live?.made_count ?? 0
  const after = live?.next_publish ? (() => { const d = dayOf(live.next_publish)!; return d > publish ? publish : d })() : publish
  const next = nextOccurrence({ freq: input.freq, interval, weekdays, month_day: monthDay, ends_on: endsOn, max_count: maxCount, made_count: made }, after, anchor)
  const spaceId = input.space_id && UUID.test(input.space_id) ? input.space_id : live?.space_id ?? null
  const data = {
    freq: input.freq, interval, weekdays, month_day: monthDay, ends_on: endsOn ? dayDate(endsOn) : null, max_count: maxCount,
    lead_working_days: lead, next_publish: next ? dayDate(next) : null, space_id: spaceId,
  }
  const rule = live
    ? await prisma.repeatRule.update({ where: { id: live.id }, data })
    : await prisma.repeatRule.create({
        data: { ...data, source_task_id: task.id, brand_id: task.brand_id, project_id: task.project_id, anchor: dayDate(publish), created_by: me.id },
      })
  await prisma.task.update({ where: { id: task.id }, data: { repeat_rule_id: rule.id } })
  revalidatePath('/', 'layout')
  return { success: true, repeat: await view(rule.id, task) }
}

/** Skip the next occurrence: the series moves on to the one after. */
export async function skipNext(taskId: string): Promise<{ success: true; repeat: RepeatView } | Fail> {
  const a = await taskFor(taskId)
  if (a.error) return { success: false, error: a.error }
  const rule = a.task.repeat_rule_id ? await prisma.repeatRule.findUnique({ where: { id: a.task.repeat_rule_id } }) : null
  if (!rule || rule.stopped_at || !rule.next_publish) return { success: false, error: 'not_repeating' }
  const next = followingPublish(rule, dayOf(rule.next_publish)!)
  await prisma.repeatRule.update({ where: { id: rule.id }, data: { next_publish: next ? dayDate(next) : null, ...(next ? {} : { stopped_at: new Date() }) } })
  revalidatePath('/', 'layout')
  return { success: true, repeat: await view(rule.id, a.task) }
}

/** Stop repeating: no more occurrences; the ones made stay. */
export async function stopRepeat(taskId: string): Promise<{ success: true } | Fail> {
  const a = await taskFor(taskId)
  if (a.error) return { success: false, error: a.error }
  const id = a.task.repeat_rule_id
  if (!id) return { success: true }
  await prisma.repeatRule.updateMany({ where: { id, stopped_at: null }, data: { stopped_at: new Date() } })
  await prisma.task.updateMany({ where: { repeat_rule_id: id }, data: { repeat_rule_id: null } })
  revalidatePath('/', 'layout')
  return { success: true }
}
