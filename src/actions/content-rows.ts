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
import { resolveSettings } from '@/lib/space-settings'
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
import { defaultAssigneeFor } from '@/lib/spaces'
import { creationPlan, creationRefusal, homeSpaceOf, loadSpacesWithSettings } from '@/lib/space-settings-server'
import { spaceSheetId } from '@/lib/sheet-columns'
import { tabSheetId } from '@/lib/tab-rows'
import { mayUseSheet } from '@/lib/sheet-access'
import { formatValue, parseValue } from '@/lib/task-fields'
import { mapTaskField } from '@/lib/mappers'
import { asPriority } from '@/lib/priorities'
import type { AudienceKey, FrequencyPeriod } from '@/types/index'

type Fail = { success: false; error: string }
type Me = NonNullable<Awaited<ReturnType<typeof getSessionMember>>>
const UUID = /^[0-9a-f-]{36}$/i
const isAdmin = (m: { access: string }) => m.access === 'admin' || m.access === 'superuser'
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const done = () => { revalidatePath('/', 'layout') }

async function me() { return getSessionMember() }
/** Spec 026: the Space whose sheet is meant — the one given, else the Content Space. */
async function sheetSpace(spaceId?: string | null): Promise<string | null> {
  if (spaceId && UUID.test(spaceId) && await prisma.teamSpace.findFirst({ where: { id: spaceId, archived_at: null }, select: { id: true } })) return spaceId
  return (await prisma.teamSpace.findUnique({ where: { key: 'content' }, select: { id: true } }))?.id ?? null
}
/**
 * Spec 027 (US3): which sheet a row, theme or pillar order is on. A Space's Board tab (`space_id`,
 * no `sheet_id`), or an added tab (`sheet_id`, no `space_id`).
 */
type Scope = { sheetId: string } | { spaceId: string | null }
const inScope = (sc: Scope) => ('sheetId' in sc ? { sheet_id: sc.sheetId } : { space_id: sc.spaceId, sheet_id: null })
const scopeOfRow = (r: { sheet_id?: string | null; space_id: string | null }): Scope => (r.sheet_id ? { sheetId: r.sheet_id } : { spaceId: r.space_id })
/** An added tab the member may use, or null. */
async function tabOf(sheetId: string | null | undefined, m: Me) {
  if (!sheetId || !UUID.test(sheetId)) return null
  const tab = await prisma.sheet.findUnique({ where: { id: sheetId } })
  return tab && tab.kind === 'rows' && await mayUseSheet(sheetId, m) ? tab : null
}
/** The sheet meant by a call: an added tab when `sheetId` is given, else the Space's Board tab. */
async function scopeFrom(spaceId?: string | null, sheetId?: string | null): Promise<Scope> {
  if (sheetId && UUID.test(sheetId)) return { sheetId }
  return { spaceId: await sheetSpace(spaceId) }
}
/** A theme's rows on one sheet (`null`: an added tab's rows under no theme). */
async function allRows(projectId: string | null, sc: Scope): Promise<ContentRowRec[]> {
  return (await prisma.contentRow.findMany({ where: { project_id: projectId, ...inScope(sc) } })).map(mapContentRow)
}
/** The theme's entry on one sheet. */
async function themeOf(projectId: string, sc: Scope) {
  return UUID.test(projectId) ? prisma.contentSheetTheme.findFirst({ where: { project_id: projectId, ...inScope(sc) }, include: { project: true } }) : null
}
async function pillarIn(projectId: string | null, pillarId: string | null | undefined): Promise<string | null | false> {
  if (!pillarId) return null
  if (!projectId) return false
  const p = UUID.test(pillarId) ? await prisma.contentPillar.findUnique({ where: { id: pillarId } }) : null
  return p && p.project_id === projectId ? p.id : false
}
/**
 * Whether the member may edit a row: anyone for a plain row; the task's people for a linked one. In an
 * added tab, also its creator, admins and superusers (they link and unlink the whole tab).
 */
