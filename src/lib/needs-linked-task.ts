import type { PrismaClient } from '@prisma/client'

/**
 * User, 25 Nov 2026: linked Design and Video tasks are not created automatically for work that was
 * already in flight at the release. A content task in the design stages with no linked task is an
 * error to fix by hand: open it and link or create its Design or Video task (its "Link task" cell
 * or panel). Published work is never listed. From F-Check on no new link is made, so those stages
 * aren't listed either.
 */
export const DESIGN_STAGES = ['r-design', 'd-prog', 'd-check']

export interface NeedsLink { id: string; name: string; status: string; brand: string | null; type: string | null; board: 'design' | 'video' }

export async function needsLinkedTask(db: PrismaClient): Promise<NeedsLink[]> {
  const [tasks, types] = await Promise.all([
    db.task.findMany({
      // A content task: not itself on a media board, not a clip of a video, live.
      where: { status: { in: DESIGN_STAGES }, dropped_at: null, media_board: null, clip: null, media_tasks: { none: { dropped_at: null } } },
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

/**
 * Owner's decision, 25 Nov 2026 (after go-live): every content task in the design stages with no linked
 * task gets its linked Design or Video task, so the work shows on the Design and Video boards. The linked
 * task starts where the content task is: the same stage, stage date, dates, priority, owner and assignee.
 * The content task itself is not changed, except that it is marked as linked and its own "shows in" row
 * for that board's Space is replaced by the linked task's. Published and archived tasks get nothing.
 * No notifications, and no second due reminder for a date people were already reminded of. Safe to run twice: a task that has its linked task is skipped.
 */
export async function linkInFlight(db: PrismaClient): Promise<{ made: number; design: number; video: number }> {
  const rows = await needsLinkedTask(db)
  const spaces = await db.teamSpace.findMany({ where: { media_board: { not: null }, archived_at: null }, select: { id: true, media_board: true } })
  let design = 0, video = 0
  for (const r of rows) {
    const space = spaces.find(x => x.media_board === r.board)
    if (!space) continue
    await db.$transaction(async tx => {
      const t = await tx.task.findUnique({ where: { id: r.id } })
      if (!t || await tx.task.findFirst({ where: { content_task_id: t.id, media_board: r.board }, select: { id: true } })) return
      const m = await tx.task.create({
        data: {
          name: t.name, brand_id: t.brand_id, content_type_label: t.content_type_label, platform: t.platform,
          task_owner_id: t.task_owner_id, assignee_id: t.assignee_id, initiator_role: t.initiator_role, created_by: t.created_by,
          nine_stage: t.nine_stage, priority: t.priority, status: t.status, stage_date: t.stage_date,
          publish_date: t.publish_date, due_date: t.due_date, due_manual: t.due_manual,
          media_board: r.board, content_task_id: t.id, entry_stage: 'r-design',
        },
        select: { id: true },
      })
      await tx.taskSpace.createMany({ data: [{ task_id: m.id, space_id: space.id, added_via: 'handoff' }], skipDuplicates: true })
      const people = [...new Set([t.task_owner_id, t.assignee_id].filter((x): x is string => !!x))]
      if (people.length) await tx.taskFollower.createMany({ data: people.map(member_id => ({ task_id: m.id, member_id })), skipDuplicates: true })
      // The people were already reminded about this due date on the content task: no second reminder.
      if (t.due_date) await tx.dueReminder.createMany({ data: ['due_soon', 'overdue'].map(kind => ({ task_id: m.id, kind, due_date: t.due_date as Date })), skipDuplicates: true })
      await tx.task.update({ where: { id: t.id }, data: { auto_linked_at: t.auto_linked_at ?? new Date() } })
      await tx.taskSpace.deleteMany({ where: { task_id: t.id, space_id: space.id } })
      if (r.board === 'video') video++; else design++
    })
  }
  return { made: design + video, design, video }
}
