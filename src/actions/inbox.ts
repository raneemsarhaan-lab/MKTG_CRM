'use server'

/**
 * The Board Inbox's own records (spec 006 contracts/server.md): put-off tasks
 * and the member's two Inbox preferences. Mentions moved to the notification
 * bell (spec 012 R12), so their read state and the in-place reply went too.
 *
 * Every action acts for the signed-in member only and never takes a member id
 * (§III): one member's read state or snoozes are nobody else's to change.
 * Moves, the Send back note and Set date reuse setTaskStage, addComment and
 * updateTask unchanged.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'

type Result = { success: true } | { success: false; error: string }

const MAX_IDS = 500
/** A put-off task comes back by the next local midnight; never more than this (R6). */
const MAX_SNOOZE_MS = 36 * 60 * 60 * 1000

/** Put a task off until `until` (the member's next local midnight), at most 36 h ahead (FR-027). */
export async function snoozeTask(taskId: string, until: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const at = new Date(until)
  const now = Date.now()
  if (Number.isNaN(at.getTime()) || at.getTime() <= now) return { success: false, error: 'bad_time' }
  const capped = new Date(Math.min(at.getTime(), now + MAX_SNOOZE_MS))
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true } })
  if (!task) return { success: false, error: 'not_found' }
  await prisma.taskSnooze.upsert({
    where: { member_id_task_id: { member_id: member.id, task_id: taskId } },
    create: { member_id: member.id, task_id: taskId, until: capped },
    update: { until: capped },
  })
  revalidatePath('/board')
  return { success: true }
}

/** Bring put-off tasks back (FR-027). */
export async function unsnoozeTasks(taskIds: string[]): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const ids = [...new Set(taskIds)].slice(0, MAX_IDS)
  if (ids.length) await prisma.taskSnooze.deleteMany({ where: { member_id: member.id, task_id: { in: ids } } })
  revalidatePath('/board')
  return { success: true }
}

/** The pin and "Show your week" (FR-002, FR-060): per member, on every device. */
export async function setInboxPrefs(prefs: { pinned?: boolean; showWeek?: boolean }): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const data: { inbox_pinned?: boolean; show_week?: boolean } = {}
  if (typeof prefs.pinned === 'boolean') data.inbox_pinned = prefs.pinned
  if (typeof prefs.showWeek === 'boolean') data.show_week = prefs.showWeek
  if (Object.keys(data).length) await prisma.member.update({ where: { id: member.id }, data })
  return { success: true }
}
