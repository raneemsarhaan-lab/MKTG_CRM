'use server'

/**
 * A blank sheet's columns linked to board tasks (spec 016, contracts/server.md).
 *
 * Every change to a task goes through the board's own actions, so the same
 * people may change the same things, stage moves follow the same rules and
 * celebrate the same way, and links and members are checked the same way
 * (research R5). This file only routes, checks the sheet, and keeps snapshots.
 */
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import type { LinkedTask, SheetTaskMap, StageId, TaskField, TaskFieldResult, TaskFieldValues, TaskFieldWrite } from '@/types/index'
import { STAGE_META } from '@/lib/stage-meta'
import { matchMember, matchPriority, matchStage, readDay, taskLink } from '@/lib/sheet-links'
import { linkedTasks, resolveCells, snapshotOf, teamColumns } from '@/lib/sheet-links-server'
import { createTask, setTaskStage, updateTask } from './tasks'
import { setPieceLink, updatePiece } from './content'
import { setValue } from './sheet-columns'

type Fail = { success: false; error: string }
const fail = (error: string): Fail => ({ success: false, error })
const MAX_WRITES = 2000
const MAX_CREATE = 200
const isAdmin = (m: { access: string }) => m.access === 'admin'
const isId = (x: unknown): x is string => typeof x === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x)

type SheetOk = { ok: true; m: NonNullable<Awaited<ReturnType<typeof getSessionMember>>>; map: SheetTaskMap | null }
/** The sheet, checked: it exists, it is blank, and this member may edit it (spec 013 protection). */
async function sheetFor(sheetId: string): Promise<SheetOk | { ok: false; error: string }> {
  const m = await getSessionMember()
  if (!m) return { ok: false, error: 'not_authenticated' }
  if (typeof sheetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(sheetId)) return { ok: false, error: 'gone' }
  const sheet = await prisma.sheet.findUnique({ where: { id: sheetId }, select: { kind: true, protected_by: true, task_map: true } })
  if (!sheet) return { ok: false, error: 'gone' }
  if (sheet.kind !== 'blank') return { ok: false, error: 'not_blank' }
  if (sheet.protected_by && sheet.protected_by !== m.id && !isAdmin(m)) return { ok: false, error: 'protected' }
  return { ok: true, m, map: (sheet.task_map ?? null) as SheetTaskMap | null }
}

// ─── linking rows (US1) ──────────────────────────────────────────────────────

export interface LinkAnswer {
  success: true
  linked: { rowId: string; taskId: string }[]
  ambiguous: { rowId: string; text: string; choices: { id: string; name: string; stage: string; project: string; assignee: string }[] }[]
  unmatched: { rowId: string; text: string }[]
  /** Rows that were linked and now aren't (their Task cell is empty or names nothing). */
  cleared: string[]
  tasks: Record<string, LinkedTask>
}

