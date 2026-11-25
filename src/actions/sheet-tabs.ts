'use server'

/**
 * Added tabs of a Sheet view (spec 027, US3; contracts/server-actions.md).
 *
 * A tab added with "+" is a `rows` sheet: rows grouped by theme and pillar, like the Board tab, kept in
 * `content_rows` with `sheet_id` set. It starts unlinked: a plain sheet where one row at a time can
 * become a task ("Make task"). Linked, every titled row is a task on the tab's Space board.
 *
 * Linking and relinking never make a duplicate: a row remembers its task (`last_task_id`) when it is
 * unlinked, and linking reconnects it (src/lib/tab-link.ts counts the same way the dialog shows).
 *
 * Who: anyone who may use the workbook adds and duplicates tabs; linking, unlinking and deleting a
 * tab is for its creator, admins and superusers (R7). The Board tab is never one of these.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { mayUseFolder, mayUseSheet } from '@/lib/sheet-access'
import { nextSheetName } from '@/lib/sheet-names'
import { canActOn } from '@/lib/task-access'
import { withAssignees } from '@/lib/assignees-server'
import { linkPreview, matchColumns, STANDARD_LINK_FIELDS, type FieldChoice, type LinkField, type Match, type TabRow } from '@/lib/tab-link'
import { tabSheetId } from '@/lib/tab-rows'
import { dayDate, isDay } from '@/lib/due-dates'
import type { SheetSummary } from '@/types/index'
import { makeTask, unlinkRow } from './content-rows'
import { dropTask } from './tasks'

type Fail = { success: false; error: string }
type Me = NonNullable<Awaited<ReturnType<typeof getSessionMember>>>
const fail = (error: string): Fail => ({ success: false, error })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isLead = (m: { access: string }) => m.access === 'admin' || m.access === 'superuser'
const done = () => { revalidatePath('/', 'layout') }

type TabRec = { id: string; folder_id: string; kind: string; name: string | null; position: number; linked: boolean; space_id: string | null; brand_id: string | null; created_by: string | null; hidden: boolean; tab_color: string | null; protected_by: string | null }

function summaryOf(s: TabRec): SheetSummary {
  return {
    id: s.id, folderId: s.folder_id, kind: 'rows', name: s.name, position: s.position, color: null, hidden: s.hidden, protectedBy: s.protected_by,
    rowCount: 0, colCount: 0, linked: s.linked, spaceId: s.space_id, createdBy: s.created_by, ...(s.brand_id ? { brandId: s.brand_id } : {}),
  }
}

/** The tab, checked: a `rows` tab this member may use; `manage` also needs its creator, an admin or a superuser. */
async function tabFor(sheetId: string, m: Me, manage: boolean): Promise<{ ok: true; tab: TabRec } | { ok: false; error: string }> {
  if (typeof sheetId !== 'string' || !UUID.test(sheetId)) return { ok: false, error: 'not_found' }
  const tab = await prisma.sheet.findUnique({ where: { id: sheetId } })
  if (!tab) return { ok: false, error: 'not_found' }
  if (tab.kind !== 'rows') return { ok: false, error: tab.kind === 'blank' ? 'invalid' : 'board_tab' }
  if (!(await mayUseSheet(sheetId, m))) return { ok: false, error: 'not_authorized' }
  if (manage && tab.created_by !== m.id && !isLead(m)) return { ok: false, error: 'not_authorized' }
  return { ok: true, tab }
}