async function mayEditRow(row: { task_id: string | null; sheet_id?: string | null }, m: Me): Promise<boolean> {
  if (row.sheet_id && !(await tabOf(row.sheet_id, m))) return false
  if (!row.task_id) return true
  const t = await prisma.task.findUnique({ where: { id: row.task_id } })
  if (!t || canActOn(await withAssignees(t), m)) return true
  if (row.sheet_id && (isAdmin(m) || (await prisma.sheet.findUnique({ where: { id: row.sheet_id }, select: { created_by: true } }))?.created_by === m.id)) return true
  return false
}
async function mayEditTheme(projectId: string, m: Me) {
  if (isAdmin(m)) return true
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { owner_id: true } })
  return p?.owner_id === m.id
}
/** A linked row's task follows the row to a theme and pillar. */
async function taskFollows(taskIds: string[], projectId: string | null, pillarId: string | null) {
  // A row moved out of every theme (an added tab's "no theme") leaves its task's theme as it was.
  if (taskIds.length && projectId) await prisma.task.updateMany({ where: { id: { in: taskIds } }, data: { project_id: projectId, pillar_id: pillarId, updated_at: new Date() } })
}

// ─── Rows ───────────────────────────────────────────────────────────────────

/** Spec 024 (§3): the Content Space's "Child rows allowed" switch. */
async function childRowsOn(): Promise<boolean> {
  const space = await prisma.teamSpace.findUnique({ where: { key: 'content' }, select: { key: true, settings: true } })
  return !space || resolveSettings(space.key, space.settings).child_rows
}

export async function addRow(input: {
  /** The theme's project; none for an added tab's rows under no theme. */
  projectId: string | null; pillarId?: string | null; parentId?: string | null; title: string
  anchor?: { id: string; where: 'above' | 'below' } | null
  /** Spec 026: the Space whose sheet the row is added to; the Content Space when left out. */
  spaceId?: string | null
  /** Spec 027 (US3): an added tab instead of the Board tab. */
  sheetId?: string | null
}): Promise<{ success: true; row: ContentRowRec; taskId?: string } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const title = clean(input.title, 300)
  if (!title) return { success: false, error: 'generic' }
  const tab = input.sheetId ? await tabOf(input.sheetId, m) : null
  if (input.sheetId && !tab) return { success: false, error: 'not_found' }
  const sc = await scopeFrom(input.spaceId, tab?.id)
  const projectId = input.projectId && UUID.test(input.projectId) ? input.projectId : null
  // A row may sit under no theme (the tab's or Board tab's "No theme" group).
  if (projectId && !(await themeOf(projectId, sc))) return { success: false, error: 'not_a_theme' }
  const rows = await allRows(projectId, sc)
  let pillar = await pillarIn(projectId, input.pillarId)
  if (pillar === false) return { success: false, error: 'not_a_theme' }
  let parentId: string | null = null
  if (input.parentId && !(await childRowsOn())) return { success: false, error: 'child_rows_off' }
  if (input.parentId) {
    const parent = rows.find(r => r.id === input.parentId)
    if (!parent || parent.parent_id) return { success: false, error: 'one_level' }
    if (!(await mayEditRow(parent, m))) return { success: false, error: 'not_authorized' }
    parentId = parent.id
    pillar = parent.pillar_id
  }
  const siblings = parentId ? childrenOf(rows, parentId) : groupRows(rows, projectId, pillar)
  const row = await prisma.contentRow.create({
    data: {
      ...('sheetId' in sc ? { sheet_id: sc.sheetId, space_id: null } : { space_id: sc.spaceId }),
      project_id: projectId, pillar_id: pillar, parent_id: parentId, title, position: positionFor(siblings, input.anchor), created_by: m.id },
  })
  // Spec 027: in a linked tab every titled row is a task on the tab's board (a child row under a video is
  // one of its clips; under anything else, a task of its own: no subtasks, owner 25 Nov 2026).
  if (tab?.linked) {
    const made = await makeTask(row.id, { spaceId: tab.space_id })
    done()
    return { success: true, row: mapContentRow(row), ...(made.success ? { taskId: made.taskId } : {}) }
  }
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
  if (row.sheet_id && !(await tabOf(row.sheet_id, m))) return { success: false, error: 'not_authorized' }
  await prisma.contentRow.update({ where: { id }, data })
  // Spec 027: in a linked tab, a row that gets its title becomes a task.
  if (row.sheet_id && !row.title.trim() && typeof data.title === 'string' && !row.parent_id) {
    const tab = await prisma.sheet.findUnique({ where: { id: row.sheet_id }, select: { linked: true, space_id: true } })
    if (tab?.linked) await makeTask(id, { spaceId: tab.space_id })
  }
  done()
  return { success: true }
}

/**
 * Move a row: to a theme and pillar (top level, at the end or by an anchor),
 * or under a parent row. Its children go with it; linked tasks follow.
 */
