/**
 * Publishing dates and due dates. Pure: used by the server actions, the
 * migration, Settings' live example, the views and the lab.
 *
 * Every date is a day in Africa/Cairo, written YYYY-MM-DD. The arithmetic is
 * done on those strings at UTC midnight, so no clock or time zone can move a
 * day by one.
 *
 * The rule: due = publishing date − N days (7 by default). If that lands on a
 * weekend day (Friday or Saturday by default) it moves to the nearest working
 * day, earlier by default or later if Settings say so.
 */

export const CAIRO = 'Africa/Cairo'

export type WeekendShift = 'earlier' | 'later'
export interface DueRule {
  daysBefore: number
  /** 0 Sunday … 6 Saturday. */
  weekend: number[]
  shift: WeekendShift
}
export const DEFAULT_RULE: DueRule = { daysBefore: 7, weekend: [5, 6], shift: 'earlier' }
export const MAX_DAYS_BEFORE = 365

const ISO = /^\d{4}-\d{2}-\d{2}$/
export const isDay = (v: unknown): v is string => typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))

/** Today's date in Cairo, YYYY-MM-DD. */
export function cairoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAIRO, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** A day as a Date at UTC midnight (for arithmetic and the database's date columns). */
export const dayDate = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const dayOf = (d: Date | string | null | undefined): string | null => {
  if (!d) return null
  if (typeof d === 'string') return d.slice(0, 10)
  return d.toISOString().slice(0, 10)
}
export function addDays(iso: string, n: number): string {
  const d = dayDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export const weekday = (iso: string) => dayDate(iso).getUTCDay()
/** Whole days from a to b (b − a). */
export const daysBetween = (a: string, b: string) => Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / 86400000)

/** The settings as given, checked. `error` names what's wrong; the rule is never all weekend. */
export function cleanRule(raw: unknown): { rule: DueRule; error: null } | { rule: null; error: 'days' | 'weekend_all' | 'shift' } {
  const r = (raw ?? {}) as Partial<DueRule>
  const days = Number(r.daysBefore)
  if (!Number.isInteger(days) || days < 0 || days > MAX_DAYS_BEFORE) return { rule: null, error: 'days' }
  const weekend = [...new Set((Array.isArray(r.weekend) ? r.weekend : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
  if (weekend.length >= 7) return { rule: null, error: 'weekend_all' }
  if (r.shift !== 'earlier' && r.shift !== 'later') return { rule: null, error: 'shift' }
  return { rule: { daysBefore: days, weekend, shift: r.shift }, error: null }
}

/** The due date for a publishing date under the rule. */
export function calcDueDate(publish: string, rule: DueRule = DEFAULT_RULE): string {
  let due = addDays(publish, -rule.daysBefore)
  const off = new Set(rule.weekend)
  if (off.size >= 7) return due
  const step = rule.shift === 'later' ? 1 : -1
  while (off.has(weekday(due))) due = addDays(due, step)
  return due
}

/**
 * What a task's due date should be after a change. A hand-set due date is
 * kept; otherwise it follows the publishing date (or empties with it).
 */
export function nextDueDate(task: { publish: string | null; due: string | null; manual: boolean }, rule: DueRule): string | null {
  if (task.manual) return task.due
  return task.publish ? calcDueDate(task.publish, rule) : null
}

/** Settings' rule from the workspace row. */
export function ruleFromSettings(ws: { due_days_before?: number | null; due_weekend_days?: number[] | null; due_weekend_shift?: string | null } | null | undefined): DueRule {
  const c = cleanRule({ daysBefore: ws?.due_days_before ?? DEFAULT_RULE.daysBefore, weekend: ws?.due_weekend_days ?? DEFAULT_RULE.weekend, shift: ws?.due_weekend_shift ?? DEFAULT_RULE.shift })
  return c.rule ?? DEFAULT_RULE
}

/** Is a task's due date past (Cairo), while its work is still open? */
export function isOverdue(task: { due_date?: string | null; status?: string; kind?: string | null; simple_status?: string | null; dropped_at?: string | null }, today: string = cairoToday()): boolean {
  if (!task.due_date || task.dropped_at) return false
  const done = task.kind === 'simple' ? task.simple_status === 's-done' : task.status === 'publish'
  return !done && task.due_date.slice(0, 10) < today
}

/**
 * The one way Momentum writes a day: "Tue 15 Dec", with the year when it
 * isn't this year ("Tue 15 Dec 2027"). Arabic uses the same parts.
 */
export function formatDay(iso: string | null | undefined, locale = 'en', today: string = cairoToday()): string {
  if (!iso) return ''
  const day = iso.slice(0, 10)
  if (!isDay(day)) return ''
  const withYear = day.slice(0, 4) !== today.slice(0, 4)
  // Built from its parts so every locale reads weekday, day, month[, year] with plain spaces.
  const parts = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', {
    timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}),
  }).formatToParts(dayDate(day))
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return [part('weekday'), part('day'), part('month'), withYear ? part('year') : ''].filter(Boolean).join(' ')
}

/** Sort key pieces for "due date, earliest first; then publishing date; then created". Undated last. */
export function compareByDue(
  a: { due_date?: string | null; publish_date?: string | null; created_at?: string | null },
  b: { due_date?: string | null; publish_date?: string | null; created_at?: string | null },
): number {
  const cmp = (x?: string | null, y?: string | null) => (x && y ? (x < y ? -1 : x > y ? 1 : 0) : x ? -1 : y ? 1 : 0)
  return cmp(a.due_date?.slice(0, 10), b.due_date?.slice(0, 10))
    || cmp(a.publish_date?.slice(0, 10), b.publish_date?.slice(0, 10))
    || cmp(a.created_at ?? null, b.created_at ?? null)
}

/** Same, by publishing date first. */
export function compareByPublish(
  a: { due_date?: string | null; publish_date?: string | null; created_at?: string | null },
  b: { due_date?: string | null; publish_date?: string | null; created_at?: string | null },
): number {
  const cmp = (x?: string | null, y?: string | null) => (x && y ? (x < y ? -1 : x > y ? 1 : 0) : x ? -1 : y ? 1 : 0)
  return cmp(a.publish_date?.slice(0, 10), b.publish_date?.slice(0, 10))
    || cmp(a.due_date?.slice(0, 10), b.due_date?.slice(0, 10))
    || cmp(a.created_at ?? null, b.created_at ?? null)
}