/** "+": a new unlinked tab of rows after `after` (or at the end), for the workbook's Space. */
export async function addRowsTab(folderId: string, opts: { spaceId?: string | null; brandId?: string | null; after?: string | null; pattern?: string } = {}): Promise<{ success: true; sheet: SheetSummary } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  if (typeof folderId !== 'string' || !UUID.test(folderId)) return fail('not_found')
  if (!(await mayUseFolder(folderId, m))) return fail('not_authorized')
  if (!(await prisma.sheetFolder.findUnique({ where: { id: folderId }, select: { id: true } }))) return fail('not_found')
  const spaceId = opts.spaceId && UUID.test(opts.spaceId) && await prisma.teamSpace.findFirst({ where: { id: opts.spaceId, archived_at: null }, select: { id: true } }) ? opts.spaceId : null
  const brandId = opts.brandId && UUID.test(opts.brandId) && await prisma.brand.findUnique({ where: { id: opts.brandId }, select: { id: true } }) ? opts.brandId : null
  const pattern = opts.pattern && opts.pattern.includes('{n}') && opts.pattern.length <= 40 ? opts.pattern : 'Sheet {n}'
  const tab = await prisma.$transaction(async tx => {
    const tabs = await tx.sheet.findMany({ where: { folder_id: folderId }, orderBy: { position: 'asc' }, select: { id: true, name: true } })
    let at = tabs.length
    if (opts.after) { const i = tabs.findIndex(t => t.id === opts.after); if (i >= 0) at = i + 1 }
    const created = await tx.sheet.create({
      data: { folder_id: folderId, kind: 'rows', name: nextSheetName(tabs.map(t => t.name ?? ''), pattern), position: at, linked: false, space_id: spaceId, brand_id: brandId, created_by: m.id, updated_by: m.id },
    })
    const order = [...tabs.slice(0, at).map(t => t.id), created.id, ...tabs.slice(at).map(t => t.id)]
    for (let i = 0; i < order.length; i++) await tx.sheet.update({ where: { id: order[i] }, data: { position: i } })
    await tx.sheetFolder.update({ where: { id: folderId }, data: { updated_at: new Date(), updated_by: m.id } })
    return tx.sheet.findUniqueOrThrow({ where: { id: created.id } })
  })
  done()
  return { success: true, sheet: summaryOf(tab) }
}

/** Duplicate: a copy of the rows and groups, unlinked. No task is made; copied linked rows remember their task. */
export async function duplicateTab(sheetId: string, opts: { pattern?: string } = {}): Promise<{ success: true; sheet: SheetSummary } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const got = await tabFor(sheetId, m, false)
  if (!got.ok) return fail(got.error)
  const src = got.tab
  const pattern = opts.pattern && opts.pattern.includes('{n}') && opts.pattern.length <= 40 ? opts.pattern : 'Sheet {n}'
  const tab = await prisma.$transaction(async tx => {
    const tabs = await tx.sheet.findMany({ where: { folder_id: src.folder_id }, orderBy: { position: 'asc' }, select: { id: true, name: true } })
    const at = tabs.findIndex(t => t.id === src.id) + 1
    const copy = await tx.sheet.create({
      data: { folder_id: src.folder_id, kind: 'rows', name: nextSheetName(tabs.map(t => t.name ?? ''), pattern), position: at, linked: false, space_id: src.space_id, brand_id: src.brand_id, created_by: m.id, updated_by: m.id },
    })
    const order = [...tabs.slice(0, at).map(t => t.id), copy.id, ...tabs.slice(at).map(t => t.id)]
    for (let i = 0; i < order.length; i++) await tx.sheet.update({ where: { id: order[i] }, data: { position: i } })
    const themes = await tx.contentSheetTheme.findMany({ where: { sheet_id: src.id } })
    if (themes.length) await tx.contentSheetTheme.createMany({ data: themes.map(t => ({ project_id: t.project_id, sheet_id: copy.id, position: t.position, pillar_order: t.pillar_order, created_by: m.id })) })
    // Parents first, so children can point at the copies.
    const rows = await tx.contentRow.findMany({ where: { sheet_id: src.id }, orderBy: [{ parent_id: { sort: 'asc', nulls: 'first' } }, { position: 'asc' }] })
    const ids = new Map<string, string>()
    const tasks = rows.some(r => r.task_id) ? await tx.task.findMany({ where: { id: { in: rows.map(r => r.task_id).filter((x): x is string => !!x) } }, select: { id: true, name: true } }) : []
    for (const r of rows.filter(x => !x.parent_id).concat(rows.filter(x => x.parent_id))) {
      const made = await tx.contentRow.create({
        data: {
          sheet_id: copy.id, project_id: r.project_id, pillar_id: r.pillar_id, parent_id: r.parent_id ? ids.get(r.parent_id) ?? null : null,
          position: r.position, title: (r.task_id && tasks.find(t => t.id === r.task_id)?.name) || r.title, date: r.date, values: r.values ?? {},
          task_id: null, last_task_id: r.task_id ?? r.last_task_id, created_by: m.id,
        },
      })
      ids.set(r.id, made.id)
    }
    return copy
  })
  done()
  return { success: true, sheet: summaryOf(tab) }
}

