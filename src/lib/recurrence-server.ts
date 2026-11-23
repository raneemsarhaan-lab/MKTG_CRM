/**
 * Recurring tasks on the server (spec 023 US8, R12, D17–D18). A rule copies
 * its latest occurrence (or fills a template) for each publishing date, on
 * that occurrence's creation day: its due date minus the lead time in working
 * days. `recurrence_key` makes each occurrence exactly once, so a missed run,
 * a second server or a retry never makes it twice.
 */
import { prisma } from '@/lib/prisma'
import { addDays, cairoToday, dayDate, dayOf } from '@/lib/due-dates'
import { dueRule, newTaskDates } from '@/lib/due-dates-server'
import { creationDay, minLead, nextOccurrence, recurrenceKey, type Freq, type Repeat } from '@/lib/recurrence'
import { fillPattern } from '@/lib/templates'
import { applyTemplateExtras, loadTemplate } from '@/lib/templates-server'
import { addSpaces } from '@/lib/spaces-server'
import { follow, notify, notifyAfter } from '@/lib/notify/notify'
import type { RepeatRule } from '@prisma/client'

/** The type's total SLA working days — the shortest lead time allowed (and the default). */
export async function slaWorkingDays(typeLabel: string | null | undefined): Promise<number> {
  if (!typeLabel) return 0
  const rows = await prisma.slaConfig.findMany({ where: { content_type_label: typeLabel }, select: { max_business_days: true } })
  return minLead(rows.reduce((n, r) => n + (r.max_business_days || 0), 0))
}

export const asRepeat = (r: RepeatRule): Repeat => ({
  freq: r.freq as Freq, interval: r.interval, weekdays: r.weekdays, month_day: r.month_day,
  ends_on: dayOf(r.ends_on), max_count: r.max_count, made_count: r.made_count,
})

/** The publishing date after `after`, honouring the end date and count. */
export const followingPublish = (r: RepeatRule, after: string, made = r.made_count) =>
  nextOccurrence({ ...asRepeat(r), made_count: made }, after, dayOf(r.anchor)!)

const isUnique = (e: unknown) => typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'

