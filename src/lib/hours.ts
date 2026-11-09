/**
 * Daily working hours (spec 014). Pure: dates are 'YYYY-MM-DD' strings for the
 * member's own calendar (research R1), so nothing here depends on a time zone.
 *
 * The working week is Sunday to Thursday (R5), as My Board's week already is.
 */
import type { WorkDayEntry } from '@/types/index'

export const MAX_BACK_DAYS = 30
export const MAX_LINES = 31

// ── dates ───────────────────────────────────────────────────────────────────
const RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A date string's UTC midnight, for arithmetic only. Null when it isn't a real date. */
function utc(d: string): number | null {
  const m = RE.exec(d)
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
  const back = new Date(t)
  return back.getUTCFullYear() === +m[1] && back.getUTCMonth() === +m[2] - 1 && back.getUTCDate() === +m[3] ? t : null
}
export const isDate = (d: string) => utc(d) !== null
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10)

/** A Date's calendar day where it is (the browser's), as 'YYYY-MM-DD'. */
export function toISODate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function addDays(d: string, n: number): string {
  const t = utc(d)
  if (t === null) throw new Error(`bad date ${d}`)
  return fromUtc(t + n * 86_400_000)
}
export const daysBetween = (a: string, b: string) => Math.round(((utc(b) ?? 0) - (utc(a) ?? 0)) / 86_400_000)
/** 0 = Sunday … 6 = Saturday. */
export const weekday = (d: string) => new Date(utc(d) ?? 0).getUTCDay()

/** Sunday to Thursday (R5). */
export const isWorkingDay = (d: string) => weekday(d) <= 4
/** The Sunday that starts this date's week. */
export const weekOf = (d: string) => addDays(d, -weekday(d))
/** Sunday to Saturday of a week. */
export const weekDays = (sunday: string) => Array.from({ length: 7 }, (_, i) => addDays(sunday, i))

/** The reminder's day: the last working day before `today`, not before `since` (the account's first day). */
export function lastWorkingDayBefore(today: string, since: string): string | null {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i)
    if (d < since) return null
    if (isWorkingDay(d)) return d
  }
  return null
}

/** Working days from `from` to `to` (both included) with no entry, not before `since`, newest first. */
export function missingDays(logged: Set<string>, from: string, to: string, since: string): string[] {
  const out: string[] = []
  for (let d = to; d >= from; d = addDays(d, -1)) {
    if (d < since) break
    if (isWorkingDay(d) && !logged.has(d)) out.push(d)
  }
  return out
}

// ── hours ───────────────────────────────────────────────────────────────────
export type HoursError = 'bad_hours' | 'bad_step'

const ARABIC = '٠١٢٣٤٥٦٧٨٩', PERSIAN = '۰۱۲۳۴۵۶۷۸۹'
/**
 * What a member types: 7.5, 7,5, 7:30, ٧٫٥ or Arabic digits. 0–24 in quarter
 * hours. Empty is null (nothing typed).
 */