export async function moveRow(id: string, toIn: {
  projectId: string | null; pillarId?: string | null; parentId?: string | null; anchor?: { id: string; where: 'above' | 'below' } | null
}): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id } }) : null
  if (!row) return { success: false, error: 'not_found' }
  if (!(await mayEditRow(row, m))) return { success: false, error: 'not_authorized' }
  const sc = scopeOfRow(row)
  const to = { ...toIn, projectId: toIn.projectId && UUID.test(toIn.projectId) ? toIn.projectId : null }
  if (to.projectId && !(await themeOf(to.projectId, sc))) return { success: false, error: 'not_a_theme' }
  const rows = await allRows(to.projectId, sc)
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
  const rows = await allRows(row.project_id, scopeOfRow(row))
  const rec = rows.find(r => r.id === id)!
  if (dir === 'in') {
    if (!(await childRowsOn())) return { success: false, error: 'child_rows_off' }
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
  // Deleted tasks that came from the ClickUp import are tombstoned, as in bulkDeleteTasks: the importer
  // runs at every start and would otherwise bring them back.
  let imported: { key: string; label: string }[] = []
  if (opts.task === 'delete' && taskIds.length) {
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } })
    for (const t of tasks) if (!canActOn(await withAssignees(t), m)) return { success: false, error: 'not_authorized' }
    imported = tasks.filter(t => t.external_id).map(t => ({ key: t.external_id as string, label: t.name }))
  }
  await prisma.$transaction(async tx => {
    if (opts.children === 'up' && kids.length) {
      // Up a level, in place of their parent and in their order.
      const rows = (await tx.contentRow.findMany({ where: { project_id: row.project_id, ...inScope(scopeOfRow(row)) } })).map(mapContentRow)
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
      if (opts.task === 'delete') {
        await tx.task.deleteMany({ where: { id: { in: taskIds } } })
        if (imported.length) await tx.tombstone.createMany({ data: imported.map(t => ({ kind: 'task', ...t })), skipDuplicates: true })
      }
      // Unlinked: the sheet doesn't give it a row again; it keeps its theme and stays in its Spaces.
      // (An added tab's rows never come back by themselves: only the Board tab's sync needs telling.)
      else if (!row.sheet_id) await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { sheet_row_off: true, updated_at: new Date() } })
    }
  })
  done()
  return { success: true }
}

// ─── Make task, link and unlink (spec 026 §4–§5) ────────────────────────────

/** The row's own values as they go onto a task: `f:<fieldId>` → the task field; a custom column key → that column's cell. */
async function rowValuesToTask(taskId: string, typeLabel: string | null, row: { space_id: string | null; sheet_id?: string | null; values: unknown }, by: string, onlyEmpty: boolean) {
  const vals = (row.values && typeof row.values === 'object' ? row.values : {}) as Record<string, string>
  const keys = Object.keys(vals)
  if (!keys.length) return
  // Task fields: only those the task's type carries; a value that doesn't fit the field's kind is left on nothing.
  const fieldIds = keys.filter(k => k.startsWith('f:')).map(k => k.slice(2)).filter(id => UUID.test(id))
  if (fieldIds.length && typeLabel) {
    const [fields, links, have] = await Promise.all([
      prisma.taskField.findMany({ where: { id: { in: fieldIds }, retired_at: null } }),
      prisma.taskTypeField.findMany({ where: { type_label: typeLabel, field_id: { in: fieldIds } }, select: { field_id: true } }),
      prisma.taskFieldValue.findMany({ where: { task_id: taskId, field_id: { in: fieldIds } }, select: { field_id: true } }),
    ])
    const applies = new Set(links.map(l => l.field_id)), filled = new Set(have.map(h => h.field_id))
    for (const raw of fields) {
      if (!applies.has(raw.id) || (onlyEmpty && filled.has(raw.id))) continue
      const def = mapTaskField(raw)
      const text = vals[`f:${raw.id}`]
      // A multi-choice cell is typed as "a, b"; the others as their text.
      const parsed = parseValue(def, def.kind === 'multi' ? text.split(',').map(x => x.trim()).filter(Boolean) : def.kind === 'checkbox' ? /^(true|yes|1|✓)$/i.test(text.trim()) : def.kind === 'number' || def.kind === 'money' || def.kind === 'rating' ? Number(text) : text)
      if (!parsed.ok || parsed.value === null) continue
      await prisma.taskFieldValue.upsert({
        where: { task_id_field_id: { task_id: taskId, field_id: raw.id } },
        create: { task_id: taskId, field_id: raw.id, value: parsed.value as object, updated_by: by },
        update: { value: parsed.value as object, updated_by: by, updated_at: new Date() },
      })
    }
  }
  // Sheet-only columns keep their value on the row; on a linked row they are read per task, so they move to the task's cell.
  const space = row.space_id ? await prisma.teamSpace.findUnique({ where: { id: row.space_id }, select: { id: true, key: true } }) : null
  const sheet = row.sheet_id ? tabSheetId(row.sheet_id) : spaceSheetId(space ?? { id: '', key: 'content' })
  const cols = await prisma.sheetColumn.findMany({ where: { sheet, key: { in: keys.filter(k => !k.startsWith('f:')) } }, select: { id: true, key: true } })
  if (cols.length) {
    const byId = Object.fromEntries(cols.map(c => [c.id, vals[c.key]]))
    const members = await prisma.member.findMany({ select: { id: true, name: true } })
    await prisma.$transaction(async tx => { await writePastedValues(tx, await pasteColumns(tx, sheet, members), taskId, byId, by, { onlyEmpty }) })
  }
}

