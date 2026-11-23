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
import { allowedStages } from '@/lib/stage-moves'
import { notify, notifyAfter } from '@/lib/notify/notify'

type Db = PrismaClient | Prisma.TransactionClient
const ORDER: StageId[] = ['todo', 'c-prog', 'c-final', 'c-check', 'r-design', 'd-prog', 'd-check', 'final-check', 'ready-publish', 'scheduled', 'publish']
const STAGE_AT = (s: string) => ORDER.indexOf(s as StageId)

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
  // While linked, the row's Status follows its linked tasks (user, 2026-11-23): the earliest
  // stage among those that haven't passed D-Check, else F-Check. This replaces R10's "not
  // pulled forward before Ready For Design". Being linked counts as its link (R5, once).
  await prisma.task.updateMany({ where: { id: content.id, auto_linked_at: null }, data: { auto_linked_at: new Date() } })
  const waiting = contentStageFrom(media)
  let stage = content.status as StageId
  if (waiting && waiting !== stage) stage = waiting
  else if (!waiting && STAGE_AT(stage) < STAGE_AT('final-check')) stage = 'final-check'
  if (stage !== content.status) {
    await prisma.task.update({ where: { id: content.id }, data: { status: stage, stage_date: new Date(), updated_at: new Date() } })
    await notifyAfter(tx => notify(tx, { kind: 'task_moved_to_stage', actorId, taskId: content.id }))
  }
  // Past D-Check, a linked media task shows its content task's stage.
  const following = media.filter(m => passedDCheck(m) && m.status !== stage && !['r-design', 'd-prog', 'd-check'].includes(stage))
  if (following.length) {
    await prisma.task.updateMany({ where: { id: { in: following.map(m => m.id) } }, data: { status: stage, stage_date: new Date(), updated_at: new Date() } })
  }
  await dropStaleSubStages([content.id, ...media.map(m => m.id)])
}

/**
 * A move of a content task that is waiting on its media (user, 2026-11-23):
 * changing its Status moves its linked tasks that haven't passed D-Check, with
 * their own stage permissions; the content task then follows them. Null when
 * the content task isn't waiting (the normal move applies).
 *   - before Ready For Design: refused ('follows_media'; unlink to set it by hand);
 *   - past F-Check: refused ('waiting_on_media');
 *   - a linked task the member may not move: refused ('not_authorized', with its board).
 */
export async function moveThroughMedia(
  content: { id: string; media_board: string | null },
  target: StageId,
  member: Parameters<typeof allowedStages>[1] & { id: string },
): Promise<{ success: true; moved: number } | { success: false; error: string; board?: string } | null> {
  if (content.media_board) return null
  const linked = await prisma.task.findMany({ where: { content_task_id: content.id, dropped_at: null, media_board: { not: null } } })
  const open = linked.filter(m => !passedDCheck(m))
  if (!open.length) return null
  if (STAGE_AT(target) < STAGE_AT('r-design')) return { success: false, error: 'follows_media' }
  if (STAGE_AT(target) > STAGE_AT('final-check')) return { success: false, error: 'waiting_on_media' }
  const toMove = open.filter(m => m.status !== target)
  for (const m of toMove) {
    if (!allowedStages(m as never, member).includes(target)) return { success: false, error: 'not_authorized', board: m.media_board ?? undefined }
  }
  for (const m of toMove) {
    await prisma.task.update({ where: { id: m.id }, data: { status: target, stage_date: new Date(), updated_at: new Date() } })
    await notifyAfter(tx => notify(tx, { kind: 'task_moved_to_stage', actorId: member.id, taskId: m.id }))
  }
  await syncContent(content.id, member.id)
  return { success: true, moved: toMove.length }
}

/**
 * Spec 022 (US4, R7): a sub-stage is remembered only while the task stays in
 * that stage. Once it leaves, the row goes, so coming back starts at the first step.
 */
export async function dropStaleSubStages(taskIds: string[], db: Db = prisma) {
  if (!taskIds.length) return
  await db.$executeRaw`delete from task_space_stages s using tasks t where s.task_id = t.id and t.id = any(${taskIds}::uuid[]) and s.stage_id <> t.status`
}

/** After any move of `task`: keep its content task (or itself, if it is one) in step. */
export async function afterMove(task: { id: string; media_board: string | null; content_task_id: string | null }, actorId: string) {
  if (task.media_board && task.content_task_id) await syncContent(task.content_task_id, actorId)
  else if (!task.media_board) await syncContent(task.id, actorId)
  await dropStaleSubStages([task.id])
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