export function parseHours(text: string): { ok: true; hours: number | null } | { ok: false; error: HoursError } {
  let s = String(text ?? '').trim()
  s = s.replace(/[٠-٩]/g, c => String(ARABIC.indexOf(c))).replace(/[۰-۹]/g, c => String(PERSIAN.indexOf(c)))
  s = s.replace(/[٫,]/g, '.').replace(/\s*(h|hrs?|hours?|س|ساعة|ساعات)$/i, '').trim()
  if (!s) return { ok: true, hours: null }
  let n: number
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (hm) {
    if (+hm[2] >= 60) return { ok: false, error: 'bad_hours' }
    n = +hm[1] + +hm[2] / 60
  } else if (/^\d{1,2}(\.\d+)?$|^\.\d+$/.test(s)) n = Number(s)
  else return { ok: false, error: 'bad_hours' }
  if (!(n >= 0 && n <= 24)) return { ok: false, error: 'bad_hours' }
  if (Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return { ok: false, error: 'bad_step' }
  return { ok: true, hours: Math.round(n * 4) / 4 }
}

// ── saving ──────────────────────────────────────────────────────────────────
export type LineError = HoursError | 'future' | 'too_old' | 'duplicate' | 'bad_date'
export interface Line { date: string; hours: number | null; off: boolean }

/**
 * Every line's problem, before anything is saved (contracts/server.md):
 * hours in range on a quarter hour, a real date, not after `today` + 1 (time
 * zones ahead), not older than 30 days for members, no date twice.
 */
export function validateLines(lines: Line[], o: { today: string; admin: boolean }): { date: string; error: LineError }[] {
  const out: { date: string; error: LineError }[] = []
  const seen = new Set<string>()
  const latest = addDays(o.today, 1), earliest = addDays(o.today, -MAX_BACK_DAYS - 1)
  for (const l of lines) {
    if (!isDate(l.date)) { out.push({ date: l.date, error: 'bad_date' }); continue }
    if (seen.has(l.date)) { out.push({ date: l.date, error: 'duplicate' }); continue }
    seen.add(l.date)
    if (l.date > latest) { out.push({ date: l.date, error: 'future' }); continue }
    if (!o.admin && l.date < earliest) { out.push({ date: l.date, error: 'too_old' }); continue }
    if (l.off || l.hours === null) continue
    if (typeof l.hours !== 'number' || !(l.hours >= 0 && l.hours <= 24)) { out.push({ date: l.date, error: 'bad_hours' }); continue }
    if (Math.abs(l.hours * 4 - Math.round(l.hours * 4)) > 1e-9) out.push({ date: l.date, error: 'bad_step' })
  }
  return out
}

// ── totals and the report ───────────────────────────────────────────────────
export const hoursOf = (e: WorkDayEntry | null | undefined) => (e && !e.off && typeof e.hours === 'number' ? e.hours : 0)
export const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

/** One week's totals, per member and per day. */
export function weekTotals(rows: { days: Record<string, WorkDayEntry | null> }[], days: string[]) {
  return {
    perMember: rows.map(r => sum(days.map(d => hoursOf(r.days[d])))),
    perDay: Object.fromEntries(days.map(d => [d, sum(rows.map(r => hoursOf(r.days[d])))])) as Record<string, number>,
  }
}

/** A member logged every working day of the week up to `today`, from `since` on. */
export function weekComplete(days: Record<string, WorkDayEntry | null>, week: string[], today: string, since: string) {
  return week.filter(d => isWorkingDay(d) && d < today && d >= since).every(d => !!days[d])
}

/** Excel's quoting: a field with a comma, quote or line break is quoted, quotes doubled. */
const cell = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/**
 * The report as CSV (R4): UTF-8 with a BOM so Excel reads Arabic names, CRLF
 * line ends, Excel quoting. Numbers stay plain (7.5) so they sum in a sheet.
 */
export function toCsv(
  report: { days: string[]; rows: { name: string; capacity: number; days: Record<string, WorkDayEntry | null>; total: number }[]; dayTotals: Record<string, number> },
  labels: { member: string; total: string; capacity: string; dayTotal: string; off: string; missing: string; dayHeading(d: string): string },
): string {
  const head = [labels.member, ...report.days.map(labels.dayHeading), labels.total, labels.capacity]
  const lines = [head]
  for (const r of report.rows) {
    lines.push([r.name, ...report.days.map(d => {
      const e = r.days[d]
      if (!e) return isWorkingDay(d) ? labels.missing : ''
      return e.off ? labels.off : String(e.hours ?? '')
    }), String(r.total), String(r.capacity)])
  }
  lines.push([labels.dayTotal, ...report.days.map(d => String(report.dayTotals[d] ?? 0)), String(sum(Object.values(report.dayTotals))), ''])
  return '﻿' + lines.map(l => l.map(cell).join(',')).join('\r\n') + '\r\n'
}
