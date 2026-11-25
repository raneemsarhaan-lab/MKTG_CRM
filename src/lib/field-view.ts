/**
 * Fields in views (user, 25 Nov 2026, §5): a view filters, sorts and groups by any standard field and any
 * custom field on in its Space. These helpers read a task's value for a field key, name a value for a
 * person, and split tasks into groups by a field. Pure, so every page (Space, brand, My tasks) agrees.
 */
import type { FieldOption, Member, TaskFieldDef } from '@/types/index'
import { builtInValue, isFieldViewKey, valueKeys, type FieldValueOf, type FieldViewKey, type ViewableTask } from '@/lib/view-config'
import { fieldName } from '@/lib/task-fields'

export interface FieldViewContext {
  /** task id → field id → value */
  values: Map<string, Map<string, unknown>>
  defs: TaskFieldDef[]
  members: Pick<Member, 'id' | 'name'>[]
  pillars: { id: string; name: string }[]
  locale: string
}

/** A task's value for a field key: custom fields from the field values, built-in ones off the task. */
export const valueOfFrom = (ctx: Pick<FieldViewContext, 'values'>): FieldValueOf => (task, key) =>
  key.startsWith('f:') ? ctx.values.get((task as { id?: string }).id ?? '')?.get(key.slice(2)) : builtInValue(task, key)

const choiceName = (o: FieldOption, locale: string) => (locale.startsWith('ar') && o.ar ? o.ar : o.en)

/** A field's label (for the filter and group menus). */
export function fieldLabel(key: FieldViewKey, ctx: Pick<FieldViewContext, 'defs' | 'locale'>, builtIn: (k: string) => string): string {
  if (key.startsWith('f:')) { const d = ctx.defs.find(f => f.id === key.slice(2)); return d ? fieldName(d, ctx.locale) : key }
  return builtIn(key)
}

/** What one stored value key is called: a choice's name, a person's name, a pillar's name, Yes. */
export function valueLabel(key: FieldViewKey, value: string, ctx: FieldViewContext, yes: string): string {
  if (value === 'yes') return yes
  if (key === 'pillar') return ctx.pillars.find(p => p.id === value)?.name ?? value
  if (key.startsWith('f:')) {
    const d = ctx.defs.find(f => f.id === key.slice(2))
    if (d?.kind === 'choice' || d?.kind === 'multi') { const o = d.options.choices?.find(c => c.id === value); if (o) return choiceName(o, ctx.locale) }
    if (d?.kind === 'person') return ctx.members.find(m => m.id === value)?.name ?? value
  }
  return value
}

/** The values a field filter can pick from (beyond "Has a value" and "Empty"). */
export function filterChoices(key: FieldViewKey, ctx: FieldViewContext, tasks: (ViewableTask & { id: string })[], yes: string): { id: string; name: string }[] {
  if (key.startsWith('f:')) {
    const d = ctx.defs.find(f => f.id === key.slice(2))
    if (!d) return []
    if (d.kind === 'choice' || d.kind === 'multi') return (d.options.choices ?? []).map(c => ({ id: c.id, name: choiceName(c, ctx.locale) }))
    if (d.kind === 'person') return ctx.members.map(m => ({ id: m.id, name: m.name }))
    if (d.kind === 'checkbox') return [{ id: 'yes', name: yes }]
    return []
  }
  if (key === 'priority') return ['Urgent', 'High', 'Normal', 'Low'].map(p => ({ id: p, name: p }))
  if (key === 'pillar') return ctx.pillars.map(p => ({ id: p.id, name: p.name }))
  if (key === 'platform') return [...new Set(tasks.map(x => (x as { platform?: string | null }).platform).filter((p): p is string => !!p))].sort().map(p => ({ id: p, name: p }))
  return []
}

/** Whether a field can group a view: values people pick from a list (choice, multi, person, checkbox, priority, pillar). */
export function groupable(key: FieldViewKey, defs: TaskFieldDef[]): boolean {
  if (key === 'priority' || key === 'pillar' || key === 'platform') return true
  const d = key.startsWith('f:') ? defs.find(f => f.id === key.slice(2)) : null
  return !!d && ['choice', 'multi', 'person', 'checkbox'].includes(d.kind)
}

/**
 * Tasks grouped by a field: one group per value (in the field's own order where it has one), a task with
 * several values (multi) in each of them, then the tasks with none.
 */
export function groupByField<T extends ViewableTask & { id: string }>(tasks: T[], key: FieldViewKey, ctx: FieldViewContext, labels: { yes: string; none: string }): { key: string; label: string; tasks: T[] }[] {
  if (!isFieldViewKey(key)) return [{ key: 'all', label: '', tasks }]
  const valueOf = valueOfFrom(ctx)
  const by = new Map<string, T[]>()
  const blank: T[] = []
  for (const x of tasks) {
    const ks = valueKeys(valueOf(x, key))
    if (!ks.length) { blank.push(x); continue }
    for (const k of ks) { const list = by.get(k); if (list) list.push(x); else by.set(k, [x]) }
  }
  const order = filterChoices(key, ctx, tasks, labels.yes).map(o => o.id)
  const keys = [...by.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b)
    return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib) || valueLabel(key, a, ctx, labels.yes).localeCompare(valueLabel(key, b, ctx, labels.yes))
  })
  return [
    ...keys.map(k => ({ key: k, label: valueLabel(key, k, ctx, labels.yes), tasks: by.get(k)! })),
    ...(blank.length ? [{ key: '__none', label: labels.none, tasks: blank }] : []),
  ]
}