/**
 * Make task (spec 026 §4): a plain row becomes a linked row.
 *   - `taskId`: connect the row to that existing task. Where the row and the
 *     task both have a value, the task's wins; the row's fill what it lacks.
 *   - else create a pipeline task in the chosen Space, with the row's title,
 *     date and values. It takes its brand from the theme's project, and its
 *     theme and pillar from the groups the row sits under.
 * A child row (§5) makes a subtask of its parent row's task, in that task's
 * Space; it can't be linked while its parent row is plain. A video's child
 * row is a clip (spec 024 §8).
 */
export async function makeTask(id: string, opts: {
  spaceId?: string | null; taskId?: string | null; type?: string | null
  /** Spec 027 (Link to board): a brand and an assignee read from the row's matched columns. */
  brandId?: string | null; assigneeId?: string | null
} = {}): Promise<{ success: true; taskId: string } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id }, include: { project: true } }) : null
  if (!row) return { success: false, error: 'not_found' }
  if (row.task_id) return { success: false, error: 'linked' }
  const tab = row.sheet_id ? await tabOf(row.sheet_id, m) : null
  if (row.sheet_id && !tab) return { success: false, error: 'not_authorized' }
  const sc = scopeOfRow(row)
  // Spec 027 (R4): a row that had a task gets it back — never a second one.
  if (!opts.taskId && row.last_task_id) {
    const was = await prisma.task.findUnique({ where: { id: row.last_task_id }, select: { id: true } })
    if (was && !(await prisma.contentRow.findFirst({ where: { ...inScope(sc), task_id: was.id }, select: { id: true } }))) {
      await prisma.contentRow.update({ where: { id }, data: { task_id: was.id, values: {} } })
      if (row.project_id) await prisma.task.update({ where: { id: was.id }, data: { project_id: row.project_id, pillar_id: row.pillar_id, updated_at: new Date() } })
      done()
      return { success: true, taskId: was.id }
    }
  }
  // Owner, 25 Nov 2026: no subtasks. A child row under a video is one of its clips; under any other row
  // it makes (or links) a task of its own, like a top-level row.
  const parentRow = row.parent_id ? await prisma.contentRow.findUnique({ where: { id: row.parent_id } }) : null
  const parentOf = parentRow?.task_id ? await prisma.task.findUnique({ where: { id: parentRow.task_id } }) : null
  // Owner, 25 Nov 2026: clips too are tasks like any other — no child row is tied to its parent's task.
  void parentOf
  const day = row.date ? row.date.toISOString().slice(0, 10) : null

  let taskId: string
  let created = false
  if (opts.taskId) {
    // Connect to an existing task.
    const task = UUID.test(opts.taskId) ? await prisma.task.findUnique({ where: { id: opts.taskId } }) : null
    if (!task || task.dropped_at) return { success: false, error: 'not_found' }
    if (!canActOn(await withAssignees(task), m)) return { success: false, error: 'not_authorized' }
    if (await prisma.contentRow.findFirst({ where: { ...inScope(sc), task_id: task.id }, select: { id: true } })) return { success: false, error: 'already_in_sheet' }
    if (opts.spaceId && UUID.test(opts.spaceId)) {
      const home = await homeSpaceOf(task.id)
      const inSpace = home?.id === opts.spaceId || !!(await prisma.taskSpace.findFirst({ where: { task_id: task.id, space_id: opts.spaceId }, select: { task_id: true } }))
      if (!inSpace) return { success: false, error: 'not_in_space' }
    }
    taskId = task.id
    // The task's values win; the row fills only what the task lacks.
    if (!task.publish_date && day) await prisma.task.update({ where: { id: task.id }, data: { ...(await newTaskDates(day, task.due_date ? task.due_date.toISOString().slice(0, 10) : null)), updated_at: new Date() } })
    await rowValuesToTask(task.id, task.content_type_label, row, m.id, true)
  } else {
    // A new pipeline task in the chosen Space.
    const spaces = await loadSpacesWithSettings()
    const dest = spaces.find(sp => sp.id === opts.spaceId) ?? spaces.find(sp => sp.id === (tab?.space_id ?? row.space_id))
    if (!dest) return { success: false, error: 'needs_space' }
    const plan = creationPlan(dest)
    const wanted = opts.type && await prisma.contentType.findUnique({ where: { label: opts.type } }) ? opts.type : null
    const type = wanted ?? plan.default_type ?? 'Post'
    const refusal = await creationRefusal(dest, m, type)
    if (refusal) return { success: false, error: refusal }
    const ctx = await loadSpaceContext()
    const owner = row.project?.owner_id ?? m.id
    const holders = dest.default_assignee_role ? await prisma.member.findMany({ where: { role: dest.default_assignee_role }, select: { id: true, name: true, role: true } }) : []
    const chosen = opts.assigneeId && UUID.test(opts.assigneeId) && await prisma.member.findUnique({ where: { id: opts.assigneeId }, select: { id: true } }) ? opts.assigneeId : null
    const assignee = chosen ?? defaultAssigneeFor(dest, holders, ctx.members[dest.id] ?? []) ?? (owner !== m.id && !isAdmin(m) ? m.id : null)
    // The brand: matched from the row, else the theme's, else the tab's folder brand (Space › Brand).
    const brandId = (opts.brandId && UUID.test(opts.brandId) ? opts.brandId : null) ?? row.project?.brand_id ?? tab?.brand_id ?? null
    const [brand, ws] = await Promise.all([
      brandId ? prisma.brand.findUnique({ where: { id: brandId }, select: { nine_stage_default: true, default_priority: true } }) : null,
      prisma.workspaceSettings.findUnique({ where: { id: 1 }, select: { nine_stage_default: true } }),
    ])
    const task = await prisma.task.create({
      data: {
        name: row.title, project_id: row.project_id, pillar_id: row.pillar_id, brand_id: brandId, content_type_label: type,
        task_owner_id: owner, assignee_id: assignee, initiator_role: m.role,
        nine_stage: brand?.nine_stage_default ?? ws?.nine_stage_default ?? false,
        status: plan.status, entry_stage: plan.entry_stage, ...(plan.media_board ? { media_board: plan.media_board } : {}), stage_date: new Date(),
        hours_estimate: 0, priority: asPriority(plan.default_priority) ?? asPriority(brand?.default_priority) ?? 'Normal', created_by: m.id, ...(await newTaskDates(day, null)),
      },
    })
    taskId = task.id
    created = true
    await addSpaces(prisma, task.id, [dest.id], 'created', m.id)
    await addAssigneeSpaces(prisma, task, task.assignee_id, m.id, ctx)
    await rowValuesToTask(task.id, type, row, m.id, false)
    await notifyAfter(async tx => {
      for (const x of new Set([m.id, task.task_owner_id, task.assignee_id].filter((v): v is string => !!v))) await follow(tx, task.id, x)
      const ids = await notify(tx, { kind: 'task_created_in_stage', actorId: m.id, taskId: task.id })
      if (task.assignee_id && task.assignee_id !== m.id) ids.push(...await notify(tx, { kind: 'assigned', actorId: m.id, taskId: task.id, assigneeId: task.assignee_id }))
      return ids
    })
  }
  // Linked: the row shows the task's values from here on, and the task sits in the row's theme and pillar.
  await prisma.contentRow.update({ where: { id }, data: { task_id: taskId, values: {}, last_task_id: null } })
  await prisma.task.update({ where: { id: taskId }, data: { ...(row.sheet_id ? {} : { sheet_row_off: false }), ...(created || !row.project_id ? {} : { project_id: row.project_id, pillar_id: row.pillar_id }), updated_at: new Date() } })
  done()
  return { success: true, taskId }
}

