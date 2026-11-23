'use server'

/**
 * Content sheet rows, themes and pillars (sheet 2b).
 *
 *   Rows: anyone may add a plain row; a linked row is edited by whoever may
 *   edit its task, and a child row by whoever may edit its parent. One level
 *   of children. Moving a linked row moves its task to the theme's project and
 *   pillar. Deleting a linked row unlinks its task (the task stays in its
 *   Space, out of the theme) or deletes both.
 *   Themes: admins and superusers add them, from an existing project or a new
 *   one, reorder them (the sheet only) and remove them (the sheet only; the
 *   project stays). A removed theme's rows go where the person says.
 *   Pillars: admins, superusers and the theme's owner add, reorder (the sheet
 *   only) and remove them; their rows go where the person says.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { canActOn } from '@/lib/task-access'
import { withAssignees } from '@/lib/assignees-server'
import { addAssigneeSpaces, addSpaces, loadSpaceContext } from '@/lib/spaces-server'
import { follow, notify, notifyAfter } from '@/lib/notify/notify'
import { pasteColumns, writePastedValues } from '@/lib/sheet-values'
import { dayDate, isDay } from '@/lib/due-dates'
import { newTaskDates } from '@/lib/due-dates-server'
import { AUDIENCE_KEYS, norm } from '@/lib/content-plan'
import { mapContentRow } from '@/lib/mappers'
import { between, childrenOf, groupRows, indentTarget, mayNest, positionFor, reorder, type ContentRowRec } from '@/lib/content-rows'
import type { AudienceKey, FrequencyPeriod } from '@/types/index'

type Fail = { success: false; error: string }
type Me = NonNullable<Awaited<ReturnType<typeof getSessionMember>>>
const UUID = /^[0-9a-f-]{36}$/i
const isAdmin = (m: { access: string }) => m.access === 'admin' || m.access === 'superuser'
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const done = () => { revalidatePath('/', 'layout') }

async function me() { return getSessionMember() }
async function allRows(projectId?: string): Promise<ContentRowRec[]> {
  return (await prisma.contentRow.findMany({ where: projectId ? { project_id: projectId } : {} })).map(mapContentRow)
}
async function themeOf(projectId: string) {
  return UUID.test(projectId) ? prisma.contentSheetTheme.findUnique({ where: { project_id: projectId }, include: { project: true } }) : null
}
async function pillarIn(projectId: string, pillarId: string | null | undefined): Promise<string | null | false> {
  if (!pillarId) return null
  const p = UUID.test(pillarId) ? await prisma.contentPillar.findUnique({ where: { id: pillarId } }) : null
  return p && p.project_id === projectId ? p.id : false
}
/** Whether the member may edit a row: anyone for a plain row; the task's people for a linked one. */
async function mayEditRow(row: { task_id: string | null }, m: Me): Promise<boolean> {
  if (!row.task_id) return true
  const t = await prisma.task.findUnique({ where: { id: row.task_id } })
  return !t || canActOn(await withAssignees(t), m)
}
async function mayEditTheme(projectId: string, m: Me) {
  if (isAdmin(m)) return true
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { owner_id: true } })
  return p?.owner_id === m.id
}
/** A linked row's task follows the row to a theme and pillar. */
async function taskFollows(taskIds: string[], projectId: string, pillarId: string | null) {
  if (taskIds.length) await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { project_id: projectId, pillar_id: pillarId, updated_at: new Date() } })
}

// ─── Rows ───────────────────────────────────────────────────────────────────

export async function addRow(input: {
  projectId: string; pillarId?: string | null; parentId?: string | null; title: string
  anchor?: { id: string; where: 'above' | 'below' } | null
}): Promise<{ success: true; row: ContentRowRec } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const title = clean(input.title, 300)
  if (!title) return { success: false, error: 'generic' }
  if (!(await themeOf(input.projectId))) return { success: false, error: 'not_a_theme' }
  const rows = await allRows(input.projectId)
  let pillar = await pillarIn(input.projectId, input.pillarId)
  if (pillar === false) return { success: false, error: 'not_a_theme' }
  let parentId: string | null = null
  if (input.parentId) {
    const parent = rows.find(r => r.id === input.parentId)
    if (!parent || parent.parent_id) return { success: false, error: 'one_level' }
    if (!(await mayEditRow(parent, m))) return { success: false, error: 'not_authorized' }
    parentId = parent.id
    pillar = parent.pillar_id
  }
  const siblings = parentId ? childrenOf(rows, parentId) : groupRows(rows, input.projectId, pillar)
  const row = await prisma.contentRow.create({
    data: { project_id: input.projectId, pillar_id: pillar, parent_id: parentId, title, position: positionFor(siblings, input.anchor), created_by: m.id },
  })
  done()
  return { success: true, row: mapContentRow(row) }
}

