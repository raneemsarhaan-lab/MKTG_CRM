/**
 * Content sheet rows on the server (sheet 2b). `syncContentSheet` runs before
 * the board data loads and keeps the sheet whole:
 *   - a project flagged as a theme elsewhere (Paste plan) gets its sheet entry;
 *   - a task in a theme's project (not a media task, not a video's clip) with
 *     no row gets a linked row at the end of its group — this is also how the
 *     pieces of before 2b became linked rows, in their old order;
 *   - a linked row whose task moved to another theme's project, or another
 *     pillar, follows it.
 * It writes only when something is out of step.
 */
import { prisma } from '@/lib/prisma'

type Db = typeof prisma

const datePart = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

export async function syncContentSheet(db: Db = prisma): Promise<void> {
  const [themes, flagged] = await Promise.all([
    db.contentSheetTheme.findMany({ select: { project_id: true, position: true } }),
    db.project.findMany({ where: { is_theme: true }, select: { id: true, sort_order: true, created_at: true }, orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }] }),
  ])
  const has = new Set(themes.map(t => t.project_id))
  let top = themes.reduce((m, t) => Math.max(m, t.position), 0)
  const add = flagged.filter(p => !has.has(p.id))
  if (add.length) {
    await db.contentSheetTheme.createMany({ data: add.map(p => ({ project_id: p.id, position: ++top })), skipDuplicates: true })
    for (const p of add) has.add(p.id)
  }
  const ids = [...has]
  if (!ids.length) return

  const [tasks, rows] = await Promise.all([
    db.task.findMany({
      where: { project_id: { in: ids }, media_board: null },
      select: {
        id: true, name: true, project_id: true, pillar_id: true, parent_task_id: true, publish_date: true, due_date: true, created_at: true,
        parent: { select: { content_type_label: true, parent_task_id: true } },
      },
    }),
    db.contentRow.findMany({ select: { id: true, task_id: true, project_id: true, pillar_id: true, parent_id: true, position: true } }),
  ])
  // A video's clips are not rows: they open under their video.
  const pieces = tasks.filter(t => !(t.parent && t.parent.content_type_label === 'Video' && !t.parent.parent_task_id))
  const byTask = new Map(rows.filter(r => r.task_id).map(r => [r.task_id!, r]))
  const maxPos = new Map<string, number>()
  for (const r of rows) maxPos.set(r.project_id, Math.max(maxPos.get(r.project_id) ?? 0, r.position))

  const pillarsOf = new Map<string, Set<string>>()
  for (const p of await db.contentPillar.findMany({ where: { project_id: { in: ids } }, select: { id: true, project_id: true } })) {
    if (!pillarsOf.has(p.project_id)) pillarsOf.set(p.project_id, new Set())
    pillarsOf.get(p.project_id)!.add(p.id)
  }
  const okPillar = (project: string, pillar: string | null) => (pillar && pillarsOf.get(project)?.has(pillar) ? pillar : null)

  // New linked rows, in the order the sheet used to show pieces: publishing date, then due date, then created.
  const missing = pieces.filter(t => !byTask.has(t.id)).sort((a, b) => {
    const da = datePart(a.publish_date) ?? datePart(a.due_date) ?? '9999', dbb = datePart(b.publish_date) ?? datePart(b.due_date) ?? '9999'
    return da !== dbb ? (da < dbb ? -1 : 1) : a.created_at.getTime() - b.created_at.getTime()
  })
  if (missing.length) {
    await db.contentRow.createMany({
      data: missing.map(t => {
        const pos = (maxPos.get(t.project_id!) ?? 0) + 1
        maxPos.set(t.project_id!, pos)
        return { project_id: t.project_id!, pillar_id: okPillar(t.project_id!, t.pillar_id), position: pos, title: t.name, task_id: t.id }
      }),
      skipDuplicates: true,
    })
  }

  // Linked rows follow their task to another theme or pillar.
  for (const t of pieces) {
    const r = byTask.get(t.id)
    if (!r) continue
    const pillar = okPillar(t.project_id!, t.pillar_id)
    if (r.project_id !== t.project_id) {
      const pos = (maxPos.get(t.project_id!) ?? 0) + 1
      maxPos.set(t.project_id!, pos)
      await db.contentRow.update({ where: { id: r.id }, data: { project_id: t.project_id!, pillar_id: pillar, parent_id: null, position: pos } })
      await db.contentRow.updateMany({ where: { parent_id: r.id }, data: { project_id: t.project_id!, pillar_id: pillar } })
    } else if ((r.pillar_id ?? null) !== pillar) {
      await db.contentRow.update({ where: { id: r.id }, data: { pillar_id: pillar, ...(r.parent_id ? { parent_id: null } : {}) } })
      await db.contentRow.updateMany({ where: { parent_id: r.id }, data: { pillar_id: pillar } })
    }
  }
}
