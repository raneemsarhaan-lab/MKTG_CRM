'use server'

/**
 * Custom fields by task type (spec 023 US2, contracts/server-actions.md).
 *   - The library and attachments: admins and superusers.
 *   - Values: anyone who may edit the task (owner, assignee, admin, superuser),
 *     only for fields attached to the task's type.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireTaskCreator } from '@/lib/authz'
import { canActOn } from '@/lib/task-access'
import { mapTaskField } from '@/lib/mappers'
import { ALL_STAGES } from '@/lib/stage-meta'
import { MAX_CHOICES, MAX_FIELD_NAME, applies, convertValue, isFieldKind, newChoiceId, parseValue } from '@/lib/task-fields'
import type { FieldKind, FieldOption, TaskFieldDef } from '@/types/index'

type Fail = { success: false; error: string }
const revalidate = () => revalidatePath('/', 'layout')
const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, MAX_FIELD_NAME) : '')
const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

function cleanOptions(kind: FieldKind, raw: unknown): TaskFieldDef['options'] {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: TaskFieldDef['options'] = {}
  if (kind === 'choice' || kind === 'multi') {
    const list: FieldOption[] = []
    for (const c of (Array.isArray(o.choices) ? o.choices : []).slice(0, MAX_CHOICES) as Record<string, unknown>[]) {
      const en = typeof c?.en === 'string' ? c.en.trim().slice(0, 40) : ''
      if (!en || list.some(x => norm(x.en) === norm(en))) continue
      const id = typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) && !list.some(x => x.id === c.id) ? c.id : newChoiceId(list)
      list.push({ id, en, ar: typeof c.ar === 'string' && c.ar.trim() ? c.ar.trim().slice(0, 40) : null, color: typeof c.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c.color) ? c.color : null })
    }
    out.choices = list
  }
  if (kind === 'money') out.currency = typeof o.currency === 'string' && /^[A-Z]{3}$/.test(o.currency) ? o.currency : 'EGP'
  if (kind === 'rating') out.max = typeof o.max === 'number' && o.max >= 3 && o.max <= 10 ? Math.trunc(o.max) : 5
  return out
}

async function nameTaken(en: string, exceptId?: string) {
  const live = await prisma.taskField.findMany({ where: { retired_at: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { name_en: true } })
  return live.some(f => norm(f.name_en) === norm(en))
}

export async function createField(input: { name_en: string; name_ar?: string | null; kind: string; options?: unknown; on_card?: boolean; switchable?: boolean }): Promise<{ success: true; field: TaskFieldDef } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const name = cleanName(input.name_en)
  if (!name || !isFieldKind(input.kind)) return { success: false, error: 'invalid' }
  if (await nameTaken(name)) return { success: false, error: 'exists' }
  const count = await prisma.taskField.count()
  const f = await prisma.taskField.create({ data: {
    name_en: name, name_ar: cleanName(input.name_ar) || null, kind: input.kind, options: cleanOptions(input.kind, input.options) as object,
    on_card: !!input.on_card, switchable: !!input.switchable, position: count, created_by: auth.member.id,
  } })
  revalidate()
  return { success: true, field: mapTaskField(f) }
}

/** Rename, re-option, or change kind: values that fit the new kind are converted, the rest kept as text. */
export async function updateField(id: string, patch: { name_en?: string; name_ar?: string | null; kind?: string; options?: unknown; on_card?: boolean; switchable?: boolean; position?: number }): Promise<{ success: true; field: TaskFieldDef; kept: number } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const before = await prisma.taskField.findUnique({ where: { id } })
  if (!before) return { success: false, error: 'not_found' }
  const kind = (patch.kind !== undefined ? patch.kind : before.kind) as FieldKind
  if (!isFieldKind(kind)) return { success: false, error: 'invalid' }
  const data: Record<string, unknown> = {}
  if (patch.name_en !== undefined) {
    const n = cleanName(patch.name_en)
    if (!n) return { success: false, error: 'invalid' }
    if (await nameTaken(n, id)) return { success: false, error: 'exists' }
    data.name_en = n
  }
  if (patch.name_ar !== undefined) data.name_ar = cleanName(patch.name_ar) || null
  if (patch.kind !== undefined) data.kind = kind
  if (patch.options !== undefined || patch.kind !== undefined) data.options = cleanOptions(kind, patch.options ?? before.options) as object
  if (patch.on_card !== undefined) data.on_card = !!patch.on_card
  if (patch.switchable !== undefined) data.switchable = !!patch.switchable
  if (patch.position !== undefined) data.position = Math.max(0, Math.trunc(patch.position))
  const after = await prisma.taskField.update({ where: { id }, data })
  let kept = 0
  if (before.kind !== after.kind) {
    const from = mapTaskField(before), to = mapTaskField(after)
    const rows = await prisma.taskFieldValue.findMany({ where: { field_id: id } })
    for (const r of rows) {
      const c = convertValue(from, to, r.value, { locale: 'en' })
      if (c.kept) kept++
      if (c.value === null) await prisma.taskFieldValue.delete({ where: { task_id_field_id: { task_id: r.task_id, field_id: id } } })
      else await prisma.taskFieldValue.update({ where: { task_id_field_id: { task_id: r.task_id, field_id: id } }, data: { value: c.value as object } })
    }
  }
  revalidate()
  return { success: true, field: mapTaskField(after), kept }
}

