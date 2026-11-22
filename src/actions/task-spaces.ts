'use server'

/**
 * Shows in (spec 021 US1/US6, contracts/server-actions.md): adding a task to a
 * team Space by hand, removing it, and the hand-off. A Space only lists a
 * task; removing it changes nothing else (FR-032).
 */
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
 * The hand-off (spec 021 US6, contracts/handoff.md): move a task into the
 * design half while adding the production Spaces it should show in and the
 * person who picks it up. One transaction; the move keeps every rule a move
 * has (allowedStages, Published is terminal, the celebration).
 */
export async function handOff(
  taskId: string,
  input: { target: StageId; spaceIds: string[]; assigneeId: string },
): Promise<MoveTaskResult> {
  const member = await getSessionMember()
  if (!member) return { success: false, shouldCelebrate: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId } })
  if (!task) return { success: false, shouldCelebrate: false, error: 'not_found' }
  if (task.kind === 'simple' || task.dropped_at) return { success: false, shouldCelebrate: false, error: 'invalid' }

  const path = task.nine_stage ? NINE_STAGE : EIGHT_STAGE
  const fromIdx = path.indexOf(task.status as StageId)
  const toIdx = path.indexOf(input.target)
  if (toIdx === -1) return { success: false, shouldCelebrate: false, error: 'stage_not_in_pipeline' }
  if (!allowedStages(task, member).includes(input.target)) return { success: false, shouldCelebrate: false, error: 'not_authorized' }

  const ctx = await loadSpaceContext()
  const ids = [...new Set(input.spaceIds)]
  const prod = ctx.spaces.filter(isProduction)
  if (!ids.length || !ids.every(id => prod.some(s => s.id === id))) return { success: false, shouldCelebrate: false, error: 'invalid' }
  if (!ids.some(id => (ctx.members[id] ?? []).includes(input.assigneeId))) return { success: false, shouldCelebrate: false, error: 'invalid' }

  // Celebrate as setTaskStage would: progress, by whoever held the stage being left.
  const shouldCelebrate = holdsStage(task, member) && toIdx > fromIdx
  const newAssignee = input.assigneeId !== task.assignee_id ? input.assigneeId : null

  await prisma.$transaction(async tx => {
    await addSpaces(tx, taskId, ids, 'handoff', member.id)
    await addAssigneeSpaces(tx, task, input.assigneeId, member.id, ctx)
    await tx.task.update({
      where: { id: taskId },
      data: { status: input.target, stage_date: new Date(), updated_at: new Date(), assignee_id: input.assigneeId },
    })
  })
  await notifyAfter(async tx => {
    const out: string[] = []
    if (newAssignee) {
      await follow(tx, taskId, newAssignee, { clearMute: true })
      out.push(...await notify(tx, { kind: 'assigned', actorId: member.id, taskId, assigneeId: newAssignee }))
    }
    out.push(...await notify(tx, { kind: 'task_moved_to_stage', actorId: member.id, taskId }))
    return out
  })

  revalidatePath('/board')
  revalidatePath('/overview')
  revalidateTaskViews()
  return { success: true, shouldCelebrate }
}
