/**
 * Custom fields by task type (spec 023 US2, research R2–R4). Pure: used by the
 * server actions, every editor (panel, sheets, cards), filters and the lab.
 *
 * A field lives in the workspace library and is attached to task types, each
 * optional or required from a pipeline stage. Its value belongs to the task.
 */
import type { FieldKind, StageId, TaskFieldDef, TaskTypeFieldLink } from '@/types/index'
import { ALL_STAGES } from '@/lib/stage-meta'

export const FIELD_KINDS: FieldKind[] = ['text', 'number', 'money', 'date', 'link', 'person', 'choice', 'multi', 'checkbox', 'rating', 'task']
export const isFieldKind = (v: unknown): v is FieldKind => typeof v === 'string' && (FIELD_KINDS as string[]).includes(v)
export const MAX_TEXT = 5000
export const MAX_FIELD_NAME = 60
export const MAX_CHOICES = 50

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

/** A field's name in the reader's language. */
export const fieldName = (f: Pick<TaskFieldDef, 'name_en' | 'name_ar'>, locale: string) => (locale.startsWith('ar') && f.name_ar ? f.name_ar : f.name_en)

/** Empty: nothing, blank text, an empty list. A false checkbox counts as filled (it was answered). */
export function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true
  if (typeof v === 'string') return v.trim() === ''
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Arabic-Indic and Persian digits, and the Arabic decimal and thousands signs, as plain ones. */
export function latinDigits(s: string): string {
  return s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))
    .replace(/٫/g, '.').replace(/٬/g, ',').replace(/[\u200e\u200f\u061c]/g, '')
}

/**
 * QA 26 Nov 2026 (QF-10): a number as typed. Letters are refused (money may start or end with a currency:
 * EGP, $, €, £, ج.م). A comma is a decimal point unless it groups thousands ("1,5" → 1.5, "1,200" → 1200,
 * "1.200,5" → 1200.5). Arabic digits are read.
 */
