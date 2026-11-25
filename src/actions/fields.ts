'use server'

/**
 * The field system (owner's design of 25 Nov 2026). Nothing here deletes a value.
 *
 *   - setFieldOn: a custom field on or off in a Space. Anyone in the Space may turn one on; turning one
 *     off is for admins and superusers. A standard (or promoted) field can't be turned off.
 *   - setFieldRequired: required or optional in a Space, and before which stage (admins, superusers).
 *   - setFieldStandard: promote a custom field to Standard, or demote it (admins).
 *   - createSpaceField: "+ New field" on a sheet — a custom field, on in the Spaces chosen (anyone).
 *   - setMyColumns: this person's own columns in a sheet view (show, hide, order, widths), or reset.
 *   - setFieldOrder: the order of a Space's custom fields in the task panel (admins, superusers).
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { ALL_STAGES } from '@/lib/stage-meta'
import { MAX_FIELD_NAME, isFieldKind } from '@/lib/task-fields'
import { classOf, isBuiltInCustom, isLibraryKey, ruleKeyOf } from '@/lib/field-catalog'
import { mapTaskField } from '@/lib/mappers'
import type { StageId, TaskFieldDef } from '@/types/index'

type Fail = { success: false; error: string }
type Ok = { success: true }
const lead = (m: { access: string }) => m.access === 'admin' || m.access === 'superuser'
const revalidate = () => revalidatePath('/', 'layout')
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

async function promoted(): Promise<string[]> {
  return (await prisma.workspaceSettings.findUnique({ where: { id: 1 }, select: { standard_fields: true } }))?.standard_fields ?? []
}

/** A key the field system knows: a built-in custom field or a live library field. */
async function knownCustom(key: string): Promise<boolean> {
  if (isBuiltInCustom(key)) return true
  if (!isLibraryKey(key)) return false
  return !!(await prisma.taskField.findFirst({ where: { id: key.slice(2), retired_at: null }, select: { id: true } }))
}

/** Whether the member may work in the Space: its members, admins, superusers, and everyone for a Space seen by everyone. */
async function inSpace(spaceId: string, m: { id: string; access: string }) {
  const space = await prisma.teamSpace.findUnique({ where: { id: spaceId }, select: { id: true, key: true, settings: true, archived_at: true } })
  if (!space || space.archived_at) return null
  if (lead(m)) return space
  if ((space.settings as { visibility?: string } | null)?.visibility === 'everyone') return space
  return (await prisma.teamSpaceMember.findFirst({ where: { space_id: spaceId, member_id: m.id }, select: { member_id: true } })) ? space : null
}

/** Change one field's rule in a Space's stored settings, keeping everything else as stored. */
async function patchRule(space: { id: string; key: string; settings: unknown }, key: string, patch: Record<string, unknown>) {
  const stored = isObj(space.settings) ? { ...space.settings } : {}
  const fields = isObj(stored.fields) ? { ...stored.fields } : {}
  const rk = ruleKeyOf(key)
  const rule = { ...(isObj(fields[rk]) ? fields[rk] as Record<string, unknown> : {}), ...patch }
  for (const k of Object.keys(rule)) if (rule[k] === undefined) delete rule[k]
  fields[rk] = rule
  stored.fields = fields
  await prisma.teamSpace.update({ where: { id: space.id }, data: { settings: stored as object, updated_at: new Date() } })
  revalidatePath(`/spaces/${space.key}`)
}

export async function setFieldOn(spaceId: string, key: string, on: boolean): Promise<Ok | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!(await knownCustom(key))) return { success: false, error: 'not_found' }
  if (classOf(key, await promoted()) === 'standard') return { success: false, error: 'standard' }
  if (!on && !lead(me)) return { success: false, error: 'not_authorized' }
  const space = await inSpace(spaceId, me)
  if (!space) return { success: false, error: 'not_authorized' }
  await patchRule(space, key, { shown: !!on })
  revalidate()
  return { success: true }
}

export async function setFieldRequired(spaceId: string, key: string, required: boolean, before?: StageId | null): Promise<Ok | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!lead(me)) return { success: false, error: 'not_authorized' }
  if (!(await knownCustom(key))) return { success: false, error: 'not_found' }
  if (before != null && !ALL_STAGES.includes(before)) return { success: false, error: 'invalid' }
  const space = await inSpace(spaceId, me)
  if (!space) return { success: false, error: 'not_found' }
  // Required means on: a required field the Space doesn't show couldn't be filled.
  await patchRule(space, key, { required: !!required, before: before === undefined ? undefined : before, ...(required ? { shown: true } : {}) })
  revalidate()
  return { success: true }
}