/** A plain row's title, date or custom values (a linked row's go through its task). */
export async function updateRow(id: string, patch: { title?: string; date?: string | null; values?: Record<string, string | null> }): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id } }) : null
  if (!row) return { success: false, error: 'not_found' }
  if (row.task_id) return { success: false, error: 'linked' }
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) { const t = clean(patch.title, 300); if (!t) return { success: false, error: 'generic' }; data.title = t }
  if (patch.date !== undefined) {
    if (patch.date && !isDay(patch.date)) return { success: false, error: 'bad_date' }
    data.date = patch.date ? dayDate(patch.date) : null
  }
  if (patch.values) {
    const v = { ...((row.values as Record<string, string>) ?? {}) }
    for (const [k, val] of Object.entries(patch.values).slice(0, 60)) {
      if (!/^[\w:.-]{1,80}$/.test(k)) continue
      if (val == null || val === '') delete v[k]; else v[k] = String(val).slice(0, 5000)
    }
    data.values = v
  }
  await prisma.contentRow.update({ where: { id }, data })
  done()
  return { success: true }
}

/**
 * Move a row: to a theme and pillar (top level, at the end or by an anchor),
 * or under a parent row. Its children go with it; linked tasks follow.
 */
export async function moveRow(id: string, to: {
  projectId: string; pillarId?: string | null; parentId?: string | null; anchor?: { id: string; where: 'above' | 'below' } | null
}): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id } }) : null
  if (!row) return { success: false, error: 'not_found' }
  if (!(await mayEditRow(row, m))) return { success: false, error: 'not_authorized' }
  if (!(await themeOf(to.projectId))) return { success: false, error: 'not_a_theme' }
  const rows = await allRows(to.projectId)
  const me0 = mapContentRow(row)
  let pillar = await pillarIn(to.projectId, to.pillarId)
  if (pillar === false) return { success: false, error: 'not_a_theme' }
  let parentId: string | null = null
  if (to.parentId) {
    const parent = rows.find(r => r.id === to.parentId)
    const kids = await prisma.contentRow.count({ where: { parent_id: id } })
    if (!parent || parent.parent_id || parent.id === id || kids > 0) return { success: false, error: 'one_level' }
    if (!(await mayEditRow(parent, m))) return { success: false, error: 'not_authorized' }
    parentId = parent.id
    pillar = parent.pillar_id
  }
  const siblings = (parentId ? childrenOf(rows, parentId) : groupRows(rows, to.projectId, pillar)).filter(r => r.id !== id)
  const position = positionFor(siblings, to.anchor && to.anchor.id !== id ? to.anchor : null)
  await prisma.contentRow.update({ where: { id }, data: { project_id: to.projectId, pillar_id: pillar, parent_id: parentId, position } })
  const kids = await prisma.contentRow.findMany({ where: { parent_id: id } })
  if (kids.length) await prisma.contentRow.updateMany({ where: { parent_id: id }, data: { project_id: to.projectId, pillar_id: pillar } })
  // A linked row's task (and its linked children's) changes its theme or pillar to match.
  if (me0.project_id !== to.projectId || me0.pillar_id !== pillar) {
    await taskFollows([row.task_id, ...kids.map(k => k.task_id)].filter((x): x is string => !!x), to.projectId, pillar)
  }
  done()
  return { success: true }
}

