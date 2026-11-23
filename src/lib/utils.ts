// Pure utility functions — no side effects, deterministic
// research.md Decision 1, data-model.md §Avatar Color Function

/**
 * Spec 022 (US6, R12): working days on Cairo days. The weekend is the one in
 * Settings › Due Dates (Friday and Saturday unless changed): the SLA and the
 * due-date rule count the same week.
 */
export const DEFAULT_WEEKEND = [5, 6]
let workWeekend: number[] = DEFAULT_WEEKEND
/** The workspace's weekend, set from Settings where the page's data is loaded (one workspace per deployment). */
export function setWorkWeekend(days: number[] | null | undefined) {
  if (Array.isArray(days) && days.length < 7) workWeekend = [...days]
}
export const getWorkWeekend = () => workWeekend
const cairoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const utcOf = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** Working days from `from` to `to`, counted on Cairo days (the day `from` is in doesn't count; `to`'s does). */
export function businessDaysBetween(from: Date, to: Date, weekend: number[] = workWeekend): number {
  if (!(from instanceof Date) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0
  const cur = utcOf(cairoDay(from))
  const end = utcOf(cairoDay(to))
  if (cur >= end) return 0
  const off = new Set(weekend)
  let count = 0
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1)
    if (!off.has(cur.getUTCDay())) count++
  }
  return count
}

/**
 * The date `n` working days before `to`: the inverse of businessDaysBetween,
 * so `businessDaysBetween(subtractBusinessDays(to, n), to) === n`. Used to
 * restore a dropped clip with its SLA clock as it was (spec 008 FR-061).
 */
export function subtractBusinessDays(to: Date, n: number, weekend: number[] = workWeekend): Date {
  const off = new Set(weekend)
  const cur = utcOf(cairoDay(to))
  let count = 0
  while (count < n) {
    if (!off.has(cur.getUTCDay())) count++
    cur.setUTCDate(cur.getUTCDate() - 1)
  }
  // Midday Cairo, so the day is the same in any reading.
  return new Date(cur.getTime() + 10 * 3600_000)
}

/** Count calendar days between two dates (positive = to is after from). */
export function calDaysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/** ISO date string for today (YYYY-MM-DD). */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0]
}

/** Up-to-2-letter initials from a display name. */
export function initials(name: string): string {
  return name
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Deterministic avatar background color based on name hash. */
export function avatarColor(name: string): string {
  const palette = [
    '#1B1D1F', '#6E5BE6', '#3FA34D', '#5B93F5',
    '#E0736A', '#5B6066', '#B4863F',
  ]
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0
  }
  return palette[Math.abs(h) % palette.length]
}

/** Soft gradient background derived from brand hex color. */
export function brandGradient(hex: string): string {
  return `linear-gradient(135deg, ${hex}22, ${hex}55)`
}

/** Time-of-day greeting string. */
export function getGreeting(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
