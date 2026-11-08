'use server'

/**
 * The Board Inbox's own records (spec 006 contracts/server.md): mention read
 * state, put-off tasks and the member's two Inbox preferences.
 *
 * Every action acts for the signed-in member only and never takes a member id
 * (§III): one member's read state or snoozes are nobody else's to change.
 * Moves, the Send back note and Set date reuse setTaskStage, addComment and
 * updateTask unchanged.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createComment } from '@/lib/comments'
import { getSessionMember } from '@/lib/authz'

type Result = { success: true } | { success: false; error: string }

const MAX_IDS = 500
/** A put-off task comes back by the next local midnight; never more than this (R6). */
const MAX_SNOOZE_MS = 36 * 60 * 60 * 1000
const MAX_REPLY = 4000

/** Mark mentions of the member read (FR-031). Ids that are not their mentions are ignored. */
export async function markMentionsRead(commentIds: string[]): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const ids = [...new Set(commentIds)].slice(0, MAX_IDS)
  if (!ids.length) return { success: true }
  const mine = await prisma.taskComment.findMany({
    where: { id: { in: ids }, mentions: { has: member.id } },
    select: { id: true },
  })
  if (mine.length) {
    await prisma.mentionRead.createMany({
      data: mine.map(c => ({ member_id: member.id, comment_id: c.id })),
      skipDuplicates: true,
    })
  }
  revalidatePath('/board')
  return { success: true }
}

/**
 * Reply to a mention in place (FR-032): a comment on the same task naming the
 * author, and the mention marked read, together.
 */
export async function replyToMention(commentId: string, body: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const text = body.trim()
  if (!text) return { success: false, error: 'empty' }
  if (text.length > MAX_REPLY) return { success: false, error: 'too_long' }

  const original = await prisma.taskComment.findUnique({
    where: { id: commentId },
    select: { id: true, task_id: true, author_id: true, mentions: true, author: { select: { name: true } } },
  })
  if (!original || !original.mentions.includes(member.id)) return { success: false, error: 'not_found' }

  // Name the author at the start, as the composer would, unless already named.
  const first = original.author.name.split(' ')[0]
  const named = text.toLowerCase().includes(`@${first.toLowerCase()}`) ? text : `@${first} ${text}`

  // Spec 012: a reply under the mentioning comment, with its notifications.
  const res = await createComment(member, { taskId: original.task_id, body: named, mentions: [original.author_id], taskRefs: [], parentId: original.id })
  if (!res.ok) return { success: false, error: res.error }
  await prisma.$transaction([
    prisma.mentionRead.upsert({
      where: { member_id_comment_id: { member_id: member.id, comment_id: original.id } },
      create: { member_id: member.id, comment_id: original.id },
      update: {},
    }),
  ])
  revalidatePath('/board')
  revalidatePath('/overview')
  return { success: true }
}

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