function num(input: unknown, money = false): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null
  let t = latinDigits(input).trim().replace(/\s+/g, '')
  if (money) t = t.replace(/^(?:[A-Za-z]{3}|[$€£]|ج\.?م\.?)/i, '').replace(/(?:[A-Za-z]{3}|[$€£]|ج\.?م\.?)$/i, '')
  if (!t || /[^\d.,-]/.test(t)) return null
  const commas = (t.match(/,/g) ?? []).length, dots = (t.match(/\./g) ?? []).length
  if (commas && dots) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  else if (commas === 1 && !/^-?\d{1,3},\d{3}$/.test(t)) t = t.replace(',', '.')
  else if (commas) { if (!/^-?\d{1,3}(,\d{3})+$/.test(t)) return null; t = t.replace(/,/g, '') }
  if (!/^-?\d*\.?\d+$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/** A real calendar day (no 31 February), as YYYY-MM-DD. */
function realDay(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
}

/** A choice by its id or its name (English or Arabic), ignoring case and spacing. */
function choiceId(f: TaskFieldDef, input: unknown): string | null {
  if (typeof input !== 'string') return null
  const list = f.options.choices ?? []
  return list.find(c => c.id === input)?.id ?? list.find(c => norm(c.en) === norm(input) || (!!c.ar && norm(c.ar) === norm(input)))?.id ?? null
}

export type Parsed = { ok: true; value: unknown } | { ok: false; error: 'invalid' }

/**
 * What's typed, pasted or picked, as the value the field keeps. Empty input
 * clears the value (`null`).
 */
export function parseValue(f: TaskFieldDef, input: unknown): Parsed {
  if (input === null || input === undefined || (typeof input === 'string' && input.trim() === '') || (Array.isArray(input) && !input.length)) return { ok: true, value: null }
  switch (f.kind) {
    case 'text': {
      if (typeof input !== 'string') return { ok: false, error: 'invalid' }
      return { ok: true, value: input.replace(/\r\n/g, '\n').slice(0, MAX_TEXT) }
    }
    case 'number': case 'money': {
      const n = num(input, f.kind === 'money')
      return n === null ? { ok: false, error: 'invalid' } : { ok: true, value: n }
    }
    case 'date': {
      if (typeof input !== 'string') return { ok: false, error: 'invalid' }
      // QA 26 Nov 2026 (QF-10): Arabic digits read; the day must exist (no 31 February).
      const t = latinDigits(input).trim()
      const a = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/), b = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
      const iso = a ? realDay(+a[1], +a[2], +a[3]) : b ? realDay(+b[3], +b[2], +b[1]) : null
      if (!iso) return { ok: false, error: 'invalid' }
      return { ok: true, value: iso }
    }
    case 'link': {
      if (typeof input !== 'string') return { ok: false, error: 'invalid' }
      const t = input.trim()
      const url = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : null
      return url ? { ok: true, value: url.slice(0, 2000) } : { ok: false, error: 'invalid' }
    }
    case 'person': case 'task':
      return typeof input === 'string' && /^[0-9a-f-]{36}$/i.test(input) ? { ok: true, value: input } : { ok: false, error: 'invalid' }
    case 'choice': {
      const id = choiceId(f, input)
      return id ? { ok: true, value: id } : { ok: false, error: 'invalid' }
    }
    case 'multi': {
      const items = Array.isArray(input) ? input : typeof input === 'string' ? input.split(',') : []
      const ids: string[] = []
      for (const it of items) { const id = choiceId(f, typeof it === 'string' ? it.trim() : it); if (!id) return { ok: false, error: 'invalid' }; if (!ids.includes(id)) ids.push(id) }
      return { ok: true, value: ids }
    }
    case 'checkbox': {
      if (typeof input === 'boolean') return { ok: true, value: input }
      const t = typeof input === 'string' ? norm(input) : ''
      if (['true', 'yes', '1', '✓', 'x', 'نعم'].includes(t)) return { ok: true, value: true }
      if (['false', 'no', '0', 'لا'].includes(t)) return { ok: true, value: false }
      return { ok: false, error: 'invalid' }
    }
    case 'rating': {
      const n = num(input), max = f.options.max ?? 5
      return n !== null && Number.isInteger(n) && n >= 0 && n <= max ? { ok: true, value: n } : { ok: false, error: 'invalid' }
    }
  }
}

/** A value as text (sheets, cards, copy, filters). Names come from the lookups given. */
export function formatValue(
  f: TaskFieldDef, v: unknown, ctx: { locale: string; memberName?(id: string): string | undefined; taskName?(id: string): string | undefined },
): string {
  if (isEmpty(v)) return ''
  // A value kept as text when the field's kind changed and it didn't fit (spec 023 edge case).
  if (keptText(v) !== null) return keptText(v) as string
  const ar = ctx.locale.startsWith('ar')
  const choice = (id: string) => { const c = (f.options.choices ?? []).find(x => x.id === id); return c ? (ar && c.ar ? c.ar : c.en) : '' }
  switch (f.kind) {
    case 'text': case 'link': case 'date': return String(v)
    case 'number': return new Intl.NumberFormat(ar ? 'ar-EG-u-nu-latn' : 'en-US').format(Number(v))
    case 'money': return new Intl.NumberFormat(ar ? 'ar-EG-u-nu-latn' : 'en-US', { style: 'currency', currency: f.options.currency ?? 'EGP', currencyDisplay: 'code', maximumFractionDigits: 2 }).format(Number(v))
    case 'person': return ctx.memberName?.(String(v)) ?? ''
    case 'task': return ctx.taskName?.(String(v)) ?? ''
    case 'choice': return choice(String(v))
    case 'multi': return (v as string[]).map(choice).filter(Boolean).join(', ')
    case 'checkbox': return v ? '✓' : ''
    case 'rating': return '★'.repeat(Number(v))
  }
}

