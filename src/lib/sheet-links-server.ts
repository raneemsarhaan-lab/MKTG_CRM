/**
 * Spec 016's server-side reads, shared by the sheet loader and the link
 * actions: linked tasks' values for the mapped fields (R6), the team columns a
 * sheet may map, and resolving Task cells (R3). Not a server action file.
 */
import { prisma } from '@/lib/prisma'
import type { LinkedTask, SheetTaskMap, TaskField } from '@/types/index'
import { TASK_FIELDS } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { fieldApplies, matchCells, normTitle, type MatchResult } from '@/lib/sheet-links'

type Who = { id: string; access: string }
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '')
export const mayActOn = (t: { task_owner_id: string; assignee_id: string | null }, m: Who) =>
  t.task_owner_id === m.id || t.assignee_id === m.id || m.access === 'admin' || m.access === 'superuser'

/** The team's own Content and Video columns a sheet can map (spec 010), by id. */
export async function teamColumns(): Promise<{ id: string; name: string; sheet: string }[]> {
  const cols = await prisma.sheetColumn.findMany({ where: { deleted_at: null, kind: { not: null } }, select: { id: true, name: true, key: true, sheet: true }, orderBy: [{ sheet: 'asc' }, { position: 'asc' }] })
  return cols.map(c => ({ id: c.id, name: c.name ?? c.key, sheet: c.sheet }))
}

/** A stage's name, for snapshots and matching. */
export const stageName = (id: string, lang: 'en' | 'ar' = 'en') => {
  const m = STAGE_META[id as keyof typeof STAGE_META]
  return m ? (lang === 'ar' ? m.label_ar : m.label_en) : id
}

/** Linked tasks as a sheet sees them: the shown text of every mapped field (R6). */
export async function linkedTasks(taskIds: string[], map: SheetTaskMap | null, me: Who): Promise<Record<string, LinkedTask>> {
  const ids = [...new Set(taskIds)]
  if (!ids.length) return {}
  const fields = new Set<TaskField>(map ? Object.values(map.fields) : [])
  const [tasks, members] = await Promise.all([
    prisma.task.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, name: true, status: true, due_date: true, assignee_id: true, task_owner_id: true, priority: true, platform: true,
        content_type_label: true, parent_task_id: true, dropped_at: true, post_url: true, published_url: true,
        project: { select: { name: true, is_theme: true } }, pillar: { select: { name: true } },
        parent: { select: { content_type_label: true, parent_task_id: true } },
        attachments: fields.has('link:doc') || fields.has('link:design') ? { where: { link_role: { in: ['working_doc', 'design'] } }, select: { link_role: true, url: true } } : false,
        sheet_values: [...fields].some(f => f.startsWith('col:')) ? { where: { column_id: { in: [...fields].filter(f => f.startsWith('col:')).map(f => f.slice(4)) } }, select: { column_id: true, value: true } } : false,
      },
    }),
    fields.has('assignee') || fields.has('owner') ? prisma.member.findMany({ select: { id: true, name: true } }) : Promise.resolve([] as { id: string; name: string }[]),
  ])
  const name = new Map(members.map(m => [m.id, m.name]))
  const out: Record<string, LinkedTask> = {}
  for (const t of tasks) {
    const video = t.content_type_label === 'Video' && !t.parent_task_id
    const clip = !!t.parent && t.parent.content_type_label === 'Video' && !t.parent.parent_task_id
    const kind = { piece: !!t.project?.is_theme && !clip && !video, video, clip }
    const values: LinkedTask['values'] = {}
    const atts = (t as { attachments?: { link_role: string | null; url: string | null }[] }).attachments ?? []
    const svals = (t as { sheet_values?: { column_id: string; value: string }[] }).sheet_values ?? []
    for (const f of fields) {
      if (!fieldApplies(kind, f)) continue
      switch (f) {
        case 'title': values.title = t.name; break
        case 'stage': values.stage = t.status; break
        case 'due': values.due = day(t.due_date); break
        case 'assignee': values.assignee = t.assignee_id ? name.get(t.assignee_id) ?? '' : ''; break
        case 'owner': values.owner = name.get(t.task_owner_id) ?? ''; break
        case 'priority': values.priority = t.priority; break
        case 'platform': values.platform = t.platform ?? ''; break
        case 'type': values.type = t.content_type_label ?? ''; break
        case 'theme': values.theme = t.project?.name ?? ''; break
        case 'pillar': values.pillar = t.pillar?.name ?? ''; break
        case 'link:doc': values['link:doc'] = atts.find(a => a.link_role === 'working_doc')?.url ?? ''; break
        case 'link:design': values['link:design'] = atts.find(a => a.link_role === 'design')?.url ?? ''; break
        case 'link:post': values['link:post'] = t.post_url ?? ''; break
        case 'link:published': values['link:published'] = t.published_url ?? ''; break
        default: values[f] = svals.find(v => v.column_id === f.slice(4))?.value ?? ''
      }
    }
    out[t.id] = {
      id: t.id, name: t.name, values, stage: t.status, dropped: !!t.dropped_at,
      editable: mayActOn(t, me),
      applies: [...TASK_FIELDS, ...[...fields].filter(f => f.startsWith('col:'))].filter(f => fieldApplies(kind, f as TaskField)) as TaskField[],
    }
  }
  return out
}

/** The text a snapshot cell keeps for a field (R7): a stage's English name, others as shown. */
export const snapshotOf = (field: TaskField, value: string) => (field === 'stage' ? stageName(value) : value)

/** Resolve Task cells to tasks in two queries (R3, R12). */
export async function resolveCells(cells: { rowId: string; text: string }[]): Promise<MatchResult & { names: Record<string, string> }> {
  const idLike = cells.map(c => c.text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase()).filter((x): x is string => !!x)
  const titles = [...new Set(cells.map(c => normTitle(c.text)).filter(Boolean))]
  const [byIdRows, byTitleRows] = await Promise.all([
    idLike.length ? prisma.task.findMany({ where: { id: { in: idLike } }, select: { id: true, name: true } }) : Promise.resolve([]),
    titles.length ? prisma.$queryRaw<{ id: string; name: string }[]>`
      SELECT id, name FROM tasks WHERE lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) = ANY(${titles}::text[])` : Promise.resolve([]),
  ])
  const byTitle = new Map<string, string[]>()
  for (const r of byTitleRows) { const k = normTitle(r.name); byTitle.set(k, [...(byTitle.get(k) ?? []), r.id]) }
  const names: Record<string, string> = {}
  for (const r of [...byIdRows, ...byTitleRows]) names[r.id] = r.name
  return { ...matchCells(cells, new Set(byIdRows.map(r => r.id)), byTitle), names }
}
