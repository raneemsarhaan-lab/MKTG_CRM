/**
 * My tasks (user, 2026-11-23, design/my-tasks.html). Pure: the page, the
 * sidebar count and the lab use it.
 *
 * Mine: pipeline tasks I'm assigned to (lead or not), tasks waiting in a review
 * stage that my role holds, media tasks on the Design and Video boards
 * assigned to me, and my personal to-dos. Published and dropped tasks aren't
 * open.
 */
import type { StageId } from '@/types/index'
import { ALL_STAGES, STAGE_META } from '@/lib/stage-meta'
import { addDays } from '@/lib/due-dates'

export type Section = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none'
export const SECTIONS: Section[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'none']
export type Tile = 'today' | 'upcoming' | 'overdue' | 'all'

/** The review stages a role holds (C-Review, D-Check… by their owner role). */
export const stagesHeldBy = (role: string): StageId[] => ALL_STAGES.filter(s => STAGE_META[s].owner_role === role)

export function isMine(
  t: { status: string; assignee_id?: string | null; assignee_ids?: string[] | null; dropped_at?: unknown },
  me: { id: string; role: string },
): boolean {
  if (t.dropped_at || t.status === 'publish') return false
  if (t.assignee_id === me.id || t.assignee_ids?.includes(me.id)) return true
  return STAGE_META[t.status as StageId]?.owner_role === me.role
}

/** Which section a date falls in, seen from `today` (YYYY-MM-DD). This week: the 5 days after tomorrow. */
export function sectionOf(day: string | null | undefined, today: string): Section {
  if (!day) return 'none'
  if (day < today) return 'overdue'
  if (day === today) return 'today'
  if (day === addDays(today, 1)) return 'tomorrow'
  if (day <= addDays(today, 6)) return 'week'
  return 'later'
}

/** The date a new to-do gets when added at the bottom of a section. */
export function sectionDay(s: Section, today: string): string | null {
  switch (s) {
    case 'overdue': case 'today': return today
    case 'tomorrow': return addDays(today, 1)
    case 'week': return addDays(today, 2)
    case 'later': return addDays(today, 7)
    case 'none': return null
  }
}

/** Whether an item belongs to a tile: Today, Upcoming (the next 7 days, after today), Overdue, All. */
export function inTile(day: string | null | undefined, tile: Tile, today: string): boolean {
  if (tile === 'all') return true
  if (!day) return false
  if (tile === 'today') return day === today
  if (tile === 'overdue') return day < today
  return day > today && day <= addDays(today, 7)
}

export function tileCounts(days: (string | null | undefined)[], today: string): Record<Tile, number> {
  const c = { today: 0, upcoming: 0, overdue: 0, all: days.length }
  for (const d of days) { if (inTile(d, 'today', today)) c.today++; if (inTile(d, 'upcoming', today)) c.upcoming++; if (inTile(d, 'overdue', today)) c.overdue++ }
  return c
}