/** Delete a tab, after the person confirmed: the tab and its rows go; tasks stay on the board. */
export async function deleteTab(sheetId: string): Promise<{ success: true; removedRows: number } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const got = await tabFor(sheetId, m, true)
  if (!got.ok) return fail(got.error)
  const tab = got.tab
  const removed = await prisma.$transaction(async tx => {
    const n = await tx.contentRow.count({ where: { sheet_id: tab.id } })
    await tx.contentRow.updateMany({ where: { sheet_id: tab.id }, data: { parent_id: null } })
    await tx.contentRow.deleteMany({ where: { sheet_id: tab.id } })
    await tx.contentSheetTheme.deleteMany({ where: { sheet_id: tab.id } })
    await tx.sheet.delete({ where: { id: tab.id } })
    const rest = await tx.sheet.findMany({ where: { folder_id: tab.folder_id }, orderBy: { position: 'asc' }, select: { id: true } })
    for (let i = 0; i < rest.length; i++) await tx.sheet.update({ where: { id: rest[i].id }, data: { position: i } })
    return n
  })
  done()
  return { success: true, removedRows: removed }
}

/** The fields a tab's column can stand for: the standard ones and the field library, by name. */
async function fieldChoices(): Promise<FieldChoice[]> {
  const lib = await prisma.taskField.findMany({ where: { retired_at: null }, select: { id: true, name_en: true, name_ar: true } })
  return [...STANDARD_LINK_FIELDS, ...lib.map(f => ({ key: `f:${f.id}` as LinkField, names: [f.name_en, ...(f.name_ar ? [f.name_ar] : [])] }))]
}

async function tabRows(sheetId: string): Promise<(TabRow & { position: number; parentId: string | null })[]> {
  const rows = await prisma.contentRow.findMany({ where: { sheet_id: sheetId }, orderBy: { position: 'asc' } })
  return rows.map(r => ({
    id: r.id, title: r.title, taskId: r.task_id, lastTaskId: r.last_task_id, position: r.position, parentId: r.parent_id,
    values: r.values && typeof r.values === 'object' && !Array.isArray(r.values) ? (r.values as Record<string, string>) : {},
  }))
}

export interface TabLinkPreview {
  space: { id: string; name: string } | null
  /** A Brand page's tab has no Space yet: the Spaces to choose from (spec 027: "it asks which Space"). */
  spaces: { id: string; name: string }[]
  /** The tab's own columns, each with the task field its name matches ('sheet': stays on the row). */
  columns: { column: string; name: string; field: LinkField | 'sheet' }[]
  fields: { key: LinkField; name: string }[]
  create: number
  reconnect: number
  linked: number
  /** Untitled rows stay plain: their row numbers in the tab. */
  untitled: number[]
  conflicts: number
}

