/**
 * No subtasks (owner, 25 Nov 2026): every existing subtask becomes a task of its own. Server-only; run
 * once by the seed.
 *
 * Only the parent link is cleared. The task keeps its id, so its stage, people, dates, priority,
 * fields, files, comments, history, followers and Design/Video links all stay exactly as they are.
 * A subtask that showed only through its parent (it was on no board of its own) is put on its
 * parent's boards, so it stays where it was seen. A video's clips are not subtasks and are untouched.
 */
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export async function subtasksToTasks(db: Db): Promise<{ converted: number; boardsAdded: number; clipsKept: number }> {
  const children = await db.task.findMany({
    where: { parent_task_id: { not: null } },
    select: {
      id: true, parent_task_id: true,
      clip: { select: { task_id: true } },
      parent: { select: { content_type_label: true, parent_task_id: true } },
      spaces: { select: { space_id: true } },
    },
  })
  const isClip = (c: (typeof children)[number]) => !!c.clip || (c.parent?.content_type_label === 'Video' && !c.parent.parent_task_id)
  let converted = 0, boardsAdded = 0, clipsKept = 0
  for (const c of children) {
    if (isClip(c)) { clipsKept++; continue }
    if (!c.spaces.length && c.parent_task_id) {
      const shows = await db.taskSpace.findMany({ where: { task_id: c.parent_task_id }, select: { space_id: true } })
      if (shows.length) {
        await db.taskSpace.createMany({ data: shows.map(x => ({ task_id: c.id, space_id: x.space_id, added_via: 'migration' })), skipDuplicates: true })
        boardsAdded++
      }
    }
    await db.task.update({ where: { id: c.id }, data: { parent_task_id: null } })
    converted++
  }
  return { converted, boardsAdded, clipsKept }
}
