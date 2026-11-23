'use server'

/**
 * Shows in (spec 021 US1/US6, contracts/server-actions.md): adding a task to a
 * team Space by hand, removing it, and the hand-off. A Space only lists a
 * task; removing it changes nothing else (FR-032).
 */
import { MEDIA_BOARDS, spaceForBoard } from '@/lib/media'
import { createLinkedMedia } from '@/lib/media-server'
import { defaultAssigneeFor, type SpaceLike } from '@/lib/spaces'
import type { MediaBoard } from '@/types/index'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { canActOn } from '@/lib/task-access'
import { allowedStages, holdsStage } from '@/lib/stage-moves'
import { NINE_STAGE, EIGHT_STAGE } from '@/lib/stage-meta'
import { isProduction } from '@/lib/spaces'
import { addAssigneeSpaces, addSpaces, loadSpaceContext } from '@/lib/spaces-server'
import { notify, follow, notifyAfter } from '@/lib/notify/notify'
import type { MoveTaskResult, StageId } from '@/types/index'

type Result = { success: true } | { success: false; error: string }

function revalidateTaskViews() {
  revalidatePath('/', 'layout')
}

export async function addTaskSpace(taskId: string, spaceId: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { task_owner_id: true, assignee_id: true } })
  if (!task) return { success: false, error: 'not_found' }
  if (!canActOn(task, member)) return { success: false, error: 'not_authorized' }
  const space = await prisma.teamSpace.findUnique({ where: { id: spaceId }, select: { archived_at: true } })
  if (!space || space.archived_at) return { success: false, error: 'not_found' }
  await prisma.taskSpace.upsert({
    where: { task_id_space_id: { task_id: taskId, space_id: spaceId } },
    update: {},
    create: { task_id: taskId, space_id: spaceId, added_via: 'manual', added_by: member.id },
  })
  revalidateTaskViews()
  return { success: true }
}

export async function removeTaskSpace(taskId: string, spaceId: string): Promise<Result> {
  const member = await getSessionMember()
  if (!member) return { success: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { task_owner_id: true, assignee_id: true } })
  if (!task) return { success: false, error: 'not_found' }
  if (!canActOn(task, member)) return { success: false, error: 'not_authorized' }
  await prisma.taskSpace.deleteMany({ where: { task_id: taskId, space_id: spaceId } })
  revalidateTaskViews()
  return { success: true }
}

/**
 * The hand-off (spec 022 R5, contracts/server-actions.md): a content task's
 * first move into Ready For Design links it to media, once. One linked media
 * task per chosen board, each with its person (skipped → that board Space's
 * default assignee). The content task moves to Ready For Design and waits for
 * its media tasks (R2); its own assignee doesn't change.
 */
export async function handOff(
  taskId: string,
  input: { target: StageId; links: { spaceId: string; assigneeId: string | null }[] },
): Promise<MoveTaskResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, shouldCelebrate: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, shouldCelebrate: false, error: 'not_found' }
  if (task.dropped_at || task.media_board) return { success: false, shouldCelebrate: false, error: 'invalid' }

  const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  const fromIdx = path.indexOf(task.status as StageId)
  const toIdx = path.indexOf(input.target)
  if (toIdx === -1) return { success: false, shouldCelebrate: false, error: 'stage_not_in_pipeline' }
  if (!allowedStages(task, member).includes(input.target)) return { success: false, shouldCelebrate: false, error: 'not_authorized' }

  const ctx = await loadSpaceContext()
  const links = (input.links ?? []).filter((l, i, all) => all.findIndex(x => x.spaceId === l.spaceId) === i)
  const boardOf = (spaceId: string) => MEDIA_BOARDS.find(b => spaceForBoard(b, ctx.spaces as (SpaceLike & { key: string; media_board?: string | null })[])?.id === spaceId)
  if (!links.length || links.some(l => !boardOf(l.spaceId))) return { success: false, shouldCelebrate: false, error: 'invalid' }
  // A person, when given, must be in that board's Space; none → its default assignee.
  const holders = await prisma.member.findMany({ select: { id: true, name: true, role: true } })
  const resolved: { board: MediaBoard; spaceId: string; assigneeId: string | null }[] = []
  for (const l of links) {
    if (l.assigneeId && !(ctx.members[l.spaceId] ?? []).includes(l.assigneeId)) return { success: false, shouldCelebrate: false, error: 'invalid' }
    const space = ctx.spaces.find(s => s.id === l.spaceId) as (SpaceLike & { default_assignee_role?: string | null }) | undefined
    resolved.push({ board: boardOf(l.spaceId)!, spaceId: l.spaceId, assigneeId: l.assigneeId ?? defaultAssigneeFor(space, holders, ctx.members[l.spaceId] ?? []) })
  }

  // Celebrate as setTaskStage would: progress, by whoever held the stage being left.
  const shouldCelebrate = holdsStage(task, member) && toIdx > fromIdx
  const created = await prisma.$transaction(async tx => {
    await tx.task.update({
      where: { id: taskId },
      data: { status: 'r-design', stage_date: new Date(), updated_at: new Date(), auto_linked_at: new Date() },
    })
    return createLinkedMedia(tx, task, resolved, { id: member.id, role: member.role })
  })
  await notifyAfter(async tx => {
    const out: string[] = []
    for (const c of created) {
      const who = resolved.find(r => r.board === c.board)?.assigneeId
      if (who) {
        await follow(tx, c.taskId, who, { clearMute: true })
        out.push(...await notify(tx, { kind: 'assigned', actorId: member.id, taskId: c.taskId, assigneeId: who }))
      }
    }
    out.push(...await notify(tx, { kind: 'task_moved_to_stage', actorId: member.id, taskId }))
    return out
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidateTaskViews()
  return { success: true, shouldCelebrate }
}