/** One occurrence for `publish`. Null when it already exists or there is nothing to copy. */
async function createOccurrence(rule: RepeatRule, publish: string): Promise<string | null> {
  const key = recurrenceKey(rule.id, publish)
  if (await prisma.task.findUnique({ where: { recurrence_key: key }, select: { id: true } })) return null
  const actor = rule.created_by

  const src = rule.source_task_id ? await prisma.task.findUnique({
    where: { id: rule.source_task_id },
    include: { assignees: true, tags: true, spaces: true },
  }) : null
  const tpl = !src ? await loadTemplate(rule.template_id) : null
  if (!src && !tpl) return null

  let data: Record<string, unknown>
  if (src) {
    // The start date keeps its distance from the publishing date.
    const srcPublish = dayOf(src.publish_date), srcStart = dayOf(src.start_date)
    const start = srcPublish && srcStart ? addDays(publish, Math.round((Date.parse(srcStart) - Date.parse(srcPublish)) / 86400000)) : null
    data = {
      kind: 'pipeline', name: src.name, description: src.description, brand_id: rule.brand_id ?? src.brand_id,
      content_type_label: src.content_type_label, platform: src.platform, project_id: rule.project_id ?? src.project_id,
      task_owner_id: src.task_owner_id, assignee_id: src.assignee_id, initiator_role: src.initiator_role, nine_stage: src.nine_stage,
      hours_estimate: src.hours_estimate, priority: src.priority, created_by: actor ?? src.created_by,
      ...(await newTaskDates(publish, null, start)),
    }
    if (src.media_board) Object.assign(data, { media_board: src.media_board, status: src.entry_stage ?? 'r-design', entry_stage: src.entry_stage ?? 'r-design' })
  } else {
    const t = tpl!
    const brand = rule.brand_id ? await prisma.brand.findUnique({ where: { id: rule.brand_id }, select: { name: true } }) : null
    const owner = actor ?? (await prisma.member.findFirst({ where: { access: 'admin' }, select: { id: true } }))?.id
    if (!owner) return null
    const ownerRow = await prisma.member.findUnique({ where: { id: owner }, select: { role: true } })
    const assignee = t.values.assigneeRole ? (await prisma.member.findFirst({ where: { role: t.values.assigneeRole }, orderBy: { name: 'asc' }, select: { id: true } }))?.id ?? owner : owner
    data = {
      kind: 'pipeline', name: fillPattern(t.name_pattern, { brand: brand?.name, type: t.type_label, date: publish }) || t.name,
      description: t.brief, brand_id: rule.brand_id, content_type_label: t.type_label, project_id: rule.project_id ?? t.values.projectId ?? null,
      task_owner_id: owner, assignee_id: assignee, initiator_role: ownerRow?.role ?? 'Marketing Manager', nine_stage: false,
      hours_estimate: Number(t.values.hours) || 0, priority: t.values.priority ?? 'Normal', created_by: owner,
      ...(await newTaskDates(publish, null, null)),
    }
  }

  let id: string
  try {
    const task = await prisma.task.create({
      data: { status: 'todo', stage_date: new Date(), ...data, recurrence_key: key, repeat_rule_id: rule.id } as never,
    })
    id = task.id
  } catch (e) {
    if (isUnique(e)) return null
    throw e
  }

  if (src) {
    if (src.assignees.length) await prisma.taskAssignee.createMany({ data: src.assignees.map(a => ({ task_id: id, member_id: a.member_id, position: a.position, hours: a.hours })), skipDuplicates: true })
    if (src.tags.length) await prisma.taskTag.createMany({ data: src.tags.map(t => ({ task_id: id, tag_id: t.tag_id })), skipDuplicates: true })
    const values = await prisma.taskFieldValue.findMany({ where: { task_id: src.id } })
    if (values.length) await prisma.taskFieldValue.createMany({ data: values.map(v => ({ task_id: id, field_id: v.field_id, value: v.value as never, updated_by: v.updated_by })), skipDuplicates: true })
    const spaces = rule.space_id ? [rule.space_id] : src.spaces.map(s => s.space_id)
    await addSpaces(prisma, id, spaces, 'created', actor)
  } else {
    if (rule.space_id) await addSpaces(prisma, id, [rule.space_id], 'created', actor)
    const brand = rule.brand_id ? await prisma.brand.findUnique({ where: { id: rule.brand_id }, select: { name: true } }) : null
    await applyTemplateExtras(id, tpl!, actor ?? (data.task_owner_id as string), x => fillPattern(x, { brand: brand?.name, type: tpl!.type_label, date: publish }))
  }

  const made = await prisma.task.findUnique({ where: { id }, select: { assignee_id: true, task_owner_id: true } })
  if (made && actor) {
    await notifyAfter(async tx => {
      for (const m of new Set([made.task_owner_id, made.assignee_id].filter((x): x is string => !!x))) await follow(tx, id, m)
      return made.assignee_id && made.assignee_id !== actor
        ? notify(tx, { kind: 'assigned', actorId: actor, taskId: id, assigneeId: made.assignee_id })
        : []
    })
  }
  return id
}

/**
 * The hourly job: every occurrence whose creation day has come. A missed run
 * catches up (at most a dozen per rule), each occurrence once.
 */
export async function runRecurring(now = new Date()): Promise<number> {
  const today = cairoToday(now)
  const rule0 = await dueRule()
  const rules = await prisma.repeatRule.findMany({ where: { stopped_at: null, next_publish: { not: null } } })
  let created = 0
  for (const r of rules) {
    let rule = r
    for (let i = 0; i < 12 && rule.next_publish; i++) {
      const publish = dayOf(rule.next_publish)!
      if (creationDay(publish, rule.lead_working_days, rule0) > today) break
      const id = await createOccurrence(rule, publish)
      if (id) created++
      const made = rule.made_count + 1
      const next = followingPublish(rule, publish, made)
      rule = await prisma.repeatRule.update({
        where: { id: rule.id },
        data: {
          made_count: made, next_publish: next ? dayDate(next) : null,
          ...(id && rule.source_task_id ? { source_task_id: id } : {}),
          ...(next ? {} : { stopped_at: now }),
        },
      })
    }
  }
  return created
}