/** Create a task from a plain row in the Content Space (sheet 2b's "Create task"). */
export async function rowToTask(id: string, opts: { type?: string } = {}): Promise<{ success: true; taskId: string } | Fail> {
  return makeTask(id, { type: opts.type ?? null })
}

/** Link a plain row to an existing task (sheet 2b's "Link a task…"). */
export async function linkRowTask(id: string, taskId: string): Promise<{ success: true } | Fail> {
  const r = await makeTask(id, { taskId })
  return r.success ? { success: true } : r
}

/**
 * Unlink (spec 026 §4): the row stays, with its last values as plain text; the
 * task carries on by itself in its Space, and the sheet doesn't give it a row
 * again. Its child rows keep their own links.
 */
export async function unlinkRow(id: string): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const row = UUID.test(id) ? await prisma.contentRow.findUnique({ where: { id } }) : null
  if (!row) return { success: false, error: 'not_found' }
  if (!row.task_id) return { success: false, error: 'not_linked' }
  if (!(await mayEditRow(row, m))) return { success: false, error: 'not_authorized' }
  const task = await prisma.task.findUnique({ where: { id: row.task_id } })
  const values: Record<string, string> = {}
  if (task) {
    const [fieldVals, cells, members] = await Promise.all([
      prisma.taskFieldValue.findMany({ where: { task_id: task.id }, include: { field: true } }),
      prisma.sheetValue.findMany({ where: { task_id: task.id }, include: { column: { select: { key: true, sheet: true } } } }),
      prisma.member.findMany({ select: { id: true, name: true } }),
    ])
    const memberName = (mid: string) => members.find(x => x.id === mid)?.name
    for (const v of fieldVals) {
      if (v.field.retired_at) continue
      const text = formatValue(mapTaskField(v.field), v.value, { locale: 'en', memberName })
      if (text) values[`f:${v.field_id}`] = text.slice(0, 5000)
    }
    const space = row.space_id ? await prisma.teamSpace.findUnique({ where: { id: row.space_id }, select: { id: true, key: true } }) : null
    const sheet = row.sheet_id ? tabSheetId(row.sheet_id) : spaceSheetId(space ?? { id: '', key: 'content' })
    for (const c of cells) if (c.column.sheet === sheet && c.value) values[c.column.key] = c.value.slice(0, 5000)
    // The stage it was at stays on the row as a label.
    values.status = task.status
    if (task.content_type_label) values.type = task.content_type_label
  }
  // The row remembers its task (spec 027 R4), so linking again reconnects it instead of making another.
  await prisma.$transaction([
    prisma.contentRow.update({ where: { id }, data: { task_id: null, last_task_id: row.task_id, title: task?.name ?? row.title, date: task?.publish_date ?? row.date, values } }),
    ...(task && !row.sheet_id ? [prisma.task.update({ where: { id: task.id }, data: { sheet_row_off: true, updated_at: new Date() } })] : []),
  ])
  done()
  return { success: true }
}