/** Tab / Shift+Tab: a child of the row above, or back out under its parent's group, just after it. */
export async function indentRow(id: string, dir: 'in' | 'out'): Promise<{ success: true } | Fail> {
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id } }) : null
  if (!row) return { success: false, error: 'not_found' }
  const rows = await allRows(row.project_id)
  const rec = rows.find(r => r.id === id)!
  if (dir === 'in') {
    const target = indentTarget(rows, rec)
    if (!target) return { success: false, error: 'one_level' }
    return moveRow(id, { projectId: row.project_id, parentId: target.id })
  }
  if (!rec.parent_id) return { success: false, error: 'not_a_child' }
  const parent = rows.find(r => r.id === rec.parent_id)
  return moveRow(id, { projectId: row.project_id, pillarId: parent?.pillar_id ?? null, anchor: parent ? { id: parent.id, where: 'below' } : null })
}

/**
 * Delete a row. A linked row's task is unlinked (it stays in its Space, out of
 * the theme) or deleted with it. A parent's children move up a level or are
 * deleted with it (their tasks the same way).
 */
export async function deleteRow(id: string, opts: { task?: 'unlink' | 'delete'; children?: 'up' | 'delete' } = {}): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id } }) : null
  if (!row) return { success: false, error: 'not_found' }
  if (!(await mayEditRow(row, m))) return { success: false, error: 'not_authorized' }
  const kids = await prisma.contentRow.findMany({ where: { parent_id: id }, orderBy: { position: 'asc' } })
  if (kids.length && !opts.children) return { success: false, error: 'needs_children_choice' }
  const linked = [row, ...(opts.children === 'delete' ? kids : [])].filter(r => r.task_id)
  if (linked.length && !opts.task) return { success: false, error: 'needs_task_choice' }
  const taskIds = linked.map(r => r.task_id!)
  if (opts.task === 'delete' && taskIds.length) {
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } })
    for (const t of tasks) if (!canActOn(await withAssignees(t), m)) return { success: false, error: 'not_authorized' }
  }
  await prisma.$transaction(async tx => {
    if (opts.children === 'up' && kids.length) {
      // Up a level, in place of their parent and in their order.
      const rows = (await tx.contentRow.findMany({ where: { project_id: row.project_id } })).map(mapContentRow)
      const sibs = groupRows(rows, row.project_id, row.pillar_id)
      const i = sibs.findIndex(r => r.id === id)
      const lo = sibs[i]?.position ?? 0, hi = sibs[i + 1]?.position ?? null
      for (const [k, kid] of kids.entries()) {
        const pos = hi == null ? lo + k + 1 : lo + ((hi - lo) * (k + 1)) / (kids.length + 1)
        await tx.contentRow.update({ where: { id: kid.id }, data: { parent_id: null, position: pos } })
      }
    } else if (opts.children === 'delete' && kids.length) {
      await tx.contentRow.deleteMany({ where: { parent_id: id } })
    }
    await tx.contentRow.delete({ where: { id } })
    if (taskIds.length) {
      if (opts.task === 'delete') await tx.task.deleteMany({ where: { id: { in: taskIds } } })
      // Unlinked: out of the theme, so the sheet doesn't give it a row again; it stays in its Spaces.
      else await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { project_id: null, pillar_id: null, updated_at: new Date() } })
    }
  })
  done()
  return { success: true }
}

/**
 * Create a task from a plain row: a piece at To Do in the theme. The theme's
 * owner owns it; whoever made it (if not the owner or an admin) is its
 * assignee. Its date, pillar and custom values go with it.
 */
