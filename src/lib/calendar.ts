/**
 * One continuous calendar (spec 021 FR-014). Pure: no React, no Prisma.
 * Weeks start on Monday. Dates are local calendar days as 'YYYY-MM-DD'.
 */

export const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Parse 'YYYY-MM-DD' (or an ISO timestamp) as a local day. */
export function dayOf(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function monday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

export interface CalDay { iso: string; day: number; inMonth: boolean }

/** Whole weeks covering the month, Monday first. */
export function monthGrid(year: number, month: number): CalDay[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const start = monday(first)
  const days: CalDay[] = []
  for (let d = new Date(start); d <= last || days.length % 7 !== 0; d.setDate(d.getDate() + 1)) {
    days.push({ iso: isoOf(d), day: d.getDate(), inMonth: d.getMonth() === month })
  }
  return days
}

/** The seven days of the week holding `anchor`. */
export function weekGrid(anchor: string): CalDay[] {
  const start = monday(dayOf(anchor))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i)
    return { iso: isoOf(d), day: d.getDate(), inMonth: true }
  })
}

export function moveMonth(year: number, month: number, by: number): { year: number; month: number } {
  const d = new Date(year, month + by, 1)
  return { year: d.getFullYear(), month: d.getMonth() }
}

export function moveWeek(anchor: string, by: number): string {
  const d = dayOf(anchor); d.setDate(d.getDate() + 7 * by)
  return isoOf(d)
}
