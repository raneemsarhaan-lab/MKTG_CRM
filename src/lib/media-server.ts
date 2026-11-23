/**
 * Media tasks on the server (spec 022, research R1–R5): the move gate every
 * server move path checks, the sync that keeps a content task's stage in step
 * with its linked media tasks, and creating linked media tasks.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { MediaBoard, StageId } from '@/types/index'
import { contentStageFrom, linkedTo, mediaBlock, passedDCheck } from '@/lib/media'
import { addSpaces } from '@/lib/spaces-server'
import { notify, notifyAfter } from '@/lib/notify/notify'

type Db = PrismaClient | Prisma.TransactionClient

/** Why the media rules refuse moving `task` to `target`, or null. */
export async function mediaGate(
  task: { id: string; status: string; media_board: string | null; content_task_id: string | null },
  target: StageId,
  db: Db = prisma,
): Promise<'waiting_on_media' | 'follows_content' | null> {
  const linked = task.media_board ? [] : await db.task.findMany({ where: { content_task_id: task.id, dropped_at: null }, select: { status: true } })
  return mediaBlock(task, target, linked)
}

/**
 * Keeps a content task in step with its linked media tasks (R2, R3):
 *   - while some haven't passed D-Check, its stage is the earliest of theirs;
 *   - when the last one passes, it moves to F-Check (notifying that stage's holders);
 *   - media tasks past D-Check follow its stage.
 */
export async function syncContent(contentTaskId: string, actorId: string): Promise<void> {
  const content = await prisma.task.findUnique({ where: { id: contentTaskId }, select: { id: true, status: true, stage_date: true, media_board: true, dropped_at: true } })
  if (!content || content.media_board || content.dropped_at) return
  const media = linkedTo(content.id, await prisma.task.findMany({
    where: { content_task_id: content.id }, select: { id: true, status: true, stage_date: true, media_board: true, content_task_id: true, dropped_at: true },
  }))
  if (!media.length) return
  // Linked before Ready For Design (R10): the content task isn't pulled forward, and the
  // media tasks' SLA starts when it gets there.
  const BEFORE = ['todo', 'c-prog', 'c-final', 'c-check']
  if (BEFORE.includes(content.status)) return
  // Reached Ready For Design with its media already linked by hand: that was its link (R5, once).
  await prisma.task.updateMany({ where: { id: content.id, auto_linked_at: null }, data: { auto_linked_at: new Date() } })
  if (content.status === 'r-design') {
    const early = media.filter(m => m.status === 'r-design' && m.stage_date < content.stage_date)
    if (early.length) await prisma.task.updateMany({ where: { id: { in: early.map(m => m.id) } }, data: { stage_date: content.stage_date } })
  }
  const waiting = contentStageFrom(media)
  let stage = content.status as StageId
  if (waiting && waiting !== stage) stage = waiting
  else if (!waiting && ['r-design', 'd-prog', 'd-check'].includes(stage)) stage = 'final-check'
  if (stage !== content.status) {
    await prisma.task.update({ where: { id: content.id }, data: { status: stage, stage_date: new Date(), updated_at: new Date() } })
    await notifyAfter(tx => notify(tx, { kind: 'task_moved_to_stage', actorId, taskId: content.id }))
  }
  // Past D-Check, a linked media task shows its content task's stage.
  const following = media.filter(m => passedDCheck(m) && m.status !== stage && !['r-design', 'd-prog', 'd-check'].includes(stage))
  if (following.length) {
    await prisma.task.updateMany({ where: { id: { in: following.map(m => m.id) } }, data: { status: stage, stage_date: new Date(), updated_at: new Date() } })
  }
}

/** After any move of `task`: keep its content task (or itself, if it is one) in step. */
export async function afterMove(task: { id: string; media_board: string | null; content_task_id: string | null }, actorId: string) {
  if (task.media_board && task.content_task_id) await syncContent(task.content_task_id, actorId)
  else if (!task.media_board) await syncContent(task.id, actorId)
}

/**
 * Creates linked media tasks for a content task, one per board, at Ready For
 * Design (R5, R10). Their SLA clock is today when the content task is at Ready
 * For Design or later; otherwise it starts when the content task gets there.
 */
export async function createLinkedMedia(
  db: Db,
  content: {
    id: string; name: string; status: string; brand_id: string | null; content_type_label: string | null; platform: string | null
    task_owner_id: string; nine_stage: boolean; priority: string; publish_date: Date | null; due_date: Date | null; due_manual: boolean
  },
  links: { board: MediaBoard; spaceId: string; assigneeId: string | null }[],
  by: { id: string; role: string },
): Promise<{ board: MediaBoard; taskId: string }[]> {
  const out: { board: MediaBoard; taskId: string }[] = []
  for (const l of links) {
    const exists = await db.task.findFirst({ where: { content_task_id: content.id, media_board: l.board }, select: { id: true } })
    if (exists) continue
    const t = await db.task.create({
      data: {
        name: content.name, brand_id: content.brand_id, content_type_label: content.content_type_label, platform: content.platform,
        task_owner_id: content.task_owner_id, assignee_id: l.assigneeId ?? null, initiator_role: by.role, created_by: by.id,
        nine_stage: content.nine_stage, priority: content.priority, status: 'r-design', stage_date: new Date(),
        publish_date: content.publish_date, due_date: content.due_date, due_manual: content.due_manual,
        media_board: l.board, content_task_id: content.id, entry_stage: 'r-design',
      },
      select: { id: true },
    })
    await addSpaces(db, t.id, [l.spaceId], 'handoff', by.id)
    out.push({ board: l.board, taskId: t.id })
  }
  return out
}