/** Retire (hidden everywhere, values kept) or bring back. */
export async function retireField(id: string, retired: boolean): Promise<{ success: true } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  if (!retired) {
    const f = await prisma.taskField.findUnique({ where: { id }, select: { name_en: true } })
    if (f && await nameTaken(f.name_en, id)) return { success: false, error: 'exists' }
  }
  const r = await prisma.taskField.updateMany({ where: { id }, data: { retired_at: retired ? new Date() : null } })
  if (!r.count) return { success: false, error: 'not_found' }
  revalidate()
  return { success: true }
}

/** Attach to a type (or change how it's attached): optional or required from a stage, with a default. */
export async function attachField(typeLabel: string, fieldId: string, opts: { required_from?: string | null; default_value?: unknown; position?: number } = {}): Promise<{ success: true } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const [type, field] = await Promise.all([
    prisma.contentType.findUnique({ where: { label: typeLabel }, select: { label: true } }),
    prisma.taskField.findUnique({ where: { id: fieldId } }),
  ])
  if (!type || !field) return { success: false, error: 'not_found' }
  const req = opts.required_from ?? null
  if (req !== null && !(ALL_STAGES as string[]).includes(req)) return { success: false, error: 'invalid' }
  let def: unknown = null
  if (opts.default_value !== undefined && opts.default_value !== null) {
    const p = parseValue(mapTaskField(field), opts.default_value)
    if (!p.ok) return { success: false, error: 'invalid' }
    def = p.value
  }
  const position = opts.position ?? await prisma.taskTypeField.count({ where: { type_label: typeLabel } })
  await prisma.taskTypeField.upsert({
    where: { type_label_field_id: { type_label: typeLabel, field_id: fieldId } },
    create: { type_label: typeLabel, field_id: fieldId, required_from: req, default_value: def as object ?? undefined, position },
    update: { required_from: req, ...(opts.default_value !== undefined ? { default_value: (def ?? null) as object } : {}), ...(opts.position !== undefined ? { position } : {}) },
  })
  revalidate()
  return { success: true }
}

/** Detach: the values stay on the tasks (hidden) and come back if it's attached again. */
export async function detachField(typeLabel: string, fieldId: string): Promise<{ success: true } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  await prisma.taskTypeField.deleteMany({ where: { type_label: typeLabel, field_id: fieldId } })
  revalidate()
  return { success: true }
}

export interface FieldWrite { taskId: string; fieldId: string; value: unknown }
export type FieldWriteResult = { taskId: string; fieldId: string; ok: true; value: unknown } | { taskId: string; fieldId: string; ok: false; error: 'not_found' | 'not_authorized' | 'not_applicable' | 'invalid' }

