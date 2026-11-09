/**
 * Who hears about an event (spec 012 FR-001–FR-005, data-model §5). Pure.
 *
 * "Stage holders" is the app's own rule (holdsStage): a review stage is held
 * by everyone with its role, a working stage by the task's assignee and owner.
 * Notifications and move permissions therefore always agree (R2).
 */
import type { NotificationKind } from '@/types/index'
import { holdsStage } from '@/lib/stage-moves'
import { effective, type KindSettings } from './settings'

export interface RTask {
  id: string
  status: string
  nine_stage: boolean
  task_owner_id: string
  assignee_id: string | null
  created_by: string | null
}
export interface RMember { id: string; role: string; access: string }
export interface RFollower { member_id: string; muted: boolean }

export type NotifyEvent =
  | { kind: 'comment'; actorId: string; taskId: string; commentId: string }
  | { kind: 'reply'; actorId: string; taskId: string; commentId: string; parentAuthorId: string; threadAuthorIds: string[] }
  | { kind: 'attachment'; actorId: string; taskId: string; attachmentId: string | null; count: number }
  | { kind: 'task_created_in_stage'; actorId: string; taskId: string; pasteId?: string; pasteCount?: number }
  | { kind: 'task_moved_to_stage'; actorId: string; taskId: string }
  | { kind: 'assigned'; actorId: string; taskId: string; assigneeId: string }
  | { kind: 'mention'; actorId: string; taskId: string; commentId: string | null; mentionedIds: string[] }
  | { kind: 'due_soon' | 'overdue'; actorId: null; taskId: string; dueDate: string }

/** Everyone who holds the task's current stage. */
export function stageHolders(task: RTask, members: RMember[]): string[] {
  return members.filter(m => holdsStage(task, m)).map(m => m.id)
}

/** Kinds that reach people regardless of a mute (FR-032). */
export const IGNORES_MUTE: NotificationKind[] = ['mention', 'assigned']

/**
 * The members to notify, in a stable order: the actor removed, each person
 * once, muted followers dropped (except for mentions and assignments), and
 * anyone with the kind turned off in the app dropped.
 */
export function resolveRecipients(
  event: NotifyEvent,
  ctx: {
    task: RTask
    members: RMember[]
    followers: RFollower[]
    settingsOf(memberId: string): KindSettings
  },
): string[] {
  const { task, members, followers } = ctx
  const followIds = followers.filter(f => !f.muted).map(f => f.member_id)
  const muted = new Set(followers.filter(f => f.muted).map(f => f.member_id))
  const people = (...ids: (string | null | undefined)[]) => ids.filter((x): x is string => !!x)
  let list: string[]
  switch (event.kind) {
    case 'comment':
      list = [...people(task.assignee_id, task.task_owner_id, task.created_by), ...followIds]
      break
    case 'reply':
      list = [event.parentAuthorId, ...event.threadAuthorIds, ...followIds]
      break
    case 'attachment':
      list = [...people(task.assignee_id, task.task_owner_id, task.created_by), ...stageHolders(task, members), ...followIds]
      break
    case 'task_created_in_stage':
    case 'task_moved_to_stage':
      list = stageHolders(task, members)
      break
    case 'assigned':
      list = [event.assigneeId]
      break
    case 'mention':
      list = event.mentionedIds
      break
    case 'due_soon':
    case 'overdue':
      list = [...people(task.assignee_id), ...stageHolders(task, members)]
      break
  }
  const known = new Set(members.map(m => m.id))
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of list) {
    if (seen.has(id) || !known.has(id)) continue
    seen.add(id)
    if (event.actorId && id === event.actorId) continue
    if (muted.has(id) && !IGNORES_MUTE.includes(event.kind)) continue
    if (!effective(ctx.settingsOf(id), event.kind, 'in_app')) continue
    out.push(id)
  }
  return out
}
