/**
 * Task templates (spec 023 US7, R11, D15–D16). Pure. A template belongs to a
 * task type and holds a name pattern, a brief, field values, priority, tags,
 * an assignee by role and subtasks whose dates are relative to the publishing
 * date. Editing a template changes new tasks only.
 */
import { addDays } from '@/lib/due-dates'

export interface TemplateSubtask { name: string; startOffset?: number | null; dueOffset?: number | null; assigneeRole?: string | null }
export interface TemplateValues { fields?: Record<string, unknown>; priority?: string | null; tagIds?: string[]; assigneeRole?: string | null; projectId?: string | null }

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "{Brand} recap · {Month}" → "Forefront recap · December". Unknown placeholders stay as typed. */
export function fillPattern(pattern: string, v: { brand?: string | null; type?: string | null; date?: string | null }): string {
  const month = v.date ? MONTHS_EN[Number(v.date.slice(5, 7)) - 1] : ''
  return pattern
    .replace(/\{Brand\}/g, v.brand ?? '')
    .replace(/\{Type\}/g, v.type ?? '')
    .replace(/\{Month\}/g, month)
    .replace(/\{Date\}/g, v.date ?? '')
    .replace(/\s+/g, ' ').trim()
}

/** A day relative to the publishing date (negative = before); null without a publishing date or offset. */
export const offsetDay = (publish: string | null | undefined, offset: number | null | undefined) =>
  publish && typeof offset === 'number' && Number.isFinite(offset) ? addDays(publish, Math.trunc(offset)) : null

/** Who takes a role: the first active member with that role; the creator when nobody has it. */
export function roleHolder(members: { id: string; role: string }[], role: string | null | undefined, creatorId: string): string {
  if (!role) return creatorId
  return members.find(m => m.role === role)?.id ?? creatorId
}

/** A template's subtasks as they'd be created for a publishing date. */
export function planSubtasks(subs: TemplateSubtask[], publish: string | null, members: { id: string; role: string }[], creatorId: string, fill: (s: string) => string) {
  return subs.filter(s => s && typeof s.name === 'string' && s.name.trim()).map(s => ({
    name: fill(s.name.trim()),
    start_date: offsetDay(publish, s.startOffset),
    due_date: offsetDay(publish, s.dueOffset),
    assignee_id: roleHolder(members, s.assigneeRole, creatorId),
  }))
}