/** The live fields attached to a type, in the type's order. */
export function fieldsForType(typeLabel: string | null | undefined, links: TaskTypeFieldLink[], fields: TaskFieldDef[]): { field: TaskFieldDef; link: TaskTypeFieldLink }[] {
  if (!typeLabel) return []
  const byId = new Map(fields.filter(f => !f.retired).map(f => [f.id, f]))
  return links.filter(l => l.type_label === typeLabel && byId.has(l.field_id))
    .sort((a, b) => a.position - b.position)
    .map(link => ({ field: byId.get(link.field_id)!, link }))
}

/** Whether a field is attached to (applies to) a task's type. */
export const applies = (typeLabel: string | null | undefined, fieldId: string, links: TaskTypeFieldLink[]) =>
  // Fields (25 Nov 2026): a field attached to no type is a Space's field and applies to every task; one
  // attached to types applies to those types.
  !links.some(l => l.field_id === fieldId) || (!!typeLabel && links.some(l => l.type_label === typeLabel && l.field_id === fieldId))

const at = (s: string) => ALL_STAGES.indexOf(s as StageId)

/**
 * The empty fields that stop a move to `target` (FR-008): attached to the
 * task's type, required from a stage at or before `target`, and empty. With the
 * task's stage, only a move that crosses the required stage is stopped: a task
 * already past it (before the field was required) isn't held back.
 */
export function missingRequired(
  task: { id: string; content_type_label: string | null; status?: string | null },
  target: StageId | string,
  links: TaskTypeFieldLink[], fields: TaskFieldDef[], values: { task_id: string; field_id: string; value: unknown }[],
): TaskFieldDef[] {
  const t = at(target)
  if (t < 0) return []
  const from = task.status ? at(task.status) : -1
  const out: TaskFieldDef[] = []
  for (const { field, link } of fieldsForType(task.content_type_label, links, fields)) {
    if (!link.required_from || at(link.required_from) < 0 || at(link.required_from) > t || at(link.required_from) <= from) continue
    const v = values.find(x => x.task_id === task.id && x.field_id === field.id)?.value
    if (isEmpty(v)) out.push(field)
  }
  return out
}

/** Where a field shows in the task panel: the top rows, or a section above or below the Description. */
export type FieldPlace = 'top' | 'above' | 'below'
export const placeOf = (f: TaskFieldDef): FieldPlace => (f.options.place === 'top' || f.options.place === 'below' ? f.options.place : 'above')

/** The required, empty fields of a task's type, whatever the stage (cards and sheets flag them). */
export function requiredEmpty(
  task: { id: string; content_type_label: string | null }, links: TaskTypeFieldLink[], fields: TaskFieldDef[], value: (fieldId: string) => unknown,
): { field: TaskFieldDef; link: TaskTypeFieldLink }[] {
  return fieldsForType(task.content_type_label, links, fields).filter(x => x.link.required_from && isEmpty(value(x.field.id)))
}

/** A new option id for a choice list. */
export const newChoiceId = (existing: { id: string }[]) => {
  let n = existing.length + 1
  while (existing.some(c => c.id === `o${n}`)) n++
  return `o${n}`
}

/** A value that didn't fit a new kind, kept as text: `{ kept: "…" }`. */
export const keptText = (v: unknown): string | null =>
  v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { kept?: unknown }).kept === 'string' ? (v as { kept: string }).kept : null

/** A value carried to a field of another kind: converted when it fits, otherwise kept as text. */
export function convertValue(from: TaskFieldDef, to: TaskFieldDef, v: unknown, ctx: { locale: string }): { value: unknown; kept: boolean } {
  if (isEmpty(v)) return { value: null, kept: false }
  const text = keptText(v) ?? (from.kind === 'choice' || from.kind === 'multi' ? formatValue(from, v, ctx) : Array.isArray(v) ? v.join(', ') : String(v))
  const p = parseValue(to, to.kind === 'checkbox' && typeof v === 'boolean' ? v : text)
  return p.ok ? { value: p.value, kept: false } : { value: { kept: text }, kept: true }
}