/** What "Link to board" would do, before anything is created. */
export async function tabLinkPreview(sheetId: string): Promise<({ success: true } & TabLinkPreview) | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const got = await tabFor(sheetId, m, true)
  if (!got.ok) return fail(got.error)
  const tab = got.tab
  if (tab.linked) return fail('already_linked')
  const [rows, cols, choices, space] = await Promise.all([
    tabRows(tab.id),
    prisma.sheetColumn.findMany({ where: { sheet: tabSheetId(tab.id), deleted_at: null }, orderBy: { position: 'asc' }, select: { key: true, name: true } }),
    fieldChoices(),
    tab.space_id ? prisma.teamSpace.findUnique({ where: { id: tab.space_id }, select: { id: true, name: true } }) : null,
  ])
  const spaces = space ? [] : await prisma.teamSpace.findMany({ where: { archived_at: null, media_board: null }, orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }], select: { id: true, name: true } })
  const remembered = rows.map(r => r.lastTaskId).filter((x): x is string => !!x)
  const alive = new Set(remembered.length ? (await prisma.task.findMany({ where: { id: { in: remembered } }, select: { id: true } })).map(t => t.id) : [])
  const tops = rows.filter(r => !r.parentId)
  const p = linkPreview(tops, id => alive.has(id))
  const matches = matchColumns(cols.map(c => ({ id: c.key, name: c.name ?? c.key })), choices)
  const lib = await prisma.taskField.findMany({ where: { retired_at: null }, select: { id: true, name_en: true } })
  const fieldName = (k: string) => (k.startsWith('f:') ? lib.find(f => `f:${f.id}` === k)?.name_en ?? k : k)
  return {
    success: true,
    space,
    spaces,
    columns: matches.map(x => ({ column: x.column, name: cols.find(c => c.key === x.column)?.name ?? x.column, field: x.field })),
    fields: choices.map(c => ({ key: c.key, name: fieldName(c.key) })),
    create: p.create.length, reconnect: p.reconnect.length, linked: p.linked.length, conflicts: p.conflicts.length,
    untitled: p.untitled.map(id => tops.findIndex(r => r.id === id) + 1),
  }
}

/** A column value as the row's own key for the task: `f:<id>` stays; built-ins come back separately. */
function applyMatches(values: Record<string, string>, matches: Match[]): { values: Record<string, string>; builtIn: Partial<Record<LinkField, string>> } {
  const out = { ...values }
  const builtIn: Partial<Record<LinkField, string>> = {}
  for (const mt of matches) {
    if (mt.field === 'sheet') continue
    const v = (values[mt.column] ?? '').trim()
    if (!v) continue
    if (mt.field.startsWith('f:')) { out[mt.field] = v; delete out[mt.column] }
    else builtIn[mt.field] = v
  }
  return { values: out, builtIn }
}

/**
 * Link to board: every titled row becomes a task on the tab's Space board (reconnecting the rows that
 * had one), by the confirmed column matches. Untitled rows stay plain. A second call creates nothing.
 */
export async function linkTab(sheetId: string, matchesIn: Match[] = [], spaceIdIn?: string | null): Promise<{ success: true; created: number; reconnected: number; problems: string[] } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const got = await tabFor(sheetId, m, true)
  if (!got.ok) return fail(got.error)
  const tab = got.tab
  // A Brand page's tab: linking it chooses the Space whose board its rows become tasks on.
  if (!tab.space_id && spaceIdIn && UUID.test(spaceIdIn) && await prisma.teamSpace.findFirst({ where: { id: spaceIdIn, archived_at: null }, select: { id: true } })) {
    await prisma.sheet.update({ where: { id: tab.id }, data: { space_id: spaceIdIn } })
    tab.space_id = spaceIdIn
  }
  if (!tab.space_id) return fail('needs_space')
  const choices = await fieldChoices()
  const known = new Set(choices.map(c => c.key as string))
  const matches = (Array.isArray(matchesIn) ? matchesIn : []).filter(x => x && typeof x.column === 'string' && (x.field === 'sheet' || known.has(x.field))).slice(0, 200)
  const rows = await tabRows(tab.id)
  const remembered = rows.map(r => r.lastTaskId).filter((x): x is string => !!x)
  const alive = new Set(remembered.length ? (await prisma.task.findMany({ where: { id: { in: remembered } }, select: { id: true } })).map(t => t.id) : [])
  const tops = rows.filter(r => !r.parentId)
  const plan = linkPreview(tops, id => alive.has(id))
  // Linked first, so a new row typed in while this runs is a task too.
  await prisma.sheet.update({ where: { id: tab.id }, data: { linked: true, updated_by: m.id, updated_at: new Date() } })
  const members = await prisma.member.findMany({ select: { id: true, name: true } })
  const brands = await prisma.brand.findMany({ select: { id: true, name: true } })
  const byName = <T extends { name: string }>(list: T[], v: string) => list.find(x => x.name.trim().toLowerCase() === v.trim().toLowerCase())
  let created = 0, reconnected = 0
  const problems: string[] = []
  for (const id of [...plan.reconnect, ...plan.create]) {
    const row = tops.find(r => r.id === id)!
    const { values, builtIn } = applyMatches(row.values, matches)
    const date = builtIn.publish && isDay(builtIn.publish) ? dayDate(builtIn.publish) : undefined
    await prisma.contentRow.update({ where: { id }, data: { values, ...(date ? { date } : {}) } })
    const r = await makeTask(id, {
      spaceId: tab.space_id, type: builtIn.type ?? null,
      brandId: builtIn.brand ? byName(brands, builtIn.brand)?.id ?? null : null,
      assigneeId: builtIn.assignee ? byName(members, builtIn.assignee)?.id ?? null : null,
    })
    if (!r.success) { problems.push(r.error); continue }
    if (plan.reconnect.includes(id)) reconnected++; else created++
  }
  done()
  return { success: true, created, reconnected, problems: [...new Set(problems)] }
}