// ─── Themes ─────────────────────────────────────────────────────────────────

/** + Theme / Insert theme above or below: an existing project, or a new one. Admins and superusers. */
export async function addSheetTheme(input: {
  /** The theme's name: all that adding a theme asks for (user, 24 Nov 2026). */
  name: string
  /** The brand of the folder it is added in; none on a Space's own sheet. */
  brandId?: string | null
  anchor?: { projectId: string; where: 'above' | 'below' } | null
  /** Spec 026: the Space whose sheet gets the theme; the Content Space when left out. */
  spaceId?: string | null
  /** Spec 027: an added tab instead. */
  sheetId?: string | null
}): Promise<{ success: true; projectId: string } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!isAdmin(m)) return { success: false, error: 'may_not_edit_theme' }
  if (input.sheetId && !(await tabOf(input.sheetId, m))) return { success: false, error: 'not_found' }
  const sid = await scopeFrom(input.spaceId, input.sheetId)
  const name = clean(input.name, 120)
  if (!name) return { success: false, error: 'theme_name_empty' }
  const brandId = input.brandId && UUID.test(input.brandId) && await prisma.brand.findUnique({ where: { id: input.brandId }, select: { id: true } }) ? input.brandId : null
  // A theme is a project behind the scenes. One with this name in this brand is the same project on
  // every Space's sheet (user, 24 Nov 2026), so a brand's work can be collected by project. Using an
  // existing project brings none of its tasks onto this sheet: a sheet holds the rows put on it.
  const found = (await prisma.project.findMany({ where: { brand_id: brandId }, select: { id: true, name: true } })).find(p => norm(p.name) === norm(name))
  if (found && await prisma.contentSheetTheme.findFirst({ where: { project_id: found.id, ...inScope(sid) }, select: { id: true } })) return { success: false, error: 'theme_exists' }
  const projectId = found
    ? (await prisma.project.update({ where: { id: found.id }, data: { is_theme: true } })).id
    : (await prisma.project.create({ data: { name, standing: true, is_theme: true, owner_id: m.id, brand_id: brandId } })).id
  const themes = await prisma.contentSheetTheme.findMany({ where: inScope(sid), orderBy: { position: 'asc' } })
  let position = between(themes[themes.length - 1]?.position ?? null, null)
  if (input.anchor) {
    const i = themes.findIndex(t => t.project_id === input.anchor!.projectId)
    if (i >= 0) position = input.anchor.where === 'above' ? between(themes[i - 1]?.position ?? null, themes[i].position) : between(themes[i].position, themes[i + 1]?.position ?? null)
  }
  await prisma.contentSheetTheme.create({ data: { project_id: projectId, ...('sheetId' in sid ? { sheet_id: sid.sheetId } : { space_id: sid.spaceId }), position, created_by: m.id } })
  done()
  return { success: true, projectId }
}

