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
 * No parent link stays on the task (owner, 26 Nov 2026: "no parent tasks" — theme › pillar › task). The
 * old parent is kept as a record only: the export "subtasks-parents.csv" lists each converted task and the
 * task it used to sit under.
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
  const parents: [string, string][] = []
  void linkColumn; void spaceSheetId
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
    // The old parent is kept as a record (subtasks-parents.csv), not as a link on the task.
    if (c.parent_task_id) { parents.push([c.id, c.parent_task_id]); linksKept++ }
    converted++
  }
  if (parents.length) await saveParentsRecord(db, parents)
  return { converted, clips, boardsAdded, themed, rowsFreed, linksKept }
}

const csv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** The record of each converted task and the task it used to sit under (added to, never replaced). */
async function saveParentsRecord(db: Db, pairs: [string, string][]) {
  const ids = [...new Set(pairs.flat())]
  const names = new Map((await db.task.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map(t => [t.id, t.name]))
  const old = await db.dataExport.findUnique({ where: { name: 'subtasks-parents.csv' } })
  const lines = pairs.map(([t, p]) => [t, names.get(t) ?? '', p, names.get(p) ?? ''].map(csv).join(','))
  const content = old ? `${old.content}\n${lines.join('\n')}` : ['task_id,task,old_parent_id,old_parent', ...lines].join('\n')
  await db.dataExport.upsert({
    where: { name: 'subtasks-parents.csv' },
    create: { name: 'subtasks-parents.csv', title: 'Former subtasks and clips, and the task each sat under (25–26 Nov 2026)', content, rows: pairs.length },
    update: { content, rows: (old?.rows ?? 0) + pairs.length },
  })
}

/**
 * Staging only (owner, 26 Nov 2026: no parent tasks): the "Video" and "Linked task" columns an earlier
 * version of this step added are taken off every sheet. Their values are first added to the record
 * (subtasks-parents.csv); the columns are marked removed, not deleted, so nothing is lost.
 */
export async function hideParentColumns(db: Db): Promise<{ columns: number; values: number }> {
  const cols = await db.sheetColumn.findMany({ where: { kind: 'task', name: { in: ['Video', 'Linked task'] }, deleted_at: null, key: { startsWith: 'c:' }, created_at: { gte: new Date('2026-11-25T00:00:00Z') } }, select: { id: true } })
  if (!cols.length) return { columns: 0, values: 0 }
  const vals = await db.sheetValue.findMany({ where: { column_id: { in: cols.map(c => c.id) } }, select: { task_id: true, value: true } })
  const pairs = vals.filter(v => v.value).map(v => [v.task_id, v.value] as [string, string])
  if (pairs.length) await saveParentsRecord(db, pairs)
  await db.sheetColumn.updateMany({ where: { id: { in: cols.map(c => c.id) } }, data: { deleted_at: new Date() } })
  return { columns: cols.length, values: pairs.length }
}