/** Unlink from board: the tasks stay; each row keeps its last values and remembers its task. */
export async function unlinkTab(sheetId: string): Promise<{ success: true; rows: number } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const got = await tabFor(sheetId, m, true)
  if (!got.ok) return fail(got.error)
  const tab = got.tab
  await prisma.sheet.update({ where: { id: tab.id }, data: { linked: false, updated_by: m.id, updated_at: new Date() } })
  const linked = await prisma.contentRow.findMany({ where: { sheet_id: tab.id, task_id: { not: null } }, select: { id: true } })
  for (const r of linked) await unlinkRow(r.id)
  done()
  return { success: true, rows: linked.length }
}

/** + Add existing task: the tasks become rows of the tab (a task once per tab), under their theme when the tab has it. */
export async function addExistingTasks(sheetId: string, taskIds: string[]): Promise<{ success: true; added: number } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const got = await tabFor(sheetId, m, false)
  if (!got.ok) return fail(got.error)
  const tab = got.tab
  const ids = (Array.isArray(taskIds) ? taskIds : []).filter(x => typeof x === 'string' && UUID.test(x)).slice(0, 200)
  if (!ids.length) return { success: true, added: 0 }
  const [tasks, have, themes, last] = await Promise.all([
    prisma.task.findMany({ where: { id: { in: ids }, dropped_at: null } }),
    prisma.contentRow.findMany({ where: { sheet_id: tab.id, task_id: { in: ids } }, select: { task_id: true } }),
    prisma.contentSheetTheme.findMany({ where: { sheet_id: tab.id }, select: { project_id: true } }),
    prisma.contentRow.aggregate({ where: { sheet_id: tab.id }, _max: { position: true } }),
  ])
  const onTab = new Set(themes.map(t => t.project_id))
  const skip = new Set(have.map(h => h.task_id))
  let pos = last._max.position ?? 0
  let added = 0
  for (const t of tasks) {
    if (skip.has(t.id)) continue
    if (!canActOn(await withAssignees(t), m) && !isLead(m)) continue
    const theme = t.project_id && onTab.has(t.project_id) ? t.project_id : null
    await prisma.contentRow.create({ data: { sheet_id: tab.id, project_id: theme, pillar_id: theme ? t.pillar_id : null, title: t.name, task_id: t.id, position: ++pos, created_by: m.id } })
    added++
  }
  done()
  return { success: true, added }
}

/**
 * Remove a row from a tab: 'tab' takes the row off this tab only (the task stays; child rows move up a
 * level); 'archive' archives the row's task and keeps the row.
 */
