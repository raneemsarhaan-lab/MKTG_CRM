/**
 * No subtasks (owner, 25 Nov 2026): every existing subtask, and every video's clip ("clips are tasks
 * with another name"), becomes a task of its own. Server-only; run once by the seed.
 *
 * Only the parent link is cleared. The task keeps its id, so its stage, people, dates, priority,
 * fields, files, comments, history, followers and Design/Video links all stay exactly as they are; a
 * clip keeps its clip details (number, file name, in and out). One that showed only through its parent
 * (on no board of its own) is put on its parent's boards. One with no theme takes its parent's theme
 * and pillar, like any task, and its sheet row stops being a child row and sits in that theme.
 *
 * The old parent stays linked: a Task link column on the sheet of the task's Space ("Video" for a clip,
 * "Linked task" otherwise) holds it, so it shows and can be unlinked like any Task link.
 */
import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { spaceSheetId } from '@/lib/sheet-columns'

type Db = PrismaClient | Prisma.TransactionClient

export async function subtasksToTasks(db: Db): Promise<{ converted: number; clips: number; boardsAdded: number; themed: number; rowsFreed: number; linksKept: number }> {
  const children = await db.task.findMany({
    where: { parent_task_id: { not: null } },
    select: {
      id: true, parent_task_id: true, project_id: true, pillar_id: true,
      clip: { select: { task_id: true } },
      parent: { select: { content_type_label: true, parent_task_id: true, project_id: true, pillar_id: true } },
      spaces: { select: { space_id: true, space: { select: { id: true, key: true } } } },
    },
  })
  /** One Task link column per sheet and name, made the first time it's needed. */
  const columns = new Map<string, string>()
  async function linkColumn(sheet: string, name: string): Promise<string> {
    const k = `${sheet}|${name}`
    if (columns.has(k)) return columns.get(k)!
    const found = await db.sheetColumn.findFirst({ where: { sheet, kind: 'task', name, deleted_at: null }, select: { id: true } })
    const id = found?.id ?? (await db.sheetColumn.create({
      data: { sheet, key: `c:${randomUUID()}`, name, kind: 'task', position: ((await db.sheetColumn.aggregate({ where: { sheet }, _max: { position: true } }))._max.position ?? 0) + 1 },
      select: { id: true },
    })).id
    columns.set(k, id)
    return id
  }
  let linksKept = 0
  const isClip = (c: (typeof children)[number]) => !!c.clip || (c.parent?.content_type_label === 'Video' && !c.parent.parent_task_id)
  let converted = 0, clips = 0, boardsAdded = 0, themed = 0, rowsFreed = 0
  for (const c of children) {
    if (isClip(c)) clips++
    if (!c.spaces.length && c.parent_task_id) {
      const shows = await db.taskSpace.findMany({ where: { task_id: c.parent_task_id }, select: { space_id: true } })
      if (shows.length) {
        await db.taskSpace.createMany({ data: shows.map(x => ({ task_id: c.id, space_id: x.space_id, added_via: 'migration' })), skipDuplicates: true })
        boardsAdded++
      }
    }
    // Under a theme (and pillar) like any task: its parent's when it has none of its own, else the theme
    // its sheet row (or its parent's) sits in.
    const sheetRow = c.project_id || c.parent?.project_id ? null
      : await db.contentRow.findFirst({ where: { task_id: { in: [c.id, c.parent_task_id!] }, project_id: { not: null } }, orderBy: { sheet_id: { sort: 'asc', nulls: 'first' } }, select: { project_id: true, pillar_id: true } })
    const project = c.project_id ?? c.parent?.project_id ?? sheetRow?.project_id ?? null
    const pillar = c.project_id ? c.pillar_id : c.parent?.project_id ? c.parent.pillar_id ?? null : sheetRow?.pillar_id ?? null
    if (!c.project_id && project) themed++
    await db.task.update({ where: { id: c.id }, data: { parent_task_id: null, ...(!c.project_id && project ? { project_id: project, pillar_id: pillar } : {}) } })
    // Its sheet rows stop being child rows: they sit in its theme and pillar.
    const rows = await db.contentRow.findMany({ where: { task_id: c.id, parent_id: { not: null } }, select: { id: true, project_id: true } })
    for (const r of rows) {
      await db.contentRow.update({ where: { id: r.id }, data: { parent_id: null, ...(project ? { project_id: project, pillar_id: pillar } : {}) } })
      rowsFreed++
    }
    // The old parent stays linked, through a Task link on the sheet of the task's Space.
    if (c.parent_task_id) {
      const spaces = c.spaces.length ? c.spaces.map(x => x.space) : (await db.taskSpace.findMany({ where: { task_id: c.id }, select: { space: { select: { id: true, key: true } } } })).map(x => x.space)
      const home = (isClip(c) ? spaces.find(x => x.key === 'video') : null) ?? spaces[0]
      if (home) {
        const col = await linkColumn(spaceSheetId(home), isClip(c) ? 'Video' : 'Linked task')
        await db.sheetValue.upsert({ where: { column_id_task_id: { column_id: col, task_id: c.id } }, create: { column_id: col, task_id: c.id, value: c.parent_task_id }, update: {} })
        linksKept++
      }
    }
    converted++
  }
  return { converted, clips, boardsAdded, themed, rowsFreed, linksKept }
}
