/**
 * Server-side Shows in helpers (spec 021). Server-only: reads the database.
 * The rules themselves are the pure ones in src/lib/spaces.ts; this only
 * loads what they need and writes the rows they decide.
 */
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { HandoffDefaults, StageId, TaskKind, TaskSpaceVia } from '@/types/index'
import { creatorSpaces, handoffDefaults, membersBySpace, needsHandoff, spacesForAssignee, type MembersBySpace, type SpaceLike } from '@/lib/spaces'

type Db = Prisma.TransactionClient | typeof prisma

export interface SpaceContext { spaces: (SpaceLike & { key: string })[]; members: MembersBySpace }

export async function loadSpaceContext(db: Db = prisma): Promise<SpaceContext> {
  const [spaces, rows] = await Promise.all([
    db.teamSpace.findMany({ where: { archived_at: null } }),
    db.teamSpaceMember.findMany({ select: { space_id: true, member_id: true } }),
  ])
  return { spaces, members: membersBySpace(rows) }
}

/**
 * The hand-off defaults when moving `task` to `target` needs the box
 * (FR-030), or null when it doesn't.
 */
export async function handoffFor(
  task: { id: string; status: string; nine_stage: boolean; kind?: string | null; content_type_label?: string | null },
  target: StageId,
  ctx?: SpaceContext,
): Promise<HandoffDefaults | null> {
  if (task.kind === 'simple') return null
  const c = ctx ?? await loadSpaceContext()
  const shown = (await prisma.taskSpace.findMany({ where: { task_id: task.id }, select: { space_id: true } })).map(r => r.space_id)
  if (!needsHandoff(task, target, shown, c.spaces)) return null
  return handoffDefaults(task, c.spaces, c.members)
}

/** Add Shows in rows (never removes any). */
export async function addSpaces(db: Db, taskId: string, spaceIds: string[], via: TaskSpaceVia, by: string | null) {
  if (!spaceIds.length) return
  await db.taskSpace.createMany({
    data: [...new Set(spaceIds)].map(space_id => ({ task_id: taskId, space_id, added_via: via, added_by: by })),
    skipDuplicates: true,
  })
}

/** FR-029: the Spaces a new assignee brings, added as 'assignee'. */
export async function addAssigneeSpaces(db: Db, task: { id: string; kind?: string | null }, assigneeId: string | null | undefined, by: string, ctx?: SpaceContext) {
  if (!assigneeId) return
  const c = ctx ?? await loadSpaceContext(db)
  await addSpaces(db, task.id, spacesForAssignee(task, assigneeId, c.spaces, c.members), 'assignee', by)
}

/**
 * FR-028: the Spaces a newly created task starts in — the Space it was created
 * from, or else the creator's own Spaces for that kind of task.
 */
export function spacesOnCreate(memberId: string, kind: TaskKind, spaceId: string | null | undefined, ctx: SpaceContext): string[] {
  if (spaceId && ctx.spaces.some(s => s.id === spaceId)) return [spaceId]
  return creatorSpaces(memberId, kind, ctx.spaces, ctx.members)
}
