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
import { effective, mergeSettings, type KindSettings } from './settings'
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
 * Spec 015: notifications for sheet comments. They name a cell, not a task
 * (`task_id` null); `meta` carries where the cell is, so the bell, the phone
 * and the email open the sheet there. A reply groups per thread for two
 * hours, like task replies; each mention stands alone. The actor, unknown
 * people and anyone who turned the kind off in the app are left out.
 */
export async function notifySheet(db: Tx, ev: {
  kind: 'sheet_mention' | 'sheet_reply'
  actorId: string
  recipients: string[]
  threadId: string
  meta: NotificationMeta
}): Promise<string[]> {
  const members = await db.member.findMany({ select: { id: true } })
  const known = new Set(members.map(m => m.id))
  const wanted = [...new Set(ev.recipients)].filter(id => known.has(id) && id !== ev.actorId)
  if (!wanted.length) return []
  const settingsOf = await settingsLoader(db, wanted)
  const recipients = wanted.filter(id => effective(settingsOf(id), ev.kind, 'in_app'))
  const now = new Date()
  const key = ev.kind === 'sheet_reply' ? `sheet_reply:${ev.threadId}` : null
  const ids: string[] = []
  for (const recipient of recipients) {
    if (key) {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`notify:${recipient}:${key}`}))`
      const open = await db.notification.findFirst({ where: { recipient_id: recipient, group_key: key, read_at: null }, orderBy: { first_event_at: 'desc' } })
      if (joins(open, now)) {
        const next = merged(open, ev.actorId, 1)
        const row = await db.notification.update({
          where: { id: open.id },
          data: { actor_ids: next.actor_ids, count: next.count, last_event_at: now, updated_at: now, meta: { ...(open.meta as object), ...ev.meta } as unknown as Prisma.InputJsonValue, pushed_at: null },
        })
        ids.push(row.id)
        continue
      }
    }
    const row = await db.notification.create({
      data: {
        recipient_id: recipient, kind: ev.kind, task_id: null, comment_id: null, attachment_id: null, stage_id: null,
        actor_ids: [ev.actorId], count: 1, group_key: key, first_event_at: now, last_event_at: now,
        meta: ev.meta as unknown as Prisma.InputJsonValue,
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
