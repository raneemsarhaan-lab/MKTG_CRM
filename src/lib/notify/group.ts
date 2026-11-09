/**
 * Grouping (spec 012 FR-020–FR-022, R5). Pure.
 *
 * Comments, replies and attachments on the same task combine into one unread
 * notification while new events arrive within 2 hours of the group's first.
 * Reading it ends the group. Mentions, assignments and due reminders never
 * group; a paste groups its new tasks into one notification per stage holder.
 */
import type { NotifyEvent } from './recipients'

export const GROUP_WINDOW_MS = 2 * 60 * 60 * 1000
export const MAX_ACTORS = 10

export function groupKey(event: NotifyEvent, parentCommentId?: string): string | null {
  switch (event.kind) {
    case 'comment': return `comment:${event.taskId}`
    case 'attachment': return `attachment:${event.taskId}`
    case 'reply': return `reply:${event.taskId}:${parentCommentId ?? ''}`
    case 'task_created_in_stage': return event.pasteId ? `created:${event.pasteId}` : null
    default: return null
  }
}

export interface OpenGroup { actor_ids: string[]; count: number; first_event_at: Date; read_at: Date | null }

/** Whether a new event joins this open group. */
export function joins(open: OpenGroup | null, now: Date): open is OpenGroup {
  return !!open && !open.read_at && now.getTime() - open.first_event_at.getTime() <= GROUP_WINDOW_MS
}

/** The group after one more event: the actor moved to the front, the count added. */
export function merged(open: OpenGroup, actorId: string | null, add: number): { actor_ids: string[]; count: number } {
  const actors = actorId ? [actorId, ...open.actor_ids.filter(a => a !== actorId)] : open.actor_ids
  return { actor_ids: actors.slice(0, MAX_ACTORS), count: open.count + add }
}