export async function rowToTask(id: string, opts: { type?: string } = {}): Promise<{ success: true; taskId: string } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id }, include: { project: true } }) : null
  if (!row) return { success: false, error: 'not_found' }
  if (row.task_id) return { success: false, error: 'linked' }
  const type = opts.type && await prisma.contentType.findUnique({ where: { label: opts.type } }) ? opts.type : 'Post'
  const owner = row.project.owner_id ?? m.id
  const assignee = owner !== m.id && !isAdmin(m) ? m.id : null
  const day = row.date ? row.date.toISOString().slice(0, 10) : null
  const task = await prisma.task.create({
    data: {
      name: row.title, project_id: row.project_id, pillar_id: row.pillar_id, brand_id: row.project.brand_id, content_type_label: type,
      task_owner_id: owner, assignee_id: assignee, initiator_role: m.role, status: 'todo', stage_date: new Date(),
      hours_estimate: 0, priority: 'Normal', created_by: m.id, ...(await newTaskDates(day, null)),
    },
  })
  await prisma.contentRow.update({ where: { id }, data: { task_id: task.id } })
  // The row's custom values become the task's.
  const vals = (row.values as Record<string, string>) ?? {}
  if (Object.keys(vals).length) {
    const cols = await prisma.sheetColumn.findMany({ where: { sheet: 'content', key: { in: Object.keys(vals) } }, select: { id: true, key: true } })
    const byId = Object.fromEntries(cols.map(c => [c.id, vals[c.key]]))
    const members = await prisma.member.findMany({ select: { id: true, name: true } })
    await prisma.$transaction(async tx => { await writePastedValues(tx, await pasteColumns(tx, 'content', members), task.id, byId, m.id, { onlyEmpty: false }) })
    await prisma.contentRow.update({ where: { id }, data: { values: {} } })
  }
  const ctx = await loadSpaceContext()
  const content = ctx.spaces.find(x => x.key === 'content')?.id
  if (content) await addSpaces(prisma, task.id, [content], 'created', m.id)
  await addAssigneeSpaces(prisma, task, task.assignee_id, m.id, ctx)
  await notifyAfter(async tx => {
    for (const x of new Set([m.id, task.task_owner_id, task.assignee_id].filter((v): v is string => !!v))) await follow(tx, task.id, x)
    const ids = await notify(tx, { kind: 'task_created_in_stage', actorId: m.id, taskId: task.id })
    if (task.assignee_id && task.assignee_id !== m.id) ids.push(...await notify(tx, { kind: 'assigned', actorId: m.id, taskId: task.id, assigneeId: task.assignee_id }))
    return ids
  })
  done()
  return { success: true, taskId: task.id }
}

/** Link a plain row to an existing task: the task joins the row's theme and pillar. */
export async function linkRowTask(id: string, taskId: string): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id } }) : null
  const task = UUID.test(taskId) ? await prisma.task.findUnique({ where: { id: taskId } }) : null
  if (!row || !task) return { success: false, error: 'not_found' }
  if (row.task_id) return { success: false, error: 'linked' }
  if (task.media_board) return { success: false, error: 'media_task' }
  if (!canActOn(await withAssignees(task), m)) return { success: false, error: 'not_authorized' }
  const other = await prisma.contentRow.findUnique({ where: { task_id: taskId } })
  if (other) return { success: false, error: 'already_in_sheet' }
  await prisma.contentRow.update({ where: { id }, data: { task_id: taskId } })
  await taskFollows([taskId], row.project_id, row.pillar_id)
  done()
  return { success: true }
}

// ─── Themes ─────────────────────────────────────────────────────────────────

/** + Theme / Insert theme above or below: an existing project, or a new one. Admins and superusers. */
export async function addSheetTheme(input: {
  projectId?: string
  newProject?: { name: string; owner_id?: string | null; frequency_count?: number | null; frequency_period?: FrequencyPeriod | null; audience?: AudienceKey[]; brand_id?: string | null }
  anchor?: { projectId: string; where: 'above' | 'below' } | null
}): Promise<{ success: true; projectId: string } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!isAdmin(m)) return { success: false, error: 'may_not_edit_theme' }
  let projectId: string
  if (input.projectId) {
    const p = UUID.test(input.projectId) ? await prisma.project.findUnique({ where: { id: input.projectId } }) : null
    if (!p) return { success: false, error: 'not_found' }
    if (await prisma.contentSheetTheme.findUnique({ where: { project_id: p.id } })) return { success: false, error: 'already_theme' }
    projectId = p.id
  } else if (input.newProject) {
    const np = input.newProject
    const name = clean(np.name, 120)
    if (!name) return { success: false, error: 'generic' }
    if ((await prisma.project.findMany({ select: { name: true } })).some(p => norm(p.name) === norm(name))) return { success: false, error: 'project_exists' }
    const c = np.frequency_count ?? null
    if (c !== null && (!Number.isInteger(c) || c < 1 || c > 50)) return { success: false, error: 'bad_frequency' }
    const audience = (np.audience ?? []).filter(a => AUDIENCE_KEYS.includes(a))
    const owner = np.owner_id && UUID.test(np.owner_id) && await prisma.member.findUnique({ where: { id: np.owner_id } }) ? np.owner_id : m.id
    projectId = (await prisma.project.create({
      data: {
        name, standing: true, is_theme: true, owner_id: owner, brand_id: np.brand_id && UUID.test(np.brand_id) ? np.brand_id : null,
        frequency_count: c, frequency_period: c ? (np.frequency_period === 'month' ? 'month' : 'week') : null, audience,
      },
    })).id
  } else return { success: false, error: 'generic' }
  const themes = await prisma.contentSheetTheme.findMany({ orderBy: { position: 'asc' } })
  let position = between(themes[themes.length - 1]?.position ?? null, null)
  if (input.anchor) {
    const i = themes.findIndex(t => t.project_id === input.anchor!.projectId)
    if (i >= 0) position = input.anchor.where === 'above' ? between(themes[i - 1]?.position ?? null, themes[i].position) : between(themes[i].position, themes[i + 1]?.position ?? null)
  }
  await prisma.contentSheetTheme.create({ data: { project_id: projectId, position, created_by: m.id } })
  await prisma.project.update({ where: { id: projectId }, data: { is_theme: true } })
  done()
  return { success: true, projectId }
}

