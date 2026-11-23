'use server'

/**
 * Space stages (spec 022 US4, contracts/server-actions.md, R7).
 *
 *   - saveSpaceStages: admins and superusers rename, split, reorder and remove
 *     a Space's stages. Never changes any task's original stage.
 *   - moveSubStage: anyone with access to the Space moves a task between the
 *     Space stages of its current original stage. Writes only that Space's row.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember, requireTaskCreator } from '@/lib/authz'
import { cleanStages, validateStages, type StageInput, type StageProblem } from '@/lib/space-stages'

type Fail = { success: false; error: string }

function revalidate(key?: string) {
  revalidatePath('/', 'layout')
  revalidatePath('/sheets')
  if (key) revalidatePath(`/spaces/${key}`)
}

export async function saveSpaceStages(spaceId: string, stages: StageInput[]): Promise<{ success: true } | Fail | { success: false; error: 'invalid'; problems: StageProblem[] }> {
  const auth = await requireTaskCreator()
  if (auth.error) return { success: false, error: auth.error }
  const space = await prisma.teamSpace.findUnique({ where: { id: spaceId }, select: { id: true, key: true, archived_at: true } })
  if (!space || space.archived_at) return { success: false, error: 'not_found' }
  const problems = validateStages(stages)
  if (problems.length) return { success: false, error: 'invalid', problems }
  const rows = cleanStages(stages)
  await prisma.$transaction(async tx => {
    const before = await tx.spaceStage.findMany({ where: { space_id: spaceId }, select: { id: true, stage_id: true } })
    // A kept row keeps its id (and the tasks remembered in it) only while it maps the same stage.
    const keep = new Set(rows.filter(r => r.id && before.some(b => b.id === r.id && b.stage_id === r.stage_id)).map(r => r.id as string))
    await tx.spaceStage.deleteMany({ where: { space_id: spaceId, id: { notIn: [...keep] } } })
    const now = new Date()
    for (const r of rows) {
      const data = { name: r.name, position: r.position, aliases: r.aliases, updated_at: now }
      if (r.id && keep.has(r.id)) await tx.spaceStage.update({ where: { id: r.id }, data })
      else await tx.spaceStage.create({ data: { space_id: spaceId, stage_id: r.stage_id, ...data } })
    }
  })
  revalidate(space.key)
  return { success: true }
}

/**
 * A move between the Space stages of the task's current original stage.
 * `spaceStageId` may be `orig:<stage>` for an original stage the Space hasn't named.
 */
export async function moveSubStage(taskId: string, spaceId: string, spaceStageId: string): Promise<{ success: true } | Fail> {
  const me = await getSessionMember()
  if (!me) return { success: false, error: 'not_authenticated' }
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, status: true, dropped_at: true, assignee_id: true, task_owner_id: true } })
  if (!task || task.dropped_at) return { success: false, error: 'not_found' }
  const space = await prisma.teamSpace.findUnique({ where: { id: spaceId }, select: { id: true, key: true, archived_at: true } })
  if (!space || space.archived_at) return { success: false, error: 'not_found' }
  if (me.access === 'user') {
    const inSpace = await prisma.teamSpaceMember.findFirst({ where: { space_id: spaceId, member_id: me.id }, select: { member_id: true } })
    if (!inSpace && task.assignee_id !== me.id && task.task_owner_id !== me.id) return { success: false, error: 'not_authorized' }
  }
  const rows = await prisma.spaceStage.findMany({ where: { space_id: spaceId, stage_id: task.status }, orderBy: { position: 'asc' }, select: { id: true } })
  let target: string | null
  if (spaceStageId.startsWith('orig:')) {
    if (spaceStageId.slice(5) !== task.status) return { success: false, error: 'other_stage' }
    target = rows[0]?.id ?? null
  } else {
    const row = await prisma.spaceStage.findUnique({ where: { id: spaceStageId }, select: { id: true, space_id: true, stage_id: true } })
    if (!row || row.space_id !== spaceId) return { success: false, error: 'not_found' }
    if (row.stage_id !== task.status) return { success: false, error: 'other_stage' }
    target = row.id
  }
  // The first Space stage is where a task is by default, so it needs no row.
  if (!target || target === rows[0]?.id) {
    await prisma.taskSpaceStage.deleteMany({ where: { task_id: taskId, space_id: spaceId } })
  } else {
    await prisma.taskSpaceStage.upsert({
      where: { task_id_space_id: { task_id: taskId, space_id: spaceId } },
      create: { task_id: taskId, space_id: spaceId, space_stage_id: target, stage_id: task.status },
      update: { space_stage_id: target, stage_id: task.status, updated_at: new Date() },
    })
  }
  revalidate(space.key)
  return { success: true }
}
