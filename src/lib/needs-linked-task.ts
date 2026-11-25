import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

/**
 * Owner's decision, 25 Nov 2026: a task handed to Design or Video is not copied. The task itself joins
 * the Design or Video board (a "shows in" row for that board's Space) and stays in Content, with all its
 * history, files and comments. The person who takes it on the board is added as one of its assignees.
 *
 * Diagnostics lists the content tasks in the design stages that are on no Design or Video board.
 */
export const DESIGN_STAGES = ['r-design', 'd-prog', 'd-check']

export interface NeedsLink { id: string; name: string; status: string; brand: string | null; type: string | null; board: 'design' | 'video' }

async function boardSpaces(db: Db) {
  return db.teamSpace.findMany({ where: { media_board: { not: null }, archived_at: null }, select: { id: true, media_board: true } })
}

export async function needsLinkedTask(db: PrismaClient): Promise<NeedsLink[]> {
  const spaces = await boardSpaces(db)
  const [tasks, types] = await Promise.all([
    db.task.findMany({
      // A content task: not itself on a media board, not a clip of a video, live, on no board, with no linked task.
      where: {
        status: { in: DESIGN_STAGES }, dropped_at: null, media_board: null, clip: null,
        media_tasks: { none: { dropped_at: null } },
        spaces: { none: { space_id: { in: spaces.map(s => s.id) } } },
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, status: true, content_type_label: true, brand: { select: { name: true } } },
    }),
    db.contentType.findMany({ select: { label: true, media_boards: true } }),
  ])
  const boards = new Map(types.map(t => [t.label, t.media_boards]))
  return tasks.map(t => ({
    id: t.id, name: t.name, status: t.status, brand: t.brand?.name ?? null, type: t.content_type_label,
    board: (boards.get(t.content_type_label ?? '') ?? []).includes('video') ? 'video' as const : 'design' as const,
  }))
}

/** Add a person to a task's assignees, after the ones it has; with no lead yet, they become the lead. */
export async function addAssignee(db: Db, taskId: string, memberId: string): Promise<boolean> {
  const t = await db.task.findUnique({ where: { id: taskId }, select: { assignee_id: true } })
  if (!t) return false
  if (!t.assignee_id) {
    await db.task.update({ where: { id: taskId }, data: { assignee_id: memberId } })
    await db.taskAssignee.createMany({ data: [{ task_id: taskId, member_id: memberId, position: 0 }], skipDuplicates: true })
    return true
  }
  if (t.assignee_id === memberId) return false
  const rows = await db.taskAssignee.findMany({ where: { task_id: taskId }, select: { member_id: true, position: true } })
  if (rows.some(r => r.member_id === memberId)) return false
  const data: { task_id: string; member_id: string; position: number }[] = []
  if (!rows.some(r => r.member_id === t.assignee_id)) data.push({ task_id: taskId, member_id: t.assignee_id, position: 0 })
  data.push({ task_id: taskId, member_id: memberId, position: Math.max(0, ...rows.map(r => r.position)) + 1 })
  await db.taskAssignee.createMany({ data, skipDuplicates: true })
  return true
}

/**
 * Owner's decision, 25 Nov 2026 (after go-live): the in-flight design work goes on the Design and Video
 * boards. Each content task in the design stages that is on no board joins its board's Space, as it is.
 * Nothing is created or copied, no stage or date changes, no notifications. Safe to run twice.
 */
export async function linkInFlight(db: PrismaClient): Promise<{ made: number; design: number; video: number }> {
  const rows = await needsLinkedTask(db)
  const spaces = await boardSpaces(db)
  let design = 0, video = 0
  for (const r of rows) {
    const space = spaces.find(x => x.media_board === r.board)
    if (!space) continue
    await db.taskSpace.createMany({ data: [{ task_id: r.id, space_id: space.id, added_via: 'handoff' }], skipDuplicates: true })
    await db.task.update({ where: { id: r.id }, data: { auto_linked_at: new Date() } })
    if (r.board === 'video') video++; else design++
  }
  return { made: design + video, design, video }
}