/** Drag a theme: the sheet's order only. */
export async function reorderThemes(projectId: string, target: string, where: 'before' | 'after', spaceId?: string | null, sheetId?: string | null): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!isAdmin(m)) return { success: false, error: 'may_not_edit_theme' }
  const sid = await scopeFrom(spaceId, sheetId)
  const themes = await prisma.contentSheetTheme.findMany({ where: inScope(sid), orderBy: { position: 'asc' } })
  const ids = reorder(themes.map(t => t.project_id), projectId, target, where)
  for (const [i, pid] of ids.entries()) await prisma.contentSheetTheme.updateMany({ where: { project_id: pid, ...inScope(sid) }, data: { position: i + 1 } })
  done()
  return { success: true }
}

/**
 * Remove a theme from the sheet (the project stays). Its rows go to another
 * theme (and pillar there); none are deleted. Linked tasks follow.
 */
export async function removeSheetTheme(projectId: string, dest: { projectId: string | null; pillarId?: string | null } | null, spaceId?: string | null, sheetId?: string | null): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  if (!isAdmin(m)) return { success: false, error: 'may_not_edit_theme' }
  const sid = await scopeFrom(spaceId, sheetId)
  const theme = await themeOf(projectId, sid)
  if (!theme) return { success: false, error: 'not_a_theme' }
  const rows = await prisma.contentRow.findMany({ where: { project_id: projectId, ...inScope(sid) } })
  if (rows.length) {
    // Spec 027: in an added tab the rows may go under no theme.
    const toNone = !!dest && !dest.projectId
    if (!dest || dest.projectId === projectId || (!toNone && !(await themeOf(dest.projectId!, sid)))) return { success: false, error: 'needs_destination' }
    const pillar = toNone ? null : await pillarIn(dest.projectId, dest.pillarId)
    if (pillar === false) return { success: false, error: 'not_a_theme' }
    const target = await allRows(dest.projectId, sid)
    let pos = groupRows(target, dest.projectId, pillar).reduce((mx, r) => Math.max(mx, r.position), 0)
    for (const r of rows.filter(x => !x.parent_id).sort((a, b) => a.position - b.position)) {
      await prisma.contentRow.update({ where: { id: r.id }, data: { project_id: dest.projectId, pillar_id: pillar, position: ++pos } })
    }
    await prisma.contentRow.updateMany({ where: { project_id: projectId, ...inScope(sid), parent_id: { not: null } }, data: { project_id: dest.projectId, pillar_id: pillar } })
    await taskFollows(rows.map(r => r.task_id).filter((x): x is string => !!x), dest.projectId, pillar)
  }
  await prisma.contentSheetTheme.delete({ where: { id: theme.id } })
  // The project stops being a theme only when no Space's sheet has it.
  if (!(await prisma.contentSheetTheme.count({ where: { project_id: projectId } }))) await prisma.project.update({ where: { id: projectId }, data: { is_theme: false } })
  done()
  return { success: true }
}

// ─── Pillars ────────────────────────────────────────────────────────────────

/** + Pillar / Insert pillar above or below: a name, added to the theme's project. */
export async function addPillarAt(projectId: string, name: string, anchor?: { pillarId: string; where: 'above' | 'below' } | null, spaceId?: string | null, sheetId?: string | null): Promise<{ success: true; id: string } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const theme = await themeOf(projectId, await scopeFrom(spaceId, sheetId))
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
  await prisma.contentSheetTheme.update({ where: { id: theme.id }, data: { pillar_order: order } })
  done()
  return { success: true, id: created.id }
}

