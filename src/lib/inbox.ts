/**
 * The Board Inbox, worked out from the tasks the board already holds
 * (spec 006 research R1, data-model §3).
 *
 * One function produces the button's number and every list in the panel, so
 * the two cannot disagree (SC-002). Pure: the board, the lab and the Node
 * checks all call it.
 */
import type { AlertStatus, InboxReason, InboxState, Member, SLAConfig, StageId, Task } from '@/types/index'
import { STAGE_META, NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { getAlertStatus } from '@/lib/alert-status'

type InboxComment = {
  id: string; body: string; created_at: string; author_id: string
  mentions?: string[]; author?: { name: string; avatar_url?: string } | Member
}
type InboxAttachment = { id: string; filename: string; uploaded_at?: string; uploaded_by?: string | null }
export type InboxTask = Omit<Task, 'comments' | 'attachments'> & {
  comments?: InboxComment[]
  attachments?: InboxAttachment[]
}
type Who = Pick<Member, 'id' | 'role'>

export interface ReviewRow {
  kind: 'review'
  task: InboxTask
  waitingDays: number
  /** Days until due (negative when late); null when undated. */
  dueDays: number | null
  sla: AlertStatus | null
}
export interface YourRow {
  kind: 'yours'
  task: InboxTask
  reason: InboxReason
  /** Days late for 'late'; 0 otherwise. */
  days: number
}
export interface DoneRow { kind: 'done'; task: InboxTask; at: string }

export interface InboxCounts {
  reviews: number
  /** Your tasks counted (not put off). */
  yours: number
  late: number
  today: number
  undated: number
  /** reviews + yours. */
  todo: number
  /**
   * The button's number: the to-dos only. Mentions and the team's updates
   * moved to the notification bell (spec 012 R12, FR-080).
   */
  total: number
  /** A counted review or task is due today or late (FR-012). */
  urgent: boolean
}

export interface InboxModel {
  reviews: ReviewRow[]
  yours: YourRow[]
  /** Task ids put off until tomorrow that would otherwise be listed. */
  snoozed: string[]
  done: { week: DoneRow[]; total: number }
  counts: InboxCounts
  /** Keys of urgent counted tasks, for the pulse (R9). */
  ringKeys: string[]
}

// ── dates ───────────────────────────────────────────────────────────────────

/** YYYY-MM-DD of a moment in the device's own time zone. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** Whole days from one YYYY-MM-DD to another (negative when `to` is earlier). */
export function dayDiff(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}
/** A stored date or timestamp as the day it falls on here. Dates stay as written. */
function dayOf(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) || /T00:00:00(\.000)?Z$/.test(v) ? v.slice(0, 10) : localDay(new Date(v))
}

/** The start of the next local day: when a put-off task comes back (R6). */
export function nextMidnight(now: Date): Date {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d
}

/** Monday of the week `now` falls in, as YYYY-MM-DD. */
export function mondayOf(now: Date): string {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localDay(d)
}

/** "today", "yesterday" or a number of days ago, for date-only events (FR-041). */
export function dateWords(value: string, now: Date): { word: 'today' | 'yesterday' } | { days: number } {
  const n = Math.max(0, dayDiff(dayOf(value), localDay(now)))
  return n === 0 ? { word: 'today' } : n === 1 ? { word: 'yesterday' } : { days: n }
}

/** Minutes, hours or days ago, for timed events (comments, files). */
export function ageOf(iso: string, now: Date): { unit: 'now' | 'm' | 'h' | 'd'; n: number } {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return { unit: 'now', n: 0 }
  if (mins < 60) return { unit: 'm', n: mins }
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return { unit: 'h', n: hrs }
  return { unit: 'd', n: Math.round(hrs / 24) }
}

// ── rules ───────────────────────────────────────────────────────────────────

const live = (t: InboxTask) => !t.dropped_at && t.status !== 'publish'
/** Whose work it is: the board's "Only me" rule (R3). */
export const isYours = (t: Pick<Task, 'assignee_id' | 'task_owner_id'>, memberId: string) =>
  (t.assignee_id ?? t.task_owner_id) === memberId
/** Owned or assigned: whose published work the Done tab shows (R11). */
const onYourWork = (t: InboxTask, memberId: string) => t.task_owner_id === memberId || t.assignee_id === memberId

/** The stage before the current one on the task's own path, for Send back. */
export function previousOnPath(task: Pick<Task, 'status' | 'nine_stage'>): StageId | null {
  const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  const i = path.indexOf(task.status)
  return i > 0 ? path[i - 1] : null
}