/** Values from the panel, a sheet cell, a paste, a fill, or an undo. Each write checked on its own. */
export async function setFieldValues(writes: FieldWrite[]): Promise<{ success: true; results: FieldWriteResult[] } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const list = (Array.isArray(writes) ? writes : []).slice(0, 5000)
  const taskIds = [...new Set(list.map(w => w.taskId))], fieldIds = [...new Set(list.map(w => w.fieldId))]
  const [tasks, fields, links] = await Promise.all([
    prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, task_owner_id: true, assignee_id: true, content_type_label: true, dropped_at: true } }),
    prisma.taskField.findMany({ where: { id: { in: fieldIds } } }),
    prisma.taskTypeField.findMany({ where: { field_id: { in: fieldIds } } }),
  ])
  const results: FieldWriteResult[] = []
  for (const w of list) {
    const task = tasks.find(t => t.id === w.taskId), raw = fields.find(f => f.id === w.fieldId)
    if (!task || !raw || raw.retired_at) { results.push({ taskId: w.taskId, fieldId: w.fieldId, ok: false, error: 'not_found' }); continue }
    if (!canActOn(task, me)) { results.push({ taskId: w.taskId, fieldId: w.fieldId, ok: false, error: 'not_authorized' }); continue }
    if (!applies(task.content_type_label, raw.id, links.map(l => ({ ...l, required_from: null, default_value: null })))) { results.push({ taskId: w.taskId, fieldId: w.fieldId, ok: false, error: 'not_applicable' }); continue }
    const p = parseValue(mapTaskField(raw), w.value)
    if (!p.ok) { results.push({ taskId: w.taskId, fieldId: w.fieldId, ok: false, error: 'invalid' }); continue }
    if (p.value === null) await prisma.taskFieldValue.deleteMany({ where: { task_id: task.id, field_id: raw.id } })
    else await prisma.taskFieldValue.upsert({
      where: { task_id_field_id: { task_id: task.id, field_id: raw.id } },
      create: { task_id: task.id, field_id: raw.id, value: p.value as object, updated_by: me.id },
      update: { value: p.value as object, updated_by: me.id, updated_at: new Date() },
    })
    results.push({ taskId: w.taskId, fieldId: w.fieldId, ok: true, value: p.value })
  }
  revalidate()
  return { success: true, results }
}

export async function setFieldValue(taskId: string, fieldId: string, value: unknown) {
  const r = await setFieldValues([{ taskId, fieldId, value }])
  if (!r.success) return r
  const one = r.results[0]
  return one.ok ? { success: true as const, value: one.value } : { success: false as const, error: one.error }
}

/**
 * "Make it a task field" (D5, research R3): a team column of a task sheet becomes
 * a task field with its name, kind and options; its values move onto the tasks;
 * the column is removed from the sheet (the field shows there instead). It is
 * attached to the types of the tasks that had values, optional.
 */
export async function makeTaskField(sheet: string, columnKey: string): Promise<{ success: true; fieldId: string; moved: number } | Fail> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const col = await prisma.sheetColumn.findUnique({ where: { sheet_key: { sheet, key: columnKey } }, include: { values: { include: { task: { select: { content_type_label: true } } } } } })
  if (!col || col.deleted_at || !col.kind || !columnKey.startsWith('c:')) return { success: false, error: 'not_found' }
  const kind: FieldKind | null = col.kind === 'choice' ? 'choice' : isFieldKind(col.kind) ? col.kind : null
  if (!kind) return { success: false, error: 'invalid' }
  let name = cleanName(col.name) || 'Field'
  for (let i = 2; await nameTaken(name); i++) name = `${cleanName(col.name) || 'Field'} ${i}`
  const choices = Array.isArray(col.options) ? (col.options as { id?: string; name?: string; color?: string }[]).map(o => ({ id: o.id, en: o.name ?? '', color: o.color ?? null })) : []
  const made = await createField({ name_en: name, kind, options: kind === 'choice' ? { choices } : {} })
  if (!made.success) return made
  const field = made.field
  let moved = 0
  const types = new Set<string>()
  for (const v of col.values) {
    const p = parseValue(field, v.value)
    const value = p.ok ? p.value : { kept: v.value }
    if (value === null) continue
    await prisma.taskFieldValue.upsert({
      where: { task_id_field_id: { task_id: v.task_id, field_id: field.id } },
      create: { task_id: v.task_id, field_id: field.id, value: value as object, updated_by: auth.member.id },
      update: { value: value as object },
    })
    if (v.task.content_type_label) types.add(v.task.content_type_label)
    moved++
  }
  for (const t of types) await attachField(t, field.id)
  await prisma.sheetColumn.update({ where: { id: col.id }, data: { deleted_at: new Date(), updated_by: auth.member.id } })
  revalidate()
  return { success: true, fieldId: field.id, moved }
}
