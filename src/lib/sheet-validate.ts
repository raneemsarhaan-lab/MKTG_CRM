/**
 * Data validation (spec 020 tip 18, research R6). Pure: shared by the blank
 * sheet (checking typed, pasted and filled values) and the server (cleaning
 * what's saved).
 */
import type { ValidationOp, ValidationRecord, ValidationRule } from '@/types/index'
import { parseDate, parseNumber, parseTime } from '@/lib/sheet-format'

export const MAX_VALIDATIONS = 200
export const MAX_LIST_ITEMS = 100
export const LIST_ITEM_LEN = 80
const OPS: ValidationOp[] = ['between', 'notBetween', 'eq', 'ne', 'gt', 'lt', 'ge', 'le']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const s = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '')

/** The list's items: trimmed, unique ignoring case, within the limits. Excel splits a typed Source on commas. */
export function listItems(input: string[] | string): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[,،;\n]/)
  const seen = new Set<string>(), out: string[] = []
  for (const it of raw) {
    const v = String(it).trim().slice(0, LIST_ITEM_LEN)
    if (!v || seen.has(v.toLowerCase())) continue
    seen.add(v.toLowerCase()); out.push(v)
    if (out.length >= MAX_LIST_ITEMS) break
  }
  return out
}

/** A rule as sent, checked field by field; null when it can't be kept. */
export function cleanRule(x: unknown): ValidationRule | null {
  const r = x as Partial<ValidationRule> | null
  if (!r || !['any', 'whole', 'decimal', 'list', 'date', 'time', 'length'].includes(r.allow as string)) return null
  const out: ValidationRule = {
    allow: r.allow!, ignoreBlank: r.ignoreBlank !== false, dropdown: r.dropdown !== false,
    input: r.input && (s(r.input.title, 32) || s(r.input.msg, 255)) ? { title: s(r.input.title, 32), msg: s(r.input.msg, 255) } : null,
    error: r.error ? { style: r.error.style === 'warning' || r.error.style === 'info' ? r.error.style : 'stop', title: s(r.error.title, 32), msg: s(r.error.msg, 255) } : null,
  }
  if (out.allow === 'list') {
    const values = listItems(r.values ?? [])
    if (!values.length) return null
    out.values = values
  } else if (out.allow !== 'any') {
    out.op = OPS.includes(r.op as ValidationOp) ? r.op : 'between'
    out.a = s(r.a, 40).trim()
    if (out.op === 'between' || out.op === 'notBetween') out.b = s(r.b, 40).trim()
    if (!boundOk(out.allow, out.a) || ((out.op === 'between' || out.op === 'notBetween') && !boundOk(out.allow, out.b ?? ''))) return null
  }
  return out
}
export function cleanRecord(x: unknown): ValidationRecord | null {
  const r = x as Partial<ValidationRecord> | null
  if (!r || ![r.id, r.top, r.left, r.bottom, r.right].every(v => typeof v === 'string' && UUID.test(v))) return null
  const rule = cleanRule(r)
  return rule ? { id: r.id!, top: r.top!, left: r.left!, bottom: r.bottom!, right: r.right!, ...rule } : null
}

/** A bound as a number to compare (dates as days, times as minutes); null when it isn't one. */
function asNumber(kind: ValidationRule['allow'], text: string): number | null {
  if (kind === 'date') { const d = parseDate(text); return d ? Date.UTC(d.y, d.m - 1, d.d) / 86_400_000 : null }
  if (kind === 'time') { const t = parseTime(text); return t ? t.h * 60 + t.min : null }
  return parseNumber(text)
}
const boundOk = (kind: ValidationRule['allow'], text: string) => asNumber(kind === 'length' ? 'whole' : kind, text) !== null

function compare(op: ValidationOp, v: number, a: number, b: number | null): boolean {
  switch (op) {
    case 'between': return b !== null && v >= Math.min(a, b) && v <= Math.max(a, b)
    case 'notBetween': return b !== null && (v < Math.min(a, b) || v > Math.max(a, b))
    case 'eq': return v === a
    case 'ne': return v !== a
    case 'gt': return v > a
    case 'lt': return v < a
    case 'ge': return v >= a
    case 'le': return v <= a
  }
}

/** Whether a value may go in a cell under this rule (an alert off lets anything through). */
export function allowed(rule: ValidationRule, value: string): boolean {
  if (rule.allow === 'any' || !rule.error) return true
  const v = value.trim()
  if (!v) return rule.ignoreBlank
  if (rule.allow === 'list') return (rule.values ?? []).some(x => x.toLowerCase() === v.toLowerCase())
  const a = asNumber(rule.allow === 'length' ? 'whole' : rule.allow, rule.a ?? '')
  const b = rule.b !== undefined ? asNumber(rule.allow === 'length' ? 'whole' : rule.allow, rule.b) : null
  if (a === null) return true
  let n: number | null
  if (rule.allow === 'length') n = [...v].length
  else n = asNumber(rule.allow, v)
  if (n === null) return false
  if (rule.allow === 'whole' && !Number.isInteger(n)) return false
  return compare(rule.op ?? 'between', n, a, b)
}

/** The list item a value matches, spelled as in the list ("doing" → "Doing"). */
export function listSpelling(rule: ValidationRule, value: string): string {
  if (rule.allow !== 'list') return value
  const v = value.trim().toLowerCase()
  return (rule.values ?? []).find(x => x.toLowerCase() === v) ?? value
}

/** Two rectangles of indexes overlap. */
export const overlaps = (a: { r0: number; c0: number; r1: number; c1: number }, b: { r0: number; c0: number; r1: number; c1: number }) =>
  a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1
