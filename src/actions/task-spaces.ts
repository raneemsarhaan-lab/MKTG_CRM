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
