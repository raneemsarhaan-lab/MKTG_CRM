/**
 * The Content summary line (spec 009 FR-006) and each theme's cadence
 * (FR-061 / US5, research R6). Pure.
 */
import type { ContentTheme, Task } from '@/types/index'

const DESIGN = ['r-design', 'd-prog', 'd-check', 'final-check']

export interface ContentSummary { pieces: number; published: number; design: number; noLink: number; archived: number }

export function summariseContent(pieces: Pick<Task, 'status' | 'dropped_at' | 'published_url'>[]): ContentSummary {
  const s: ContentSummary = { pieces: 0, published: 0, design: 0, noLink: 0, archived: 0 }
  for (const p of pieces) {
    if (p.dropped_at) { s.archived++; continue }
    s.pieces++
    if (DESIGN.includes(p.status)) s.design++
    if (p.status === 'publish') { s.published++; if (!p.published_url) s.noLink++ }
  }
  return s
}

/** The start of the current period: Monday 00:00 for weeks, the 1st for months (local time). */
export function periodStart(period: 'week' | 'month', now: Date): Date {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  if (period === 'month') { d.setDate(1); return d }
  const dow = (d.getDay() + 6) % 7   // Monday = 0
  d.setDate(d.getDate() - dow)
  return d
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Pieces published this period against the theme's frequency; null without one. */
export function cadence(theme: Pick<ContentTheme, 'frequency_count' | 'frequency_period'>,
  pieces: Pick<Task, 'status' | 'dropped_at' | 'stage_date'>[], now: Date,
): { done: number; target: number; met: boolean; period: 'week' | 'month' } | null {
  if (!theme.frequency_count || !theme.frequency_period) return null
  const from = ymd(periodStart(theme.frequency_period, now))
  const done = pieces.filter(p => !p.dropped_at && p.status === 'publish' && p.stage_date >= from).length
  return { done, target: theme.frequency_count, met: done >= theme.frequency_count, period: theme.frequency_period }
}
