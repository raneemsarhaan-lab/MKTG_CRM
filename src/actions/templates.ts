'use server'

/**
 * Task templates (spec 023 US7, D15–D16). Admins and superusers manage them;
 * everyone creates tasks from them. A task made from a template keeps no link
 * to it: editing the template changes new tasks only.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { asPriority } from '@/lib/priorities'
import { fillPattern } from '@/lib/templates'
import { loadTemplate, templateValuesFromTask } from '@/lib/templates-server'
import { createTask } from '@/actions/tasks'
import type { TaskTemplate, TaskTemplateSubtask } from '@/types/index'

type Fail = { success: false; error: string }
const UUID = /^[0-9a-f-]{36}$/i
const DAY = /^\d{4}-\d{2}-\d{2}$/

async function manager() {
  const me = await getSessionMember()
  if (!me) return { error: 'not_authenticated' as const }
  if (me.access === 'user') return { error: 'not_authorized' as const }
  return { me }
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')
const offset = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 365 ? Math.trunc(v) : null)

function cleanSubtasks(list: unknown): TaskTemplateSubtask[] {
  if (!Array.isArray(list)) return []
  return list.slice(0, 30).map(x => x as Record<string, unknown>).filter(x => x && text(x.name, 200)).map(x => ({
    name: text(x.name, 200),
    startOffset: offset(x.startOffset),
    dueOffset: offset(x.dueOffset),
    assigneeRole: text(x.assigneeRole, 80) || null,
  }))
}

function cleanValues(v: unknown): TaskTemplate['values'] {
  const o = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>
  const fields = o.fields && typeof o.fields === 'object' && !Array.isArray(o.fields)
    ? Object.fromEntries(Object.entries(o.fields as Record<string, unknown>).filter(([k]) => UUID.test(k)).slice(0, 60)) : {}
  return {
    fields,
    priority: asPriority(o.priority) ?? null,
    tagIds: Array.isArray(o.tagIds) ? [...new Set(o.tagIds.filter((x): x is string => typeof x === 'string' && UUID.test(x)))].slice(0, 20) : [],
    assigneeRole: text(o.assigneeRole, 80) || null,
    projectId: typeof o.projectId === 'string' && UUID.test(o.projectId) ? o.projectId : null,
    hours: typeof o.hours === 'number' && o.hours >= 0 && o.hours <= 999 ? o.hours : null,
  }
}

/** Create or edit a template. */
export async function saveTemplate(input: {
  id?: string | null; type_label: string; name: string; name_pattern: string; brief?: string | null
  values?: TaskTemplate['values']; subtasks?: TaskTemplateSubtask[]
}): Promise<{ success: true; id: string } | Fail> {
  const auth = await manager()
  if (auth.error) return { success: false, error: auth.error }
  const name = text(input.name, 80)
  const pattern = text(input.name_pattern, 200) || name
  if (!name) return { success: false, error: 'name_required' }
  if (!await prisma.contentType.findUnique({ where: { label: input.type_label } })) return { success: false, error: 'invalid_type' }
  const data = {
    type_label: input.type_label, name, name_pattern: pattern,
    brief: typeof input.brief === 'string' ? input.brief.trim().slice(0, 20000) || null : null,
    values: cleanValues(input.values) as never,
    subtasks: cleanSubtasks(input.subtasks) as never,
  }
  if (input.id) {
    if (!UUID.test(input.id) || !await prisma.taskTemplate.findUnique({ where: { id: input.id } })) return { success: false, error: 'not_found' }
    await prisma.taskTemplate.update({ where: { id: input.id }, data })
    revalidatePath('/', 'layout')
    return { success: true, id: input.id }
  }
  const row = await prisma.taskTemplate.create({ data: { ...data, created_by: auth.me.id } })
  revalidatePath('/', 'layout')
  return { success: true, id: row.id }
}

export async function deleteTemplate(id: string): Promise<{ success: true } | Fail> {
  const auth = await manager()
  if (auth.error) return { success: false, error: auth.error }
  if (!UUID.test(id)) return { success: false, error: 'not_found' }
  await prisma.contentType.updateMany({ where: { default_template_id: id }, data: { default_template_id: null } })
  await prisma.taskTemplate.deleteMany({ where: { id } })
  revalidatePath('/', 'layout')
  return { success: true }
}

/** The template a type's new tasks start from (T019); null for none. */
export async function setDefaultTemplate(typeLabel: string, templateId: string | null): Promise<{ success: true } | Fail> {
  const auth = await manager()
  if (auth.error) return { success: false, error: auth.error }
  if (templateId) {
    const tpl = await loadTemplate(templateId)
    if (!tpl || tpl.type_label !== typeLabel) return { success: false, error: 'invalid' }
  }
  const r = await prisma.contentType.updateMany({ where: { label: typeLabel }, data: { default_template_id: templateId } })
  if (!r.count) return { success: false, error: 'not_found' }
  revalidatePath('/', 'layout')
  return { success: true }
}

/** "Save as template" from a task: its fields, priority, tags, the assignee's role and its subtasks. */
export async function templateFromTask(taskId: string, name: string): Promise<{ success: true; id: string } | Fail> {
  const auth = await manager()
  if (auth.error) return { success: false, error: auth.error }
  if (!UUID.test(taskId)) return { success: false, error: 'not_found' }
  const v = await templateValuesFromTask(taskId)
  if (!v) return { success: false, error: 'not_found' }
  if (!v.type_label) return { success: false, error: 'invalid_type' }
  return saveTemplate({ type_label: v.type_label, name: text(name, 80) || v.name_pattern.slice(0, 80), name_pattern: v.name_pattern, brief: v.brief, values: v.values as TaskTemplate['values'], subtasks: v.subtasks })
}

/**
 * A new task from a template, for a brand and a publishing date. The name
 * pattern is filled in; the assignee is the first member with the template's
 * role (a user's own task stays theirs).
 */
export async function createFromTemplate(templateId: string, opts: { brand_id: string; publish_date?: string | null; space_id?: string | null; project_id?: string | null }): Promise<{ success: boolean; id?: string; error?: string }> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const tpl = await loadTemplate(templateId)
  if (!tpl) return { success: false, error: 'not_found' }
  const brand = UUID.test(opts.brand_id ?? '') ? await prisma.brand.findUnique({ where: { id: opts.brand_id }, select: { id: true, name: true } }) : null
  if (!brand) return { success: false, error: 'invalid_brand' }
  const publish = opts.publish_date && DAY.test(opts.publish_date) ? opts.publish_date : null
  let assignee: string | null = me.id
  if (me.access !== 'user' && tpl.values.assigneeRole) {
    assignee = (await prisma.member.findFirst({ where: { role: tpl.values.assigneeRole }, orderBy: { name: 'asc' }, select: { id: true } }))?.id ?? me.id
  }
  const name = fillPattern(tpl.name_pattern, { brand: brand.name, type: tpl.type_label, date: publish }) || tpl.name
  return createTask({
    name, brand_id: brand.id, content_type_label: tpl.type_label, task_owner_id: me.id, assignee_id: assignee,
    publish_date: publish, project_id: opts.project_id ?? tpl.values.projectId ?? null, space_id: opts.space_id ?? null,
    template_id: tpl.id,
  })
}

/** Every template, for "+ Task" and the calendar (everyone may use them). */
export async function listTemplates(): Promise<TaskTemplate[]> {
  const me = await getSessionMember()
  if (!me) return []
  const { mapTemplate } = await import('@/lib/mappers')
  return (await prisma.taskTemplate.findMany({ orderBy: [{ type_label: 'asc' }, { name: 'asc' }] })).map(mapTemplate)
}