export async function setFieldStandard(key: string, standard: boolean): Promise<Ok | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (me.access !== 'admin') return { success: false, error: 'not_authorized' }
  if (!(await knownCustom(key))) return { success: false, error: 'not_found' }
  const list = await promoted()
  const next = standard ? [...new Set([...list, key])] : list.filter(k => k !== key)
  await prisma.workspaceSettings.upsert({
    where: { id: 1 }, update: { standard_fields: next },
    create: { id: 1, capacity_hrs_per_wk: 40, nine_stage_default: false, standard_fields: next },
  })
  revalidate()
  return { success: true }
}

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * "+ New field" on a sheet, "On the task": a custom field, attached to no type (it applies to every
 * task), on in the Spaces chosen and off elsewhere until a Space turns it on.
 */
export async function createSpaceField(input: { name: string; kind: string; spaceIds: string[]; choices?: string[] }): Promise<{ success: true; field: TaskFieldDef; key: string } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ').slice(0, MAX_FIELD_NAME) : ''
  if (!name) return { success: false, error: 'name_empty' }
  if (!isFieldKind(input.kind)) return { success: false, error: 'invalid' }
  const live = await prisma.taskField.findMany({ where: { retired_at: null }, select: { name_en: true } })
  if (live.some(f => norm(f.name_en) === norm(name))) return { success: false, error: 'exists' }
  const spaces = []
  for (const id of [...new Set(Array.isArray(input.spaceIds) ? input.spaceIds : [])].slice(0, 20)) {
    const s = await inSpace(id, me)
    if (s) spaces.push(s)
  }
  if (!spaces.length) return { success: false, error: 'not_authorized' }
  const choices = (Array.isArray(input.choices) ? input.choices : []).map(c => String(c).trim().slice(0, 40)).filter(Boolean).slice(0, 50)
  const options: TaskFieldDef['options'] = { default_on: false }
  if (input.kind === 'choice' || input.kind === 'multi') options.choices = choices.map((en, i) => ({ id: `c${i + 1}`, en, ar: null, color: null }))
  if (input.kind === 'money') options.currency = 'EGP'
  if (input.kind === 'rating') options.max = 5
  const f = await prisma.taskField.create({ data: {
    name_en: name, name_ar: null, kind: input.kind, options: options as object,
    on_card: false, switchable: false, position: await prisma.taskField.count(), created_by: me.id,
  } })
  const key = `f:${f.id}`
  for (const s of spaces) await patchRule(s, key, { shown: true })
  revalidate()
  return { success: true, field: mapTaskField(f), key }
}

/** One person's columns in one sheet view; null puts the Space's default back. */
export async function setMyColumns(viewKey: string, layout: { cols: string[]; widths?: Record<string, number> } | null): Promise<Ok | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (typeof viewKey !== 'string' || !/^[\w:-]{1,120}$/.test(viewKey)) return { success: false, error: 'invalid' }
  const row = await prisma.member.findUnique({ where: { id: me.id }, select: { sheet_layouts: true } })
  const all = isObj(row?.sheet_layouts) ? { ...row!.sheet_layouts as Record<string, unknown> } : {}
  if (layout === null) delete all[viewKey]
  else {
    const cols = (Array.isArray(layout.cols) ? layout.cols : []).filter(k => typeof k === 'string' && k.length <= 60).slice(0, 120)
    const widths: Record<string, number> = {}
    for (const [k, w] of Object.entries(isObj(layout.widths) ? layout.widths : {})) {
      if (typeof w === 'number' && Number.isFinite(w) && k.length <= 60) widths[k] = Math.max(60, Math.min(600, Math.round(w)))
    }
    all[viewKey] = { cols: [...new Set(cols)], widths }
  }
  await prisma.member.update({ where: { id: me.id }, data: { sheet_layouts: all as object } })
  return { success: true }
}

export async function setFieldOrder(spaceId: string, keys: string[]): Promise<Ok | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!lead(me)) return { success: false, error: 'not_authorized' }
  const space = await inSpace(spaceId, me)
  if (!space) return { success: false, error: 'not_found' }
  const stored = isObj(space.settings) ? { ...space.settings } : {}
  stored.field_order = (Array.isArray(keys) ? keys : []).filter(k => typeof k === 'string' && k.length <= 60).slice(0, 100)
  await prisma.teamSpace.update({ where: { id: space.id }, data: { settings: stored as object, updated_at: new Date() } })
  revalidate()
  return { success: true }
}
