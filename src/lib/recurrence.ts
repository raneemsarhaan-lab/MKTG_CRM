/**
 * Recurring tasks (spec 023 US8, R12, D17–D18). Pure. A repeat rule is anchored
 * on publishing dates: every N days, every N weeks on some weekdays, or monthly
 * on a day (short months use their last day). Each occurrence is created on
 * its creation day: its due date (by the due-date rule) minus the lead time in
 * working days. The lead time is at least the type's total SLA working days;
 * that minimum is also the default.
 */
import { addDays, calcDueDate, weekday, type DueRule } from '@/lib/due-dates'

export type Freq = 'days' | 'weeks' | 'monthly'
export interface Repeat {
  freq: Freq
  interval: number
  weekdays?: number[]
  month_day?: number | null
  ends_on?: string | null
  max_count?: number | null
  made_count?: number
}

const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10)

/** The first publishing date strictly after `after`, or null when the series has ended. */
export function nextOccurrence(r: Repeat, after: string, anchor: string): string | null {
  const step = Math.max(1, Math.trunc(r.interval || 1))
  let next: string | null = null
  if (r.freq === 'days') {
    let d = anchor
    while (d <= after) d = addDays(d, step)
    next = d
  } else if (r.freq === 'weeks') {
    const days = (r.weekdays?.length ? r.weekdays : [weekday(anchor)]).slice().sort()
    // Weeks counted from the anchor's week (Sunday start); only every `step`-th week counts.
    const weekStart = (x: string) => addDays(x, -weekday(x))
    const a0 = weekStart(anchor)
    for (let d = addDays(after, 1), i = 0; i < 800; i++, d = addDays(d, 1)) {
      if (d < anchor) continue
      const weeks = Math.round((Date.parse(weekStart(d)) - Date.parse(a0)) / (7 * 86400000))
      if (weeks % step === 0 && days.includes(weekday(d))) { next = d; break }
    }
  } else {
    const want = r.month_day ?? Number(anchor.slice(8, 10))
    let y = Number(anchor.slice(0, 4)), m = Number(anchor.slice(5, 7)) - 1
    for (let i = 0; i < 600; i++) {
      const d = iso(y, m, Math.min(want, lastDay(y, m)))
      if (d > after && d >= anchor) { next = d; break }
      m += step
      while (m > 11) { m -= 12; y++ }
    }
  }
  if (!next) return null
  if (r.ends_on && next > r.ends_on) return null
  if (r.max_count != null && (r.made_count ?? 0) >= r.max_count) return null
  return next
}

/** `n` working days before `day` (Settings weekend skipped). */
export function workingDaysBefore(day: string, n: number, weekend: number[]): string {
  let d = day, left = Math.max(0, Math.trunc(n))
  while (left > 0) { d = addDays(d, -1); if (!weekend.includes(weekday(d))) left-- }
  return d
}

/** When an occurrence is created: its due date (by the rule) minus the lead time in working days. */
export function creationDay(publish: string, leadWorkingDays: number, rule: DueRule): string {
  return workingDaysBefore(calcDueDate(publish, rule), leadWorkingDays, rule.weekend)
}

/** D17: the lead time may not be shorter than the type's total SLA working days. */
export const minLead = (slaWorkingDays: number) => Math.max(0, Math.ceil(slaWorkingDays))
export const leadOk = (lead: number, slaWorkingDays: number) => Number.isFinite(lead) && lead >= minLead(slaWorkingDays)

/** The key that makes an occurrence exactly once. */
export const recurrenceKey = (ruleId: string, publish: string) => `${ruleId}:${publish}`