export function inboxModel(input: {
  tasks: InboxTask[]
  member: Who
  state: InboxState
  slaConfig: SLAConfig
  now: Date
}): InboxModel {
  const { tasks, member, state, slaConfig, now } = input
  const today = localDay(now)
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0)
  const snoozedNow = new Set(Object.entries(state.snoozes).filter(([, until]) => new Date(until) > now).map(([id]) => id))
  const dueDays = (t: InboxTask) => (t.due_date ? dayDiff(today, dayOf(t.due_date)) : null)

  // Waiting for your review (R2): a live task in a review stage your role holds.
  const reviews: ReviewRow[] = tasks
    .filter(t => live(t) && STAGE_META[t.status]?.owner_role && STAGE_META[t.status].owner_role === member.role)
    .sort((a, b) => dayOf(a.stage_date).localeCompare(dayOf(b.stage_date)) || a.name.localeCompare(b.name))
    .map(t => {
      const sla = getAlertStatus(t as Task, slaConfig, midnight)
      return {
        kind: 'review' as const, task: t,
        waitingDays: Math.max(0, dayDiff(dayOf(t.stage_date), today)),
        dueDays: dueDays(t),
        sla: sla === 'At Risk' || sla === 'Will Miss' || sla === 'Stuck' ? sla : null,
      }
    })

  // Your tasks (R3): your live work in a working stage, late, today or undated.
  const yoursAll: YourRow[] = []
  for (const t of tasks) {
    if (!live(t) || !isYours(t, member.id) || STAGE_META[t.status]?.owner_role) continue
    const d = dueDays(t)
    if (d === null) yoursAll.push({ kind: 'yours', task: t, reason: 'undated', days: 0 })
    else if (d < 0) yoursAll.push({ kind: 'yours', task: t, reason: 'late', days: -d })
    else if (d === 0) yoursAll.push({ kind: 'yours', task: t, reason: 'today', days: 0 })
  }
  const order: Record<InboxReason, number> = { late: 0, today: 1, undated: 2 }
  yoursAll.sort((a, b) => order[a.reason] - order[b.reason] || b.days - a.days || a.task.name.localeCompare(b.task.name))
  const yours = yoursAll.filter(r => !snoozedNow.has(r.task.id))
  const snoozed = yoursAll.filter(r => snoozedNow.has(r.task.id)).map(r => r.task.id)

  // Done (R11): your published work, this week first.
  const monday = mondayOf(now)
  const published = tasks.filter(t => !t.dropped_at && t.status === 'publish' && onYourWork(t, member.id))
  const week: DoneRow[] = published
    .filter(t => dayOf(t.stage_date) >= monday)
    .sort((a, b) => dayOf(b.stage_date).localeCompare(dayOf(a.stage_date)) || a.name.localeCompare(b.name))
    .map(t => ({ kind: 'done', task: t, at: dayOf(t.stage_date) }))

  const late = yours.filter(r => r.reason === 'late').length + reviews.filter(r => r.dueDays !== null && r.dueDays < 0).length
  const dueToday = yours.filter(r => r.reason === 'today').length + reviews.filter(r => r.dueDays === 0).length
  const counts: InboxCounts = {
    reviews: reviews.length,
    yours: yours.length,
    late,
    today: dueToday,
    undated: yours.filter(r => r.reason === 'undated').length,
    todo: reviews.length + yours.length,
    total: reviews.length + yours.length,
    urgent: late + dueToday > 0,
  }

  const ringKeys = [
    ...reviews.filter(r => r.dueDays !== null && r.dueDays <= 0).map(r => `t:${r.task.id}`),
    ...yours.filter(r => r.reason !== 'undated').map(r => `t:${r.task.id}`),
  ]

  return { reviews, yours, snoozed, done: { week, total: published.length }, counts, ringKeys }
}

export type SummaryPart = { key: 'reviews' | 'late' | 'today' | 'todo'; n: number }

/**
 * The line under "Inbox": the two most pressing kinds, in the order a person
 * should act on them (FR-012b). Empty when nothing is waiting (All clear).
 */
export function inboxSummary(c: InboxCounts): SummaryPart[] {
  const parts: SummaryPart[] = []
  if (c.reviews) parts.push({ key: 'reviews', n: c.reviews })
  if (c.late) parts.push({ key: 'late', n: c.late })
  if (c.today) parts.push({ key: 'today', n: c.today })
  if (!parts.length && c.todo) parts.push({ key: 'todo', n: c.todo })
  return parts.slice(0, 2)
}

/** The tab the panel opens on (FR-016): To do, the only tab with work in it. */
export function openingTab(_c: InboxCounts): 'todo' {
  return 'todo'
}
