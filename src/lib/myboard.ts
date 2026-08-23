import type { StageId } from '@/types/index'

/**
 * Rows a dashboard panel shows before handing off to the board. Personal lists
 * rarely reach it; the team view's do on the first afternoon, and a dashboard
 * you have to scroll for forty seconds is not a dashboard.
 *
 * It lives here rather than in the panel because the page balances the Last
 * Week halves against it — and a server component cannot read a runtime value
 * out of a 'use client' module.
 */
export const PANEL_ROWS = 12

/**
 * Rows for a panel sharing the stacked side column. Two panels there against
 * one day planner beside them, so each gets roughly half the budget — a
 * column that runs twice the height of the thing it sits next to is a column
 * that has stopped being a sidebar.
 */
export const COLUMN_ROWS = 7

/**
 * My Board presentation mappings — developer handoff §6.
 *
 * The badge label and dot colour are *derived* from the stage enum, never
 * stored separately (§9.1).
 *
 * The handoff names five stages explicitly; this product has nine. The five it
 * names carry its exact hex values. The remaining four ('c-prog', 'r-design',
 * 'd-prog', 'publish') are not in the handoff and reuse the existing stage
 * palette from tokens.ts rather than inventing new colour.
 */
export const STAGE_BADGE: Record<StageId, { dot: string; label: string }> = {
  'todo':        { dot: '#8A8D91', label: 'To Do'     }, // handoff: "Not started"
  'c-prog':      { dot: '#3B82F6', label: 'Writing'   }, // not in handoff
  'c-final':     { dot: '#2E6FB0', label: 'C-Review'  }, // handoff: "Client review"
  'c-check':     { dot: '#1F5A94', label: 'C-Check'   }, // handoff: "Content check"
  'r-design':    { dot: '#8B5CF6', label: 'Ready'     }, // not in handoff
  'd-prog':      { dot: '#7C3AED', label: 'Designing' }, // not in handoff
  'd-check':     { dot: '#5B3FB5', label: 'D-Check'   }, // handoff: "Design check"
  'final-check': { dot: '#F59E0B', label: 'F-Check'   }, // handoff: "Final check"
  'ready-publish': { dot: '#0EA5E9', label: 'Ready' },   // not in handoff
  'scheduled':   { dot: '#14B8A6', label: 'Scheduled' }, // not in handoff
  'publish':     { dot: '#22C55E', label: 'Published' }, // not in handoff
}

/** Content type → row emoji. Decorative; the row's accessible name is its title. */
const TYPE_EMOJI: Record<string, string> = {
  Post:   '📝',
  Video:  '🎬',
  Reel:   '🎞️',
  Design: '🎨',
  Email:  '✉️',
  Story:  '📖',
  Deck:   '📊',
  Other:  '📌',
}

export function typeEmoji(contentType?: string | null): string {
  if (!contentType) return '📌'
  return TYPE_EMOJI[contentType] ?? '📌'
}

/**
 * Status label from a due date, per §6.
 *
 * negative → "Nd late" · zero → "Today" · positive → "in Nd".
 * Computed at render time so the label stays correct across midnight without
 * a refetch (§9.1). Never render both a late colour and a future label.
 */
export function dueStatus(dueISO: string, now: Date = new Date()): {
  label: string
  overdue: boolean
} {
  const due = new Date(dueISO + 'T00:00:00')
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)

  if (days < 0)  return { label: `${Math.abs(days)}d late`, overdue: true  }
  if (days === 0) return { label: 'Today',                  overdue: false }
  return { label: `in ${days}d`, overdue: false }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The Sunday on or before `d`, at midnight — the start of its week.
 *
 * The working week here runs Sunday to Thursday, so weeks are anchored on
 * Sunday rather than Monday. "This week" and "last week" are real weeks with
 * a boundary the team shares, not rolling seven-day windows that mean
 * something different depending on which day you open the dashboard.
 *
 * The window a week covers is the full Sunday-to-Saturday span. Friday and
 * Saturday are not worked, but a due date can still land on one, and a task
 * that falls between two weeks is a task nobody sees.
 */
export function weekStart(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - x.getDay())   // getDay(): 0 = Sunday
  return x
}

/** "Aug 16 – 22" · "Aug 30 – Sep 5" — a week's span, for a panel subtitle. */
export function weekSpan(start: Date): string {
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const tail = start.getMonth() === end.getMonth()
    ? `${end.getDate()}`
    : `${MONTHS[end.getMonth()]} ${end.getDate()}`
  return `${MONTHS[start.getMonth()]} ${start.getDate()} – ${tail}`
}

/** "Jul 11" — task row meta date. */
export function shortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}`
}

/** "Jul 11, 2025" — breach table due date, format MMM DD, YYYY (§7). */
export function longDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, '0')}, ${d.getFullYear()}`
}

/** "MMMM D, YYYY" — the header date pill (§4). */
export function pillDate(d: Date): string {
  const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December']
  return `${full[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

/** Time-derived greeting word: <12 morning, 12–17 afternoon, else evening (§4). */
export function greetingWord(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

/** "3 days" — humanised breach overrun (§7). */
export function humanDays(n: number): string {
  return n === 1 ? '1 day' : `${n} days`
}