/** Drag a pillar: the sheet's order only. */
export async function reorderPillars(projectId: string, pillarId: string, target: string, where: 'before' | 'after', spaceId?: string | null, sheetId?: string | null): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const theme = await themeOf(projectId, await scopeFrom(spaceId, sheetId))
  if (!theme) return { success: false, error: 'not_a_theme' }
  if (!(await mayEditTheme(projectId, m))) return { success: false, error: 'may_not_edit_theme' }
  const pillars = await prisma.contentPillar.findMany({ where: { project_id: projectId }, orderBy: { sort_order: 'asc' } })
  const order = [...theme.pillar_order.filter(id => pillars.some(p => p.id === id))]
  for (const p of pillars) if (!order.includes(p.id)) order.push(p.id)
  await prisma.contentSheetTheme.update({ where: { id: theme.id }, data: { pillar_order: reorder(order, pillarId, target, where) } })
  done()
  return { success: true }
}

/**
 * Remove a pillar. Its rows go to another theme or pillar, or to "No pillar"
 * under the same theme (dest null). Rows are never deleted with it.
 */
export async function removePillarTo(pillarId: string, dest: { projectId: string; pillarId?: string | null } | null, spaceId?: string | null, sheetId?: string | null): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return { success: false, error: 'not_authenticated' }
  const p = UUID.test(pillarId) ? await prisma.contentPillar.findUnique({ where: { id: pillarId } }) : null
  if (!p) return { success: false, error: 'not_found' }
  if (!(await mayEditTheme(p.project_id, m))) return { success: false, error: 'may_not_edit_theme' }
  const to = dest ?? { projectId: p.project_id, pillarId: null }
  const sid = await scopeFrom(spaceId, sheetId)
  if (!(await themeOf(to.projectId, sid))) return { success: false, error: 'not_a_theme' }
  const pillar = await pillarIn(to.projectId, to.pillarId)
  if (pillar === false || pillar === pillarId) return { success: false, error: 'not_a_theme' }
  // A pillar belongs to its project, so its rows on every Space's sheet move with it.
  const rows = await prisma.contentRow.findMany({ where: { pillar_id: pillarId } })
  const ends = new Map<string, number>()
  for (const r of rows.filter(x => !x.parent_id).sort((a, b) => a.position - b.position)) {
    const rsc = scopeOfRow(r)
    const key = r.sheet_id ? `t:${r.sheet_id}` : r.space_id ?? ''
    if (!ends.has(key)) {
      if (to.projectId !== p.project_id && !(await themeOf(to.projectId, rsc))) await prisma.contentSheetTheme.create({ data: { project_id: to.projectId, ...(r.sheet_id ? { sheet_id: r.sheet_id } : { space_id: r.space_id }), position: 9999, created_by: m.id } })
      ends.set(key, groupRows(await allRows(to.projectId, rsc), to.projectId, pillar).reduce((mx, x) => Math.max(mx, x.position), 0))
    }
    const pos = ends.get(key)! + 1
    ends.set(key, pos)
    await prisma.contentRow.update({ where: { id: r.id }, data: { project_id: to.projectId, pillar_id: pillar, position: pos } })
  }
  await prisma.contentRow.updateMany({ where: { pillar_id: pillarId }, data: { project_id: to.projectId, pillar_id: pillar } })
  await taskFollows(rows.map(r => r.task_id).filter((x): x is string => !!x), to.projectId, pillar)
  // Tasks of the pillar without a row (none, after the sync) still lose it with the delete (SetNull).
  await prisma.contentPillar.delete({ where: { id: pillarId } })
  for (const th of await prisma.contentSheetTheme.findMany({ where: { project_id: p.project_id }, select: { id: true, pillar_order: true } })) {
    if (th.pillar_order.includes(pillarId)) await prisma.contentSheetTheme.update({ where: { id: th.id }, data: { pillar_order: th.pillar_order.filter(x => x !== pillarId) } })
  }
  done()
  return { success: true }
}

/** + Theme: the names of this brand's projects that aren't themes of this Space's sheet yet, to pick from while typing. */
export async function themeNames(spaceId?: string | null, brandId?: string | null, sheetId?: string | null): Promise<string[]> {
  const m = await me()
  if (!m || !isAdmin(m)) return []
  const sid = await scopeFrom(spaceId, sheetId)
  const rows = await prisma.project.findMany({
    where: { brand_id: brandId && UUID.test(brandId) ? brandId : null, sheet_themes: { none: inScope(sid) } },
    select: { name: true }, orderBy: { name: 'asc' },
  })
  return rows.map(r => r.name)
}