/** Resolve Task cells and save each row's task (R3). The client records the undo step from the answer. */
export async function resolveTaskCells(sheetId: string, cells: { rowId: string; text: string }[]): Promise<LinkAnswer | Fail> {
  const s = await sheetFor(sheetId)
  if (!s.ok) return fail(s.error)
  const list = (Array.isArray(cells) ? cells : []).filter(c => c && isId(c.rowId) && typeof c.text === 'string').slice(0, MAX_WRITES).map(c => ({ rowId: c.rowId, text: c.text.slice(0, 500) }))
  const rows = await prisma.sheetRow.findMany({ where: { sheet_id: sheetId, id: { in: list.map(c => c.rowId) } }, select: { id: true, task_id: true } })
  const real = new Map(rows.map(r => [r.id, r.task_id]))
  const mine = list.filter(c => real.has(c.rowId))
  const r = await resolveCells(mine)
  // A row whose cell names nothing (or several tasks) is no longer linked.
  const cleared = [...r.empty, ...r.unmatched.map(x => x.rowId), ...r.ambiguous.map(x => x.rowId)].filter(id => real.get(id))
  const sets = [...r.linked.map(x => ({ rowId: x.rowId, taskId: x.taskId as string | null })), ...cleared.map(rowId => ({ rowId, taskId: null }))]
  if (sets.length) {
    await prisma.$executeRaw`UPDATE sheet_rows s SET task_id = t.tid FROM unnest(${sets.map(x => x.rowId)}::uuid[], ${sets.map(x => x.taskId)}::text[]::uuid[]) AS t(rid, tid)
      WHERE s.id = t.rid AND s.sheet_id = ${sheetId}::uuid`
  }
  const choiceIds = [...new Set(r.ambiguous.flatMap(a => a.choices))]
  const choiceRows = choiceIds.length ? await prisma.task.findMany({
    where: { id: { in: choiceIds } },
    select: { id: true, name: true, status: true, project: { select: { name: true } }, assignee: { select: { name: true } } },
  }) : []
  const byId = new Map(choiceRows.map(c => [c.id, { id: c.id, name: c.name, stage: c.status, project: c.project?.name ?? '', assignee: c.assignee?.name ?? '' }]))
  return {
    success: true,
    linked: r.linked,
    ambiguous: r.ambiguous.map(a => ({ rowId: a.rowId, text: a.text, choices: a.choices.map(id => byId.get(id)!).filter(Boolean) })),
    unmatched: r.unmatched,
    cleared,
    tasks: await linkedTasks(r.linked.map(x => x.taskId), s.map, s.m),
  }
}

/** Make a column the Task column (keeping the other fields) and resolve every row in it. */
export async function linkColumn(sheetId: string, colId: string): Promise<(LinkAnswer & { taskMap: SheetTaskMap }) | Fail> {
  const s = await sheetFor(sheetId)
  if (!s.ok) return fail(s.error)
  const col = await prisma.sheetCol.findFirst({ where: { id: colId, sheet_id: sheetId }, select: { id: true } })
  if (!col) return fail('gone')
  const fields = { ...(s.map?.fields ?? {}) }
  delete fields[colId]
  const taskMap: SheetTaskMap = { taskCol: colId, fields }
  await prisma.sheet.update({ where: { id: sheetId }, data: { task_map: taskMap as never } })
  const cells = await prisma.sheetRow.findMany({ where: { sheet_id: sheetId }, select: { id: true, cells: { where: { col_id: colId }, select: { value: true } } } })
  const res = await resolveTaskCells(sheetId, cells.map(r => ({ rowId: r.id, text: r.cells[0]?.value ?? '' })))
  if (!res.success) return res
  return { ...res, taskMap, tasks: await linkedTasks(res.linked.map(x => x.taskId), taskMap, s.m) }
}

// ─── writing mapped cells (US2) ──────────────────────────────────────────────

const LINK_ROLE = { 'link:doc': 'working_doc', 'link:design': 'design' } as const
const stageList = () => (Object.keys(STAGE_META) as StageId[]).map(id => ({ id, names: [STAGE_META[id].label_en, STAGE_META[id].label_ar] }))