/**
 * Owner's decision, 25 Nov 2026: the copies are folded back into their tasks. For every linked Design
 * or Video task (one made at a hand-off, or by the step of the morning of 25 Nov), everything on it —
 * comments, files, followers, subtasks, tags, field values, its people, notifications — moves to its
 * content task; the content task joins that board's Space; then the copy is deleted. The content
 * task keeps its own stage, dates, name and brief. Safe to run twice.
 */
export async function mergeLinkedMedia(db: PrismaClient): Promise<{ merged: number; moved: Record<string, number> }> {
  const copies = await db.task.findMany({
    where: { media_board: { not: null }, content_task_id: { not: null } },
    select: { id: true, content_task_id: true, assignee_id: true, dropped_at: true },
  })
  const moved: Record<string, number> = {}
  const count = (k: string, n: number) => { if (n) moved[k] = (moved[k] ?? 0) + n }
  for (const m of copies) {
    const c = m.content_task_id!
    await db.$transaction(async tx => {
      const run = (sql: string) => tx.$executeRawUnsafe(sql, m.id, c)
      // History: moves as is.
      count('comments', await run(`UPDATE task_comments SET task_id = $2::uuid WHERE task_id = $1::uuid`))
      await run(`UPDATE task_comments SET task_refs = array_replace(task_refs, $1::uuid, $2::uuid) WHERE $1::uuid = ANY(task_refs)`)
      count('files', await run(`UPDATE task_attachments SET task_id = $2::uuid WHERE task_id = $1::uuid`))
      count('notifications', await run(`UPDATE notifications SET task_id = $2::uuid WHERE task_id = $1::uuid`))
      count('subtasks', await run(`UPDATE tasks SET parent_task_id = $2::uuid WHERE parent_task_id = $1::uuid`))
      await run(`UPDATE brand_assets SET task_id = $2::uuid WHERE task_id = $1::uuid`)
      await run(`UPDATE repeat_rules SET source_task_id = $2::uuid WHERE source_task_id = $1::uuid`)
      // Keyed per task: move what the content task doesn't have already.
      count('followers', await run(`UPDATE task_followers f SET task_id = $2::uuid WHERE task_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM task_followers x WHERE x.task_id = $2::uuid AND x.member_id = f.member_id)`))
      count('tags', await run(`UPDATE task_tags f SET task_id = $2::uuid WHERE task_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM task_tags x WHERE x.task_id = $2::uuid AND x.tag_id = f.tag_id)`))
      count('field values', await run(`UPDATE task_field_values f SET task_id = $2::uuid WHERE task_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM task_field_values x WHERE x.task_id = $2::uuid AND x.field_id = f.field_id)`))
      await run(`UPDATE task_snoozes f SET task_id = $2::uuid WHERE task_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM task_snoozes x WHERE x.task_id = $2::uuid AND x.member_id = f.member_id)`)
      await run(`UPDATE sheet_values f SET task_id = $2::uuid WHERE task_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM sheet_values x WHERE x.task_id = $2::uuid AND x.column_id = f.column_id)`)
      await run(`UPDATE project_steps SET task_id = $2::uuid WHERE task_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM project_steps x WHERE x.task_id = $2::uuid)`)
      if (!m.dropped_at) {
        // The board: the content task joins the copy's Spaces (the Design or Video board), with its stage names there.
        count('board rows', await run(`INSERT INTO task_spaces (task_id, space_id, added_via, added_by, added_at) SELECT $2::uuid, space_id, added_via, added_by, added_at FROM task_spaces WHERE task_id = $1::uuid ON CONFLICT DO NOTHING`))
        await run(`UPDATE task_space_stages f SET task_id = $2::uuid WHERE task_id = $1::uuid AND NOT EXISTS (SELECT 1 FROM task_space_stages x WHERE x.task_id = $2::uuid AND x.space_id = f.space_id)`)
      }
      // Its people join the content task's assignees.
      const people = [m.assignee_id, ...(await tx.taskAssignee.findMany({ where: { task_id: m.id }, orderBy: { position: 'asc' }, select: { member_id: true } })).map(r => r.member_id)]
      for (const p of [...new Set(people.filter((x): x is string => !!x))]) if (await addAssignee(tx, c, p)) count('assignees', 1)
      await tx.task.delete({ where: { id: m.id } })
    })
  }
  return { merged: copies.length, moved }
}