export async function removeTabRow(rowId: string, mode: 'tab' | 'archive'): Promise<{ success: true } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const row = typeof rowId === 'string' && UUID.test(rowId) ? await prisma.contentRow.findUnique({ where: { id: rowId } }) : null
  if (!row || !row.sheet_id) return fail('not_found')
  const got = await tabFor(row.sheet_id, m, false)
  if (!got.ok) return fail(got.error)
  if (mode === 'archive') {
    // The row stays, its task archived (it shows as archived, with Restore, like on the board).
    if (!row.task_id) return fail('not_linked')
    const r = await dropTask(row.task_id)
    if (!r.success) return fail(r.error ?? 'not_authorized')
    done()
    return { success: true }
  }
  if (row.task_id) {
    const t = await prisma.task.findUnique({ where: { id: row.task_id } })
    if (t && !canActOn(await withAssignees(t), m) && got.tab.created_by !== m.id && !isLead(m)) return fail('not_authorized')
  }
  await prisma.$transaction([
    prisma.contentRow.updateMany({ where: { parent_id: row.id }, data: { parent_id: null } }),
    prisma.contentRow.delete({ where: { id: row.id } }),
  ])
  done()
  return { success: true }
}

/**
 * Paste plan into an added tab (spec 027 §5): each pasted line is a row of the tab, under the theme
 * and pillar it was pasted on (or the theme its Theme column names, when the tab has it), with its
 * values by column. In a linked tab each titled row becomes a task. At most 200 lines.
 */
export async function pasteTabRows(sheetId: string, target: { projectId: string | null; pillarId?: string | null } | null,
  lines: { title: string; theme?: string; pillar?: string; custom?: Record<string, string> }[]): Promise<{ success: true; rowsCreated: string[]; created: string[] } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const got = await tabFor(sheetId, m, false)
  if (!got.ok) return fail(got.error)
  const tab = got.tab
  const list = (Array.isArray(lines) ? lines : []).slice(0, 200)
  const [themes, cols, last] = await Promise.all([
    prisma.contentSheetTheme.findMany({ where: { sheet_id: tab.id }, include: { project: { include: { pillars: true } } } }),
    prisma.sheetColumn.findMany({ where: { sheet: tabSheetId(tab.id), deleted_at: null }, select: { id: true, key: true } }),
    prisma.contentRow.aggregate({ where: { sheet_id: tab.id }, _max: { position: true } }),
  ])
  const norm = (x: string) => x.trim().toLowerCase()
  const keyOf = new Map(cols.map(c => [c.id, c.key]))
  const onTab = (id: string | null | undefined) => (id && themes.some(t => t.project_id === id) ? id : null)
  let pos = last._max.position ?? 0
  const rowsCreated: string[] = [], created: string[] = []
  for (const line of list) {
    const title = typeof line?.title === 'string' ? line.title.replace(/\s+/g, ' ').trim().slice(0, 300) : ''
    if (!title) continue
    const named = line.theme ? themes.find(t => norm(t.project.name) === norm(line.theme!)) : undefined
    const projectId = onTab(target?.projectId) ?? named?.project_id ?? null
    const pillars = themes.find(t => t.project_id === projectId)?.project.pillars ?? []
    const pillarId = projectId
      ? (target?.pillarId && pillars.some(p => p.id === target.pillarId) ? target.pillarId : line.pillar ? pillars.find(p => norm(p.name) === norm(line.pillar!))?.id ?? null : null)
      : null
    const values: Record<string, string> = {}
    for (const [colId, v] of Object.entries(line.custom ?? {}).slice(0, 60)) { const k = keyOf.get(colId); if (k && typeof v === 'string' && v.trim()) values[k] = v.slice(0, 5000) }
    const row = await prisma.contentRow.create({ data: { sheet_id: tab.id, project_id: projectId, pillar_id: pillarId, title, values, position: ++pos, created_by: m.id } })
    rowsCreated.push(row.id)
    if (tab.linked) { const r = await makeTask(row.id, { spaceId: tab.space_id }); if (r.success) created.push(r.taskId) }
  }
  done()
  return { success: true, rowsCreated, created }
}