/** One mapped cell to its task, through the board's own action. Null = saved; otherwise the reason. */
async function writeOne(taskId: string, field: TaskField, raw: string, ctx: { members: { id: string; name: string }[]; themes: { id: string; name: string }[]; types: string[] }): Promise<{ error?: string; celebrate?: boolean }> {
  const v = raw.trim()
  const r = (x: { success: boolean; error?: string }) => (x.success ? {} : { error: x.error ?? 'generic' })
  switch (field) {
    case 'title': return v ? r(await updateTask(taskId, { name: v })) : { error: 'bad_value' }
    case 'due': { const d = readDay(v); return d ? r(await updateTask(taskId, { due_date: d })) : { error: 'bad_date' } }
    case 'priority': { const p = matchPriority(v); return p ? r(await updateTask(taskId, { priority: p })) : { error: 'bad_value' } }
    case 'platform': return r(await updateTask(taskId, { platform: v }))
    case 'type': { const t = ctx.types.find(x => x.toLowerCase() === v.toLowerCase()); return v && !t ? { error: 'bad_value' } : r(await updateTask(taskId, { content_type_label: t ?? '' })) }
    case 'assignee': case 'owner': {
      if (!v) return field === 'owner' ? { error: 'bad_value' } : r(await updateTask(taskId, { assignee_id: null }))
      const m = matchMember(v, ctx.members)
      if (m === 'none') return { error: 'unknown_member' }
      if (m === 'ambiguous') return { error: 'ambiguous_member' }
      return r(await updateTask(taskId, field === 'owner' ? { task_owner_id: m.id } : { assignee_id: m.id }))
    }
    case 'stage': {
      const id = matchStage(v, stageList())
      if (!id) return { error: 'bad_stage' }
      const res = await setTaskStage(taskId, id as StageId)
      return res.success ? { celebrate: res.shouldCelebrate } : { error: res.error === 'not_authorized' ? 'not_allowed_move' : res.error ?? 'generic' }
    }
    case 'theme': {
      const t = ctx.themes.find(x => x.name.trim().toLowerCase() === v.toLowerCase())
      return t ? r(await updateTask(taskId, { project_id: t.id })) : { error: 'bad_value' }
    }
    case 'pillar': {
      if (!v) return r(await updatePiece(taskId, { pillar_id: null }))
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { project_id: true } })
      const p = task?.project_id ? await prisma.contentPillar.findFirst({ where: { project_id: task.project_id, name: { equals: v, mode: 'insensitive' } }, select: { id: true } }) : null
      return p ? r(await updatePiece(taskId, { pillar_id: p.id })) : { error: 'bad_value' }
    }
    case 'link:doc': case 'link:design': return r(await setPieceLink(taskId, LINK_ROLE[field], v))
    case 'link:post': return r(await updatePiece(taskId, { post_url: v || null }))
    case 'link:published': return r(await updatePiece(taskId, { published_url: v || null }))
    default: {
      const res = await setValue(field.slice(4), taskId, v)
      return res.success ? {} : { error: res.error }
    }
  }
}

/**
 * Save mapped cells to their tasks (R5). Each write is checked on its own;
 * a refusal never stops the rest. Saved writes keep a snapshot in the sheet
 * cell (R7), so unmapping or a deleted task leaves the last value.
 */
