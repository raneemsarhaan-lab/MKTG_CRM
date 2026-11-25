/**
 * Server-side Shows in helpers (spec 021). Server-only: reads the database.
 * The rules themselves are the pure ones in src/lib/spaces.ts; this only
 * loads what they need and writes the rows they decide.
 */
import { MEDIA_BOARDS, boardsFor, spaceForBoard } from '@/lib/media'
import type { MediaBoard } from '@/types/index'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import type { HandoffDefaults, StageId, TaskKind, TaskSpaceVia } from '@/types/index'
import { creatorSpaces, defaultAssigneeFor, membersBySpace, needsHandoff, spacesForAssignee, spacesToDropOnAssigneeChange, type MembersBySpace, type SpaceLike } from '@/lib/spaces'

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
  task: { id: string; status: string; nine_stage: boolean; kind?: string | null; content_type_label?: string | null; media_board?: string | null; auto_linked_at?: Date | string | null },
  target: StageId,
  ctx?: SpaceContext,
): Promise<HandoffDefaults | null> {
  if (!needsHandoff(task, target, [], [])) return null
  const c = ctx ?? await loadSpaceContext()
  // Spec 022 (R5, R6): the boards the content type needs, each with its Space's default assignee.
  const [types, roleHolders] = await Promise.all([
    prisma.contentType.findMany({ select: { label: true, media_boards: true } }),
    prisma.member.findMany({ select: { id: true, name: true, role: true } }),
  ])
  // Boards the task is already on, or linked to by hand (Link task), aren't offered again; all covered → no box.
  const onBoards = (await prisma.taskSpace.findMany({ where: { task_id: task.id, space: { media_board: { not: null }, archived_at: null } }, select: { space: { select: { media_board: true } } } })).map(r => r.space.media_board)
  const have = [...onBoards, ...(await prisma.task.findMany({ where: { content_task_id: task.id, dropped_at: null }, select: { media_board: true } })).map(r => r.media_board)]
  const need = boardsFor(task.content_type_label, types).filter(b => !have.includes(b))
  if (!need.length) return null
  const offered = MEDIA_BOARDS.map(board => ({ board, space: spaceForBoard(board, c.spaces as (SpaceLike & { key: string; media_board?: string | null; default_assignee_role?: string | null })[]) }))
    .filter((x): x is { board: MediaBoard; space: SpaceLike & { key: string; media_board?: string | null; default_assignee_role?: string | null } } => !!x.space)
  if (!offered.length) return null
  return {
    spaceIds: offered.filter(x => need.includes(x.board)).map(x => x.space.id),
    candidates: Object.fromEntries(offered.map(x => [x.space.id, c.members[x.space.id] ?? []])),
    boards: offered.map(x => ({ board: x.board, spaceId: x.space.id, suggested: defaultAssigneeFor(x.space, roleHolders, c.members[x.space.id] ?? []) })),
  }
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
export async function addAssigneeSpaces(db: Db, task: { id: string; kind?: string | null; media_board?: string | null }, assigneeId: string | null | undefined, by: string, ctx?: SpaceContext) {
  if (!assigneeId) return
  const c = ctx ?? await loadSpaceContext(db)
  await addSpaces(db, task.id, spacesForAssignee(task, assigneeId, c.spaces, c.members), 'assignee', by)
}

/** Spec 022 (US5): a new assignee — the old assignee's Spaces go (by the rule), the new one's come. */
export async function changeAssigneeSpaces(db: Db, task: { id: string; kind?: string | null; media_board?: string | null }, oldId: string | null | undefined, newId: string | null | undefined, by: string, ctx?: SpaceContext) {
  if (oldId === newId) return
  const c = ctx ?? await loadSpaceContext(db)
  const oldSpaces = oldId ? spacesForAssignee(task, oldId, c.spaces, c.members) : []
  const newSpaces = newId ? spacesForAssignee(task, newId, c.spaces, c.members) : []
  const rows = await db.taskSpace.findMany({ where: { task_id: task.id }, select: { space_id: true, added_via: true } })
  const drop = spacesToDropOnAssigneeChange(rows, oldSpaces, newSpaces)
  if (drop.length) await db.taskSpace.deleteMany({ where: { task_id: task.id, space_id: { in: drop }, added_via: 'assignee' } })
  if (newId) await addSpaces(db, task.id, newSpaces, 'assignee', by)
}

/**
 * FR-028: the Spaces a newly created task starts in — the Space it was created
 * from, or else the creator's own Spaces for that kind of task.
 */
export function spacesOnCreate(memberId: string, kind: TaskKind, spaceId: string | null | undefined, ctx: SpaceContext): string[] {
  if (spaceId && ctx.spaces.some(s => s.id === spaceId)) return [spaceId]
  return creatorSpaces(memberId, kind, ctx.spaces, ctx.members)
}

