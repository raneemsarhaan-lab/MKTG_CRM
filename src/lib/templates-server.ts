/**
 * Task templates on the server (spec 023 US7): what a template adds to a task
 * once it exists — field values, tags and subtasks with dates relative to the
 * publishing date and people by role. Nothing links the task back to the
 * template, so editing the template later changes new tasks only.
 */
import { prisma } from '@/lib/prisma'
import { dayDate, dayOf } from '@/lib/due-dates'
import { planSubtasks, type TemplateSubtask } from '@/lib/templates'
import { mapTemplate } from '@/lib/mappers'
import type { TaskTemplate } from '@/types/index'

const UUID = /^[0-9a-f-]{36}$/i

export async function loadTemplate(id: string | null | undefined): Promise<TaskTemplate | null> {
  if (!id || !UUID.test(id)) return null
  const row = await prisma.taskTemplate.findUnique({ where: { id } })
  return row ? mapTemplate(row) : null
}

/** Field values (only fields that still exist), tags (only tags that exist) and subtasks. */
export async function applyTemplateExtras(taskId: string, tpl: TaskTemplate, creatorId: string, fill: (s: string) => string): Promise<string[]> {
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return []
  const v = tpl.values ?? {}

  const fieldIds = Object.keys(v.fields ?? {}).filter(id => UUID.test(id))
  if (fieldIds.length) {
    const live = new Set((await prisma.taskField.findMany({ where: { id: { in: fieldIds } }, select: { id: true } })).map(f => f.id))
    const rows = fieldIds.filter(id => live.has(id)).map(id => ({ task_id: taskId, field_id: id, value: v.fields![id] as never, updated_by: creatorId }))
    if (rows.length) await prisma.taskFieldValue.createMany({ data: rows, skipDuplicates: true })
  }

  const tagIds = (v.tagIds ?? []).filter(id => UUID.test(id))
  if (tagIds.length) {
    const live = (await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true } })).map(t => t.id)
    if (live.length) await prisma.taskTag.createMany({ data: live.map(tag_id => ({ task_id: taskId, tag_id })), skipDuplicates: true })
  }

  const subs = Array.isArray(tpl.subtasks) ? (tpl.subtasks as TemplateSubtask[]) : []
  if (!subs.length) return []
  const members = await prisma.member.findMany({ select: { id: true, role: true }, orderBy: { name: 'asc' } })
  const planned = planSubtasks(subs, dayOf(task.publish_date), members, creatorId, fill)
  const ids: string[] = []
  for (const s of planned) {
    const due = s.due_date ?? dayOf(task.due_date)
    const start = s.start_date && (!due || s.start_date <= due) ? s.start_date : null
    const sub = await prisma.task.create({
      data: {
        name: s.name.slice(0, 300),
        // Owner, 25 Nov 2026: no subtasks — a template's extra items are tasks of their own.
        brand_id: task.brand_id,
        content_type_label: task.content_type_label,
        platform: task.platform,
        project_id: task.project_id,
        task_owner_id: task.task_owner_id,
        assignee_id: s.assignee_id,
        initiator_role: task.initiator_role,
        nine_stage: task.nine_stage,
        status: 'todo',
        stage_date: new Date(),
        publish_date: task.publish_date,
        due_date: due ? dayDate(due) : null,
        due_manual: !!s.due_date || task.due_manual,
        start_date: start ? dayDate(start) : null,
        hours_estimate: 0,
        priority: task.priority,
        created_by: creatorId,
      },
    })
    ids.push(sub.id)
  }
  // On the same boards as the task the template made.
  const shows = await prisma.taskSpace.findMany({ where: { task_id: task.id }, select: { space_id: true } })
  if (shows.length && ids.length) await prisma.taskSpace.createMany({ data: ids.flatMap(id => shows.map(x => ({ task_id: id, space_id: x.space_id, added_via: 'created' }))), skipDuplicates: true })
  return ids
}

/** A template made from a task: its fields, priority, tags, assignee's role and subtasks (dates relative to its publishing date). */
export async function templateValuesFromTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { role: true } },
      tags: { select: { tag_id: true } },
      subtasks: { where: { dropped_at: null }, include: { assignee: { select: { role: true } } }, orderBy: { created_at: 'asc' } },
    },
  })
  if (!task) return null
  const fieldRows = await prisma.taskFieldValue.findMany({ where: { task_id: taskId } })
  const publish = dayOf(task.publish_date)
  const off = (d: Date | null) => {
    const day = dayOf(d)
    return publish && day ? Math.round((Date.parse(day) - Date.parse(publish)) / 86400000) : null
  }
  return {
    type_label: task.content_type_label,
    name_pattern: task.name,
    brief: task.description,
    values: {
      fields: Object.fromEntries(fieldRows.map(r => [r.field_id, r.value])),
      priority: task.priority,
      tagIds: task.tags.map(t => t.tag_id),
      assigneeRole: task.assignee?.role ?? null,
      projectId: task.project_id,
      hours: Number(task.hours_estimate) || null,
    },
    subtasks: task.subtasks.map(s => ({ name: s.name, dueOffset: off(s.due_date), startOffset: off(s.start_date), assigneeRole: s.assignee?.role ?? null })),
  }
}
