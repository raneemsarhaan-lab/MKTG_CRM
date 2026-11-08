/**
 * The one place notifications are made (spec 012 R1). Server-only: it takes a
 * Prisma transaction client, so it runs inside the action that caused the
 * event, and a failed action records nothing.
 *
 *   resolveRecipients → for each: group (under an advisory lock) or insert
 *
 * It returns the ids it touched; the caller hands them to `deliver()` after
 * its transaction commits, which is where phone alerts go out (R8). A push
 * or email failure never fails the action (FR-098).
 *
 * Kept out of the 'use server' action files so it can't be called from the
 * browser.
 */
import type { Prisma } from '@prisma/client'
import { resolveRecipients, type NotifyEvent, type RFollower } from './recipients'
import { groupKey, joins, merged } from './group'
import { mergeSettings, type KindSettings } from './settings'
import type { NotificationMeta } from '@/types/index'

type Tx = Prisma.TransactionClient

export interface NotifyExtra {
  /** Up to 100 characters of the comment or reply. */
  snippet?: string
  /** The reply's top-level comment, for the reply group key. */
  parentCommentId?: string
}

async function settingsLoader(db: Tx, memberIds: string[]): Promise<(id: string) => KindSettings> {
  const rows = memberIds.length
    ? await db.notificationSetting.findMany({ where: { member_id: { in: memberIds } } })
    : []
  const byMember = new Map<string, typeof rows>()
  for (const r of rows) byMember.set(r.member_id, [...(byMember.get(r.member_id) ?? []), r])
  return id => mergeSettings(byMember.get(id) ?? [])
}

/** Record the notifications for one event. Returns the ids created or updated. */
export async function notify(db: Tx, event: NotifyEvent, extra: NotifyExtra = {}): Promise<string[]> {
  const task = await db.task.findUnique({
    where: { id: event.taskId },
    select: { id: true, name: true, status: true, nine_stage: true, task_owner_id: true, assignee_id: true, created_by: true, dropped_at: true },
  })
  if (!task) return []
  // Archived tasks are quiet (spec edge case), except the paste summary which is about new tasks.
  if (task.dropped_at && event.kind !== 'task_created_in_stage') return []

  const members = await db.member.findMany({ select: { id: true, role: true, access: true } })
  const followers: RFollower[] = await db.taskFollower.findMany({ where: { task_id: task.id }, select: { member_id: true, muted: true } })
  const settingsOf = await settingsLoader(db, members.map(m => m.id))
  const recipients = resolveRecipients(event, { task, members, followers, settingsOf })
  if (!recipients.length) return []

  const now = new Date()
  const key = groupKey(event, extra.parentCommentId)
  const meta: NotificationMeta = {
    task_name: task.name,
    ...(extra.snippet ? { snippet: extra.snippet } : {}),
    ...(event.kind === 'task_created_in_stage' && event.pasteCount ? { paste_count: event.pasteCount } : {}),
    ...(event.kind === 'due_soon' || event.kind === 'overdue' ? { due_date: event.dueDate } : {}),
  }
  const commentId = event.kind === 'comment' || event.kind === 'reply' || event.kind === 'mention' ? event.commentId : null
  const attachmentId = event.kind === 'attachment' ? event.attachmentId : null
  const stageId = event.kind === 'task_created_in_stage' || event.kind === 'task_moved_to_stage' || event.kind === 'attachment'
    || event.kind === 'due_soon' || event.kind === 'overdue' ? task.status : null
  const add = event.kind === 'attachment' ? Math.max(1, event.count) : event.kind === 'task_created_in_stage' && event.pasteCount ? event.pasteCount : 1
  const ids: string[] = []

  for (const recipient of recipients) {
    if (key) {
      // One open group per recipient and key: two events at once add up, never split (R5).
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notify:${recipient}:${key}`}))`
      const open = await db.notification.findFirst({
        where: { recipient_id: recipient, group_key: key, read_at: null },
        orderBy: { first_event_at: 'desc' },
      })
      if (joins(open, now)) {
        const next = merged(open, event.actorId, event.kind === 'task_created_in_stage' ? 0 : add)
        const metaNow = { ...(open.meta as object), ...meta, ...(event.kind === 'task_created_in_stage' && event.pasteCount ? { paste_count: event.pasteCount } : {}) }
        const row = await db.notification.update({
          where: { id: open.id },
          data: {
            actor_ids: next.actor_ids, count: next.count, last_event_at: now, updated_at: now, meta: metaNow,
            ...(commentId ? { comment_id: commentId } : {}), ...(attachmentId ? { attachment_id: attachmentId } : {}),
            // A grown group alerts again (the phone replaces the alert by its tag).
            pushed_at: null,
          },
        })
        ids.push(row.id)
        continue
      }
    }
    const row = await db.notification.create({
      data: {
        recipient_id: recipient, kind: event.kind, task_id: task.id, comment_id: commentId, attachment_id: attachmentId,
        stage_id: stageId, actor_ids: event.actorId ? [event.actorId] : [], count: add, group_key: key,
        first_event_at: now, last_event_at: now, meta: meta as unknown as Prisma.InputJsonValue,
      },
    })
    ids.push(row.id)
  }
  return ids
}

/**
 * Follow a task (R3). Automatic follows keep a deliberate unfollow; the
 * member's own new action on the task (`clearMute`) brings them back.
 */
export async function follow(db: Tx, taskId: string, memberId: string, opts: { clearMute?: boolean } = {}): Promise<void> {
  await db.taskFollower.upsert({
    where: { task_id_member_id: { task_id: taskId, member_id: memberId } },
    create: { task_id: taskId, member_id: memberId },
    update: opts.clearMute ? { muted: false } : {},
  })
}

/** Follow or unfollow on purpose (the toggle, or "Turn off notifications for this task"). */
export async function setMuted(db: Tx, taskId: string, memberId: string, muted: boolean): Promise<void> {
  await db.taskFollower.upsert({
    where: { task_id_member_id: { task_id: taskId, member_id: memberId } },
    create: { task_id: taskId, member_id: memberId, muted },
    update: { muted },
  })
}

/** After the action's transaction commits: send phone alerts (R8). Never throws. */
export async function deliver(ids: string[]): Promise<void> {
  if (!ids.length) return
  try {
    const { pushNotifications } = await import('./push')
    await pushNotifications(ids)
  } catch (e) { console.error('[notify] delivery failed', e) }
}

/**
 * Notify after an action's own write has succeeded, in a transaction of its
 * own, then deliver. A failure here is logged and never reaches the person:
 * the move, comment or upload already happened (FR-098).
 */
export async function notifyAfter(work: (tx: Tx) => Promise<string[]>): Promise<void> {
  try {
    const { prisma } = await import('@/lib/prisma')
    const ids = await prisma.$transaction(work, { timeout: 20_000 })
    void deliver(ids)
  } catch (e) {
    console.error('[notify] failed', e)
  }
}
