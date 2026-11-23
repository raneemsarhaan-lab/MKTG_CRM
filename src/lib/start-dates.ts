/**
 * Start dates (spec 023 US6, R10, D13–D14). Pure. Dates only, no times. A
 * start date is empty unless set by hand or by a template, and never after the
 * due date. Workload spreads a task's hours across the working days from start
 * to due (the Settings weekend); without a start, they sit on the due day.
 */
import { addDays, weekday } from '@/lib/due-dates'

/** Refused when both are set and the start is after the due date. */
export const startAfterDue = (start: string | null | undefined, due: string | null | undefined) => !!start && !!due && start > due

/** The working days from `start` to `due`, both included (Settings weekend skipped). */
export function workingDaysIn(start: string, due: string, weekend: number[]): string[] {
  const out: string[] = []
  if (start > due) return out
  for (let d = start; d <= due && out.length < 400; d = addDays(d, 1)) if (!weekend.includes(weekday(d))) out.push(d)
  return out
}

/** Hours per day: spread over the span's working days; the due day alone when there's no start (or no working day in it). */
export function spreadHours(hours: number, start: string | null | undefined, due: string | null | undefined, weekend: number[]): Record<string, number> {
  if (!due || !(hours > 0)) return {}
  const days = start ? workingDaysIn(start, due, weekend) : []
  if (!days.length) return { [due]: hours }
  const each = Math.round((hours / days.length) * 100) / 100
  return Object.fromEntries(days.map(d => [d, each]))
}

/** The days a task covers on the calendar when "Spans" is on: start to due, both included. */
export function spanDays(start: string | null | undefined, due: string | null | undefined): string[] {
  if (!due) return []
  if (!start || start > due) return [due]
  const out: string[] = []
  for (let d = start; d <= due && out.length < 120; d = addDays(d, 1)) out.push(d)
  return out
}
