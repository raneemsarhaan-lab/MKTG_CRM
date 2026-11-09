/**
 * Dates in the team's time zone (spec 012 FR-050, R9). Pure.
 *
 * Due dates are calendar days. "Tomorrow" and "overdue" are read in the
 * team's zone (NOTIFY_TZ, Cairo by default), not UTC, so a task due on the
 * 9th is "due tomorrow" all through the 8th in Cairo.
 */
export const DEFAULT_TZ = 'Africa/Cairo'

/** YYYY-MM-DD for `now` in `tz`. */
export function teamDay(now: Date, tz = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** The hour and minute of `now` in `tz`. */
export function teamClock(now: Date, tz = DEFAULT_TZ): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  return { h: Number(parts.find(p => p.type === 'hour')?.value ?? 0), m: Number(parts.find(p => p.type === 'minute')?.value ?? 0) }
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 'due_soon' when due tomorrow, 'overdue' when before today, else null. Published or archived tasks: null. */
export function dueState(
  task: { due_date: string | null; status: string; dropped_at?: string | Date | null },
  now: Date,
  tz = DEFAULT_TZ,
): 'due_soon' | 'overdue' | null {
  if (!task.due_date || task.dropped_at || task.status === 'publish') return null
  const due = task.due_date.slice(0, 10)
  const today = teamDay(now, tz)
  if (due === addDays(today, 1)) return 'due_soon'
  if (due < today) return 'overdue'
  return null
}