export async function writeTaskFields(sheetId: string, writes: TaskFieldWrite[]): Promise<{ success: true; results: TaskFieldResult[]; tasks: Record<string, LinkedTask> } | Fail> {
  const s = await sheetFor(sheetId)
  if (!s.ok) return fail(s.error)
  if (!s.map) return fail('not_linked')
  const list = (Array.isArray(writes) ? writes : []).filter(w => w && isId(w.rowId) && typeof w.field === 'string')
  if (list.length > MAX_WRITES) return fail('too_many')
  const colOf = new Map(Object.entries(s.map.fields).map(([c, f]) => [f, c]))
  const rows = await prisma.sheetRow.findMany({ where: { sheet_id: sheetId, id: { in: list.map(w => w.rowId) } }, select: { id: true, task_id: true } })
  const taskOf = new Map(rows.map(r => [r.id, r.task_id]))
  const before = await linkedTasks([...new Set(rows.map(r => r.task_id).filter((x): x is string => !!x))], s.map, s.m)
  const needs = (f: string) => list.some(w => w.field === f)
  const [members, themes, types] = await Promise.all([
    needs('assignee') || needs('owner') ? prisma.member.findMany({ select: { id: true, name: true } }) : [],
    needs('theme') ? prisma.project.findMany({ where: { is_theme: true }, select: { id: true, name: true } }) : [],
    needs('type') ? prisma.contentType.findMany({ select: { label: true } }).then(r => r.map(x => x.label)) : [],
  ])
  const results: TaskFieldResult[] = []
  const snaps: { rowId: string; colId: string; value: string }[] = []
  for (const w of list) {
    const field = w.field, value = typeof w.value === 'string' ? w.value.slice(0, 5000) : ''
    const taskId = taskOf.get(w.rowId)
    const col = colOf.get(field)
    if (!col) { results.push({ rowId: w.rowId, field, ok: false, reason: 'not_mapped' }); continue }
    if (!taskId) { results.push({ rowId: w.rowId, field, ok: false, reason: 'not_linked' }); continue }
    const t = before[taskId]
    if (!t) { results.push({ rowId: w.rowId, field, ok: false, reason: 'gone' }); continue }
    if (!t.applies.includes(field)) { results.push({ rowId: w.rowId, field, ok: false, reason: 'not_applicable' }); continue }
    if (t.dropped && field !== 'stage') { results.push({ rowId: w.rowId, field, ok: false, reason: 'dropped' }); continue }
    if (field !== 'stage' && !t.editable) { results.push({ rowId: w.rowId, field, ok: false, reason: 'not_authorized' }); continue }
    if ((t.values[field] ?? '') === value.trim()) { results.push({ rowId: w.rowId, field, ok: true, shown: value.trim() }); continue }
    const out = await writeOne(taskId, field, value, { members, themes, types })
    if (out.error) { results.push({ rowId: w.rowId, field, ok: false, reason: out.error }); continue }
    const stageLabel = field === 'stage' ? STAGE_META[matchStage(value, stageList()) as StageId]?.label_en : undefined
    results.push({ rowId: w.rowId, field, ok: true, celebrate: out.celebrate, stageLabel })
  }
  const after = await linkedTasks(Object.keys(before), s.map, s.m)
  for (const r of results) {
    if (!r.ok) continue
    const tid = taskOf.get(r.rowId)!
    const shown = after[tid]?.values[r.field] ?? ''
    r.shown = shown
    snaps.push({ rowId: r.rowId, colId: colOf.get(r.field)!, value: snapshotOf(r.field, shown) })
  }
  await writeSnapshots(sheetId, s.m.id, snaps)
  if (results.some(r => r.ok)) revalidatePath('/board')
  return { success: true, results, tasks: after }
}

/** Snapshot cells (R7): the last value the sheet showed for a mapped field. */
async function writeSnapshots(sheetId: string, by: string, snaps: { rowId: string; colId: string; value: string }[]) {
  const put = snaps.filter(x => x.value !== ''), clear = snaps.filter(x => x.value === '')
  if (clear.length) {
    await prisma.$executeRaw`DELETE FROM sheet_cells WHERE sheet_id = ${sheetId}::uuid AND (row_id, col_id) IN (
      SELECT * FROM unnest(${clear.map(c => c.rowId)}::uuid[], ${clear.map(c => c.colId)}::uuid[]))`
  }
  if (put.length) {
    await prisma.$executeRaw`INSERT INTO sheet_cells (sheet_id, row_id, col_id, value, updated_by, updated_at)
      SELECT ${sheetId}::uuid, r, c, v, ${by}::uuid, now()
      FROM unnest(${put.map(c => c.rowId)}::uuid[], ${put.map(c => c.colId)}::uuid[], ${put.map(c => c.value)}::text[]) AS t(r, c, v)
      ON CONFLICT (row_id, col_id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`
  }
}

/**
 * Board changes for an open sheet (R6): linked tasks' mapped fields, with
 * snapshots brought up to date. Rows whose task was deleted are listed as gone.
 */
