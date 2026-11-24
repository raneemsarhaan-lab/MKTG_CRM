/**
 * Spec 024: Space settings on the server — what a new task made in a Space
 * starts with, and which Space's rules apply to an existing task. Server-only:
 * reads the database; the rules are the pure ones in src/lib/space-settings.ts.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { StageId } from '@/types/index'
import { homeSpace, mayCreateIn, resolveSettings, stageAt, typeAllowed, type SpaceSettings } from '@/lib/space-settings'

type Db = Prisma.TransactionClient | typeof prisma

export interface SpaceWithSettings { id: string; key: string; name: string; media_board: string | null; archived_at: Date | null; default_assignee_role: string | null; settings: SpaceSettings }

export async function loadSpacesWithSettings(db: Db = prisma): Promise<SpaceWithSettings[]> {
  const rows = await db.teamSpace.findMany({ where: { archived_at: null } })
  return rows.map(r => ({ id: r.id, key: r.key, name: r.name, media_board: r.media_board ?? null, archived_at: r.archived_at, default_assignee_role: r.default_assignee_role ?? null, settings: resolveSettings(r.key, r.settings) }))
}

/** The Video Space (the one that is the Video board), with its settings. */
export async function videoSpace(db: Db = prisma): Promise<SpaceWithSettings | undefined> {
  const all = await loadSpacesWithSettings(db)
  return all.find(s => s.media_board === 'video') ?? all.find(s => s.key === 'video')
}

export interface CreationPlan {
  status: StageId
  /** Where SLA and the board start for this task (To Do unless the Space starts later). */
  entry_stage: StageId
  media_board: 'design' | 'video' | null
  default_type: string | null
  default_priority: string | null
}

/** Where a new task made in this Space starts, and what it takes from the Space (spec 024 §2–§3). */
export function creationPlan(space: Pick<SpaceWithSettings, 'media_board' | 'settings'> | null | undefined): CreationPlan {
  if (!space) return { status: 'todo', entry_stage: 'todo', media_board: null, default_type: null, default_priority: null }
  const s = space.settings
  const board = space.media_board === 'design' || space.media_board === 'video' ? space.media_board : null
  // A media board's work starts no earlier than Ready For Design.
  const start = board && stageAt(s.flow.start) < stageAt('r-design') ? 'r-design' as StageId : s.flow.start
  return {
    status: start,
    entry_stage: start,
    media_board: board,
    default_type: s.default_type,
    default_priority: s.default_priority,
  }
}

/** Why a member can't create this task in the Space, or null. */
export async function creationRefusal(
  space: SpaceWithSettings,
  member: { id: string; access: string },
  type: string | null | undefined,
  db: Db = prisma,
): Promise<'not_allowed_in_space' | 'type_not_allowed' | null> {
  const ids = (await db.teamSpaceMember.findMany({ where: { space_id: space.id }, select: { member_id: true } })).map(r => r.member_id)
  if (!mayCreateIn(space.settings, member, ids)) return 'not_allowed_in_space'
  if (type && !typeAllowed(space.settings, type)) return 'type_not_allowed'
  return null
}

/** The Space whose rules apply to a task: its board's Space, the Space it was made in, else Content. */
export async function homeSpaceOf(taskId: string, db: Db = prisma, spaces?: SpaceWithSettings[]): Promise<SpaceWithSettings | undefined> {
  const [task, made, all] = await Promise.all([
    db.task.findUnique({ where: { id: taskId }, select: { id: true, media_board: true } }),
    db.taskSpace.findFirst({ where: { task_id: taskId, added_via: 'created' }, select: { space_id: true } }),
    spaces ? Promise.resolve(spaces) : loadSpacesWithSettings(db),
  ])
  if (!task) return undefined
  return homeSpace(task, all, made?.space_id)
}

/**
 * Spec 024 (§8), one-time: clips still at To Do move to where the Video Space
 * starts — Ready For Design on the Video board. Clips already past To Do stay.
 */
export async function moveTodoClips(db: Db = prisma): Promise<number> {
  const video = await videoSpace(db)
  const start = creationPlan(video ? { ...video, media_board: 'video' } : null)
  const status = video ? start.status : 'r-design'
  const clips = await db.task.findMany({ where: { status: 'todo', dropped_at: null, clip: { isNot: null } }, select: { id: true } })
  if (!clips.length) return 0
  const ids = clips.map(c => c.id)
  const now = new Date()
  await db.task.updateMany({ where: { id: { in: ids } }, data: { status, entry_stage: status, media_board: 'video', stage_date: now, updated_at: now } })
  if (video) await db.taskSpace.createMany({ data: ids.map(task_id => ({ task_id, space_id: video.id, added_via: 'migration' })), skipDuplicates: true })
  return ids.length
}