/** Drag a theme: the sheet's order only. */
export async function reorderThemes(projectId: string, target: string, where: 'before' | 'after'): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!isAdmin(m)) return { success: false, error: 'may_not_edit_theme' }
  const themes = await prisma.contentSheetTheme.findMany({ orderBy: { position: 'asc' } })
  const ids = reorder(themes.map(t => t.project_id), projectId, target, where)
  for (const [i, pid] of ids.entries()) await prisma.contentSheetTheme.update({ where: { project_id: pid }, data: { position: i + 1 } })
  done()
  return { success: true }
}

/**
 * Remove a theme from the sheet (the project stays). Its rows go to another
 * theme (and pillar there); none are deleted. Linked tasks follow.
 */
export async function removeSheetTheme(projectId: string, dest: { projectId: string; pillarId?: string | null } | null): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!isAdmin(m)) return { success: false, error: 'may_not_edit_theme' }
  const theme = await themeOf(projectId)
  if (!theme) return { success: false, error: 'not_a_theme' }
  const rows = await prisma.contentRow.findMany({ where: { project_id: projectId } })
  if (rows.length) {
    if (!dest || dest.projectId === projectId || !(await themeOf(dest.projectId))) return { success: false, error: 'needs_destination' }
    const pillar = await pillarIn(dest.projectId, dest.pillarId)
    if (pillar === false) return { success: false, error: 'not_a_theme' }
    const target = await allRows(dest.projectId)
    let pos = groupRows(target, dest.projectId, pillar).reduce((mx, r) => Math.max(mx, r.position), 0)
    for (const r of rows.filter(x => !x.parent_id).sort((a, b) => a.position - b.position)) {
      await prisma.contentRow.update({ where: { id: r.id }, data: { project_id: dest.projectId, pillar_id: pillar, position: ++pos } })
    }
    await prisma.contentRow.updateMany({ where: { project_id: projectId, parent_id: { not: null } }, data: { project_id: dest.projectId, pillar_id: pillar } })
    await taskFollows(rows.map(r => r.task_id).filter((x): x is string => !!x), dest.projectId, pillar)
  }
  await prisma.contentSheetTheme.delete({ where: { project_id: projectId } })
  await prisma.project.update({ where: { id: projectId }, data: { is_theme: false } })
  done()
  return { success: true }
}

// ─── Pillars ────────────────────────────────────────────────────────────────