export async function refreshTaskFields(sheetId: string): Promise<{ success: true; tasks: Record<string, LinkedTask>; rowTasks: Record<string, string>; gone: string[]; cells: { rowId: string; colId: string; value: string }[] } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const sheet = await prisma.sheet.findUnique({ where: { id: sheetId }, select: { kind: true, task_map: true } })
  if (!sheet || sheet.kind !== 'blank') return fail('gone')
  const map = (sheet.task_map ?? null) as SheetTaskMap | null
  const rows = await prisma.sheetRow.findMany({ where: { sheet_id: sheetId, task_id: { not: null } }, select: { id: true, task_id: true } })
  const tasks = map ? await linkedTasks(rows.map(r => r.task_id!), map, m) : {}
  const cells: { rowId: string; colId: string; value: string }[] = []
  if (map) {
    const have = await prisma.sheetCell.findMany({ where: { sheet_id: sheetId, row_id: { in: rows.map(r => r.id) }, col_id: { in: Object.keys(map.fields) } }, select: { row_id: true, col_id: true, value: true } })
    const cur = new Map(have.map(c => [`${c.row_id}|${c.col_id}`, c.value]))
    for (const r of rows) {
      const t = tasks[r.task_id!]
      if (!t) continue
      for (const [colId, f] of Object.entries(map.fields)) {
        if (!t.applies.includes(f)) continue
        const v = snapshotOf(f, t.values[f] ?? '')
        if ((cur.get(`${r.id}|${colId}`) ?? '') !== v) cells.push({ rowId: r.id, colId, value: v })
      }
    }
    if (cells.length) await writeSnapshots(sheetId, m.id, cells)
  }
  // `task_id` is set null when a task is deleted; rows the client still thinks are linked find out here.
  return { success: true, tasks, rowTasks: Object.fromEntries(rows.map(r => [r.id, r.task_id!])), gone: [], cells }
}

/** Values of these tasks under a mapping not saved yet (linking, Choose a task, Add tasks). Snapshots are left to the client's undo step. */
export async function taskValues(sheetId: string, taskIds: string[], map: SheetTaskMap | null): Promise<{ success: true; tasks: Record<string, LinkedTask> } | Fail> {
  const s = await sheetFor(sheetId)
  if (!s.ok) return fail(s.error)
  const ids = (Array.isArray(taskIds) ? taskIds : []).filter(x => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x)).slice(0, MAX_WRITES)
  const m = map ?? s.map
  if (!m || typeof m.taskCol !== 'string' || typeof m.fields !== 'object') return { success: true, tasks: {} }
  const team = new Set((await teamColumns()).map(c => c.id))
  const fields = Object.fromEntries(Object.entries(m.fields).filter(([, f]) => typeof f === 'string' && (!f.startsWith('col:') || team.has(f.slice(4))))) as SheetTaskMap['fields']
  return { success: true, tasks: await linkedTasks(ids, { taskCol: m.taskCol, fields }, s.m) }
}

// ─── finding and creating tasks (US3, US4) ───────────────────────────────────

export interface TaskHit { id: string; name: string; stage: string; project: string; assignee: string; dropped: boolean }
/** Tasks for Choose a task and Add tasks…: title matches first, then the rest; up to 50. */
export async function searchTasks(query: string, filters: { stage?: string; personId?: string; projectId?: string } = {}): Promise<{ success: true; tasks: TaskHit[] } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const q = (typeof query === 'string' ? query : '').trim().slice(0, 200)
  const where = {
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(filters.stage ? { status: filters.stage } : {}),
    ...(filters.personId ? { OR: [{ assignee_id: filters.personId }, { task_owner_id: filters.personId }] } : {}),
    ...(filters.projectId ? { project_id: filters.projectId } : {}),
  }
  const rows = await prisma.task.findMany({
    where, take: 50, orderBy: [{ dropped_at: { sort: 'asc', nulls: 'first' } }, { updated_at: 'desc' }],
    select: { id: true, name: true, status: true, dropped_at: true, project: { select: { name: true } }, assignee: { select: { name: true } } },
  })
  const exact = (n: string) => (q && n.toLowerCase() === q.toLowerCase() ? 0 : 1)
  return {
    success: true,
    tasks: rows.sort((a, b) => exact(a.name) - exact(b.name)).map(t => ({ id: t.id, name: t.name, stage: t.status, project: t.project?.name ?? '', assignee: t.assignee?.name ?? '', dropped: !!t.dropped_at })),
  }
}

/** What Add tasks… and the mapping dialog offer: projects, people and the team columns. */
export async function linkChoices(): Promise<{ success: true; projects: { id: string; name: string }[]; people: { id: string; name: string }[]; teamCols: { id: string; name: string; sheet: string }[]; canCreate: boolean } | Fail> {
  const m = await getSessionMember()
  if (!m) return fail('not_authenticated')
  const [projects, people, teamCols] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.member.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    teamColumns(),
  ])
  return { success: true, projects, people, teamCols, canCreate: m.access !== 'user' }
}

/**
 * Create a plain board task for each row (R8, clarified Q2): in the first
 * stage, with no project, theme or pillar, owned by the creator unless an
 * owner is given; then link the rows and put the task's link in the Task cell.
 */
export async function createTasksForRows(sheetId: string, rows: { rowId: string; values: TaskFieldValues }[], shared: { due?: string }): Promise<{ success: true; created: { rowId: string; taskId: string; link: string }[]; problems: { rowId: string; reason: string }[]; tasks: Record<string, LinkedTask> } | Fail> {
  const s = await sheetFor(sheetId)
  if (!s.ok) return fail(s.error)
  if (s.m.access === 'user') return fail('not_authorized')
  if (!s.map) return fail('not_linked')
  const list = (Array.isArray(rows) ? rows : []).filter(r => r && isId(r.rowId))
  if (list.length > MAX_CREATE) return fail('too_many')
  const real = new Map((await prisma.sheetRow.findMany({ where: { sheet_id: sheetId, id: { in: list.map(r => r.rowId) } }, select: { id: true, task_id: true } })).map(r => [r.id, r.task_id]))
  const [members, types] = await Promise.all([prisma.member.findMany({ select: { id: true, name: true } }), prisma.contentType.findMany({ select: { label: true } }).then(r => r.map(x => x.label))])
  const sharedDue = readDay(shared?.due ?? '')
  const created: { rowId: string; taskId: string; link: string }[] = []
  const problems: { rowId: string; reason: string }[] = []
  for (const row of list) {
    if (!real.has(row.rowId)) { problems.push({ rowId: row.rowId, reason: 'gone' }); continue }
    if (real.get(row.rowId)) { problems.push({ rowId: row.rowId, reason: 'already_linked' }); continue }
    const v = row.values ?? {}
    const name = (v.title ?? '').trim()
    if (!name) { problems.push({ rowId: row.rowId, reason: 'no_title' }); continue }
    const due = v.due ? readDay(v.due) : sharedDue
    if (!due) { problems.push({ rowId: row.rowId, reason: 'bad_date' }); continue }
    const who = (k: 'assignee' | 'owner') => { const t = (v[k] ?? '').trim(); if (!t) return null; const m = matchMember(t, members); return m === 'none' || m === 'ambiguous' ? 'bad' as const : m.id }
    const assignee = who('assignee'), owner = who('owner')
    if (assignee === 'bad' || owner === 'bad') { problems.push({ rowId: row.rowId, reason: 'unknown_member' }); continue }
    const type = v.type ? types.find(x => x.toLowerCase() === v.type!.trim().toLowerCase()) : undefined
    if (v.type && !type) { problems.push({ rowId: row.rowId, reason: 'bad_type' }); continue }
    const res = await createTask({
      name, brand_id: '', content_type_label: type ?? '', task_owner_id: owner ?? s.m.id, assignee_id: assignee ?? undefined,
      due_date: due, platform: v.platform?.trim() || undefined, project_id: null,
      priority: v.priority ? matchPriority(v.priority) ?? undefined : undefined,
    })
    if (!res.success || !res.id) { problems.push({ rowId: row.rowId, reason: res.error ?? 'generic' }); continue }
    created.push({ rowId: row.rowId, taskId: res.id, link: taskLink(res.id) })
  }
  if (created.length) {
    await prisma.$executeRaw`UPDATE sheet_rows s SET task_id = t.tid FROM unnest(${created.map(x => x.rowId)}::uuid[], ${created.map(x => x.taskId)}::text[]::uuid[]) AS t(rid, tid)
      WHERE s.id = t.rid AND s.sheet_id = ${sheetId}::uuid`
    await writeSnapshots(sheetId, s.m.id, created.map(c => ({ rowId: c.rowId, colId: s.map!.taskCol, value: c.link })))
  }
  return { success: true, created, problems, tasks: await linkedTasks(created.map(c => c.taskId), s.map, s.m) }
}