/** + Pillar / Insert pillar above or below: a name, added to the theme's project. */
export async function addPillarAt(projectId: string, name: string, anchor?: { pillarId: string; where: 'above' | 'below' } | null): Promise<{ success: true; id: string } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const theme = await themeOf(projectId)
  if (!theme) return { success: false, error: 'not_a_theme' }
  if (!(await mayEditTheme(projectId, m))) return { success: false, error: 'may_not_edit_theme' }
  const n = clean(name, 80)
  if (!n) return { success: false, error: 'generic' }
  const pillars = await prisma.contentPillar.findMany({ where: { project_id: projectId }, orderBy: { sort_order: 'asc' } })
  if (pillars.some(p => norm(p.name) === norm(n))) return { success: false, error: 'duplicate_pillar' }
  const created = await prisma.contentPillar.create({ data: { project_id: projectId, name: n, sort_order: pillars.length } })
  const order = theme.pillar_order.length ? [...theme.pillar_order] : []
  for (const p of pillars) if (!order.includes(p.id)) order.push(p.id)
  const i = anchor ? order.indexOf(anchor.pillarId) : -1
  if (i >= 0) order.splice(anchor!.where === 'above' ? i : i + 1, 0, created.id); else order.push(created.id)
  await prisma.contentSheetTheme.update({ where: { project_id: projectId }, data: { pillar_order: order } })
  done()
  return { success: true, id: created.id }
}

/** Drag a pillar: the sheet's order only. */
export async function reorderPillars(projectId: string, pillarId: string, target: string, where: 'before' | 'after'): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const theme = await themeOf(projectId)
  if (!theme) return { success: false, error: 'not_a_theme' }
  if (!(await mayEditTheme(projectId, m))) return { success: false, error: 'may_not_edit_theme' }
  const pillars = await prisma.contentPillar.findMany({ where: { project_id: projectId }, orderBy: { sort_order: 'asc' } })
  const order = [...theme.pillar_order.filter(id => pillars.some(p => p.id === id))]
  for (const p of pillars) if (!order.includes(p.id)) order.push(p.id)
  await prisma.contentSheetTheme.update({ where: { project_id: projectId }, data: { pillar_order: reorder(order, pillarId, target, where) } })
  done()
  return { success: true }
}

/**
 * Remove a pillar. Its rows go to another theme or pillar, or to "No pillar"
 * under the same theme (dest null). Rows are never deleted with it.
 */
export async function removePillarTo(pillarId: string, dest: { projectId: string; pillarId?: string | null } | null): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const p = UUID.test(pillarId) ? await prisma.contentPillar.findUnique({ where: { id: pillarId } }) : null
  if (!p) return { success: false, error: 'not_found' }
  if (!(await mayEditTheme(p.project_id, m))) return { success: false, error: 'may_not_edit_theme' }
  const to = dest ?? { projectId: p.project_id, pillarId: null }
  if (!(await themeOf(to.projectId))) return { success: false, error: 'not_a_theme' }
  const pillar = await pillarIn(to.projectId, to.pillarId)
  if (pillar === false || pillar === pillarId) return { success: false, error: 'not_a_theme' }
  const rows = await prisma.contentRow.findMany({ where: { pillar_id: pillarId } })
  const target = await allRows(to.projectId)
  let pos = groupRows(target, to.projectId, pillar).reduce((mx, r) => Math.max(mx, r.position), 0)
  for (const r of rows.filter(x => !x.parent_id).sort((a, b) => a.position - b.position)) {
    await prisma.contentRow.update({ where: { id: r.id }, data: { project_id: to.projectId, pillar_id: pillar, position: ++pos } })
  }
  await prisma.contentRow.updateMany({ where: { pillar_id: pillarId }, data: { project_id: to.projectId, pillar_id: pillar } })
  await taskFollows(rows.map(r => r.task_id).filter((x): x is string => !!x), to.projectId, pillar)
  // Tasks of the pillar without a row (none, after the sync) still lose it with the delete (SetNull).
  await prisma.contentPillar.delete({ where: { id: pillarId } })
  await prisma.contentSheetTheme.updateMany({ where: { project_id: p.project_id }, data: { pillar_order: { set: (await prisma.contentSheetTheme.findUnique({ where: { project_id: p.project_id } }))?.pillar_order.filter(x => x !== pillarId) ?? [] } } })
  done()
  return { success: true }
}

/** Projects that aren't themes yet, for + Theme's list. */
export async function themeCandidates(): Promise<{ id: string; name: string }[]> {
  const m = await me()
  if (!m || !isAdmin(m)) return []
  return prisma.project.findMany({ where: { sheet_theme: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
}
