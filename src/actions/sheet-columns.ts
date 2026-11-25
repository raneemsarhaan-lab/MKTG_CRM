'use server'

/**
 * Sheet columns you can shape (spec 010 contracts/server.md).
 *
 * Layout changes are open to every signed-in member (FR-003). Each one takes
 * the sheet's advisory lock, re-reads, applies one change and stamps who made
 * it (FR-004). The first layout change on a sheet writes a record for every
 * built-in column at its default position, so a move only renumbers.
 * Values follow the existing row rule: owner, assignee, admin or superuser.
 */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { mapSheetColumn } from '@/lib/mappers'
import {
  BUILT_INS, COLUMN_KINDS, MAX_CUSTOM_COLUMNS, SHEET_SETS, builtInOf, checkName, cleanOptions, clampWidth,
  convertValues, defaultShownIn, isCustomKey, normName, parseValue,
} from '@/lib/sheet-columns'
import type { ChoiceOption, ColumnKind, SheetColumnRecord, SheetId } from '@/types/index'

type Fail = { success: false; error: string }
type Tx = Prisma.TransactionClient

const isSheet = (s: string): s is SheetId => s === 'content' || s === 'video'
const isAdmin = (m: { access: string }) => m.access === 'admin' || m.access === 'superuser'
const done = () => { revalidatePath('/board') }

async function lock(tx: Tx, sheet: SheetId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'sheet-columns:' + sheet}))`
}

/** The sheet's records, writing the built-ins first if the sheet has none (R1). */
async function records(tx: Tx, sheet: SheetId, memberId: string) {
  const live = await tx.sheetColumn.findMany({ where: { sheet, deleted_at: null }, orderBy: { position: 'asc' } })
  if (live.some(r => !isCustomKey(r.key))) {
    // A built-in added to the code since the first change gets its record now, after its predecessor.
    const missing = BUILT_INS[sheet].filter(b => !live.some(r => r.key === b.key))
    if (!missing.length) return live
    const keys = live.map(r => r.key)
    BUILT_INS[sheet].forEach((b, i) => {
      if (keys.includes(b.key)) return
      const before = BUILT_INS[sheet].slice(0, i).reverse().find(x => keys.includes(x.key))
      keys.splice(before ? keys.indexOf(before.key) + 1 : 0, 0, b.key)
    })
    for (const b of missing) {
      await tx.sheetColumn.create({ data: { sheet, key: b.key, position: keys.indexOf(b.key), created_by: memberId, updated_by: memberId } })
    }
    await renumber(tx, sheet, keys)
    return tx.sheetColumn.findMany({ where: { sheet, deleted_at: null }, orderBy: { position: 'asc' } })
  }
  // Only custom columns so far (or none): put the built-ins first, in default order.
  let pos = 0
  for (const b of BUILT_INS[sheet]) {
    await tx.sheetColumn.upsert({
      where: { sheet_key: { sheet, key: b.key } },
      create: { sheet, key: b.key, position: pos++, created_by: memberId, updated_by: memberId },
      update: { position: pos - 1 },
    })
  }
  for (const r of live.filter(x => isCustomKey(x.key))) await tx.sheetColumn.update({ where: { id: r.id }, data: { position: pos++ } })
  return tx.sheetColumn.findMany({ where: { sheet, deleted_at: null }, orderBy: { position: 'asc' } })
}

async function renumber(tx: Tx, sheet: SheetId, keys: string[]) {
  const ordered = ['title', ...keys.filter(k => k !== 'title')]
  for (let i = 0; i < ordered.length; i++) {
    await tx.sheetColumn.updateMany({ where: { sheet, key: ordered[i] }, data: { position: i } })
  }
}

/** Every other column's names, for the uniqueness check: [current, English default]. */
function otherNames(rows: { key: string; name: string | null }[], sheet: SheetId, exceptKey?: string): string[][] {
  const keys = new Set([...BUILT_INS[sheet].map(b => b.key), ...rows.map(r => r.key)])
  return [...keys].filter(k => k !== exceptKey).map(k => {
    const r = rows.find(x => x.key === k)
    return [r?.name ?? '', builtInOf(sheet, k)?.en ?? ''].filter(Boolean)
  })
}

async function fresh(id: string) {
  const r = await prisma.sheetColumn.findUnique({ where: { id }, include: { updater: { select: { name: true } } } })
  return r ? mapSheetColumn(r) : null
}

async function session() {
  const m = await getSessionMember()
  return m ?? null
}

// ── layout ──────────────────────────────────────────────────────────────────

export async function addColumn(sheet: string, input: {
  name: string; kind: ColumnKind; options?: Partial<ChoiceOption>[]; before?: string; after?: string; set?: string
}): Promise<{ success: true; column: SheetColumnRecord } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!isSheet(sheet)) return { success: false, error: 'bad_sheet' }
  if (!COLUMN_KINDS.includes(input.kind)) return { success: false, error: 'bad_kind' }
  const name = normName(input.name ?? '')
  try {
    const id = await prisma.$transaction(async tx => {
      await lock(tx, sheet)
      const rows = await records(tx, sheet, me.id)
      if (rows.filter(r => isCustomKey(r.key)).length >= MAX_CUSTOM_COLUMNS) throw new Error('limit')
      const bad = checkName(name, otherNames(rows, sheet))
      if (bad) throw new Error(`name_${bad}`)
      const options = input.kind === 'choice' ? cleanOptions(input.options ?? [], () => randomUUID().slice(0, 8)) : []
      if (input.kind === 'choice' && !options.length) throw new Error('no_options')
      const newId = randomUUID()
      const key = `c:${newId}`
      const keys = rows.map(r => r.key)
      const at = input.after && keys.includes(input.after) ? keys.indexOf(input.after) + 1
        : input.before && keys.includes(input.before) && input.before !== 'title' ? keys.indexOf(input.before) : keys.length
      keys.splice(Math.max(1, at), 0, key)
      const set = input.set && SHEET_SETS[sheet].includes(input.set) ? input.set : null
      await tx.sheetColumn.create({
        data: {
          id: newId, sheet, key, name, kind: input.kind, options: options as unknown as Prisma.InputJsonValue, position: keys.length,
          shown_default: sheet === 'content' || !set,
          shown_in: sheet === 'video' && set ? [...new Set(['full', set])] : [],
          created_by: me.id, updated_by: me.id,
        },
      })
      await renumber(tx, sheet, keys)
      return newId
    })
    done()
    const column = await fresh(id)
    return column ? { success: true, column } : { success: false, error: 'not_found' }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

export async function renameColumn(sheet: string, key: string, name: string | null): Promise<{ success: true } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!isSheet(sheet)) return { success: false, error: 'bad_sheet' }
  try {
    await prisma.$transaction(async tx => {
      await lock(tx, sheet)
      const rows = await records(tx, sheet, me.id)
      const row = rows.find(r => r.key === key)
      if (!row) throw new Error('not_found')
      const next = name === null ? null : normName(name)
      if (next === null || (builtInOf(sheet, key) && next === builtInOf(sheet, key)?.en)) {
        if (isCustomKey(key)) throw new Error('name_empty')
        await tx.sheetColumn.update({ where: { id: row.id }, data: { name: null, updated_by: me.id, updated_at: new Date() } })
        return
      }
      const bad = checkName(next, otherNames(rows, sheet, key))
      if (bad) throw new Error(`name_${bad}`)
      await tx.sheetColumn.update({ where: { id: row.id }, data: { name: next, updated_by: me.id, updated_at: new Date() } })
    })
    done()
    return { success: true }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

export async function moveColumn(sheet: string, key: string, beforeKey: string | null): Promise<{ success: true } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!isSheet(sheet)) return { success: false, error: 'bad_sheet' }
  if (key === 'title' || beforeKey === 'title') return { success: false, error: 'title_fixed' }
  try {
    await prisma.$transaction(async tx => {
      await lock(tx, sheet)
      const rows = await records(tx, sheet, me.id)
      const keys = rows.map(r => r.key)
      if (!keys.includes(key)) throw new Error('not_found')
      keys.splice(keys.indexOf(key), 1)
      const at = beforeKey && keys.includes(beforeKey) ? keys.indexOf(beforeKey) : keys.length
      keys.splice(Math.max(1, at), 0, key)
      await renumber(tx, sheet, keys)
      await tx.sheetColumn.updateMany({ where: { sheet, key }, data: { updated_by: me.id, updated_at: new Date() } })
    })
    done()
    return { success: true }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

export async function setColumnShown(sheet: string, key: string, set: string, shown: boolean): Promise<{ success: true } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!isSheet(sheet) || !SHEET_SETS[sheet].includes(set)) return { success: false, error: 'bad_sheet' }
  if (key === 'title') return { success: false, error: 'title_fixed' }
  try {
    await prisma.$transaction(async tx => {
      await lock(tx, sheet)
      const rows = await records(tx, sheet, me.id)
      const row = rows.find(r => r.key === key)
      if (!row) throw new Error('not_found')
      const start = row.shown_default ? defaultShownIn(sheet, key) : row.shown_in
      const next = new Set(start)
      if (shown) next.add(set); else next.delete(set)
      await tx.sheetColumn.update({ where: { id: row.id }, data: { shown_default: false, shown_in: [...next], updated_by: me.id, updated_at: new Date() } })
    })
    done()
    return { success: true }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

export async function resizeColumn(sheet: string, key: string, width: number): Promise<{ success: true } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (!isSheet(sheet)) return { success: false, error: 'bad_sheet' }
  if (!Number.isFinite(width)) return { success: false, error: 'bad_width' }
  try {
    await prisma.$transaction(async tx => {
      await lock(tx, sheet)
      const rows = await records(tx, sheet, me.id)
      const row = rows.find(r => r.key === key)
      if (!row) throw new Error('not_found')
      await tx.sheetColumn.update({ where: { id: row.id }, data: { width: clampWidth(width), updated_by: me.id, updated_at: new Date() } })
    })
    done()
    return { success: true }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

/**
 * A custom column's name, kind or options (R11). Removing an option in use
 * needs a replacement (another option id, or null to clear). A kind change
 * converts every value that fits and clears the rest.
 */
export async function updateColumn(id: string, input: {
  name?: string; kind?: ColumnKind; options?: Partial<ChoiceOption>[]; replace?: Record<string, string | null>
}): Promise<{ success: true; cleared: number } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  try {
    const cleared = await prisma.$transaction(async tx => {
      const col = await tx.sheetColumn.findUnique({ where: { id } })
      if (!col || col.deleted_at) throw new Error('not_found')
      if (!isCustomKey(col.key) || !col.kind) throw new Error('built_in')
      const sheet = col.sheet as SheetId
      await lock(tx, sheet)
      const rows = await records(tx, sheet, me.id)
      const data: Prisma.SheetColumnUpdateInput = { updater: { connect: { id: me.id } }, updated_at: new Date() }
      if (input.name !== undefined) {
        const bad = checkName(input.name, otherNames(rows, sheet, col.key))
        if (bad) throw new Error(`name_${bad}`)
        data.name = normName(input.name)
      }
      const oldKind = col.kind as ColumnKind
      const kind = input.kind ?? oldKind
      if (!COLUMN_KINDS.includes(kind)) throw new Error('bad_kind')
      const oldOptions = (col.options as unknown as ChoiceOption[]) ?? []
      const options = kind === 'choice'
        ? cleanOptions(input.options ?? oldOptions, () => randomUUID().slice(0, 8))
        : []
      if (kind === 'choice' && !options.length) throw new Error('no_options')
      const values = await tx.sheetValue.findMany({ where: { column_id: id } })
      let clearedCount = 0
      if (kind !== oldKind) {
        const members = await tx.member.findMany({ select: { id: true, name: true } })
        const map = Object.fromEntries(values.map(v => [v.task_id, v.value]))
        const { kept, cleared } = convertValues(oldKind, kind, map, { members, options: oldOptions }, { members, options })
        for (const [taskId, v] of Object.entries(kept)) {
          await tx.sheetValue.update({ where: { column_id_task_id: { column_id: id, task_id: taskId } }, data: { value: v, updated_by: me.id, updated_at: new Date() } })
        }
        if (cleared.length) await tx.sheetValue.deleteMany({ where: { column_id: id, task_id: { in: cleared } } })
        clearedCount = cleared.length
      } else if (kind === 'choice') {
        // Values on removed options: replaced as asked, or the change is refused.
        const ids = new Set(options.map(o => o.id))
        for (const v of values) {
          if (ids.has(v.value)) continue
          const to = input.replace?.[v.value]
          if (to === undefined) throw new Error('option_in_use')
          if (to && ids.has(to)) await tx.sheetValue.update({ where: { column_id_task_id: { column_id: id, task_id: v.task_id } }, data: { value: to, updated_by: me.id, updated_at: new Date() } })
          else { await tx.sheetValue.delete({ where: { column_id_task_id: { column_id: id, task_id: v.task_id } } }); clearedCount++ }
        }
      }
      data.kind = kind
      data.options = options as unknown as Prisma.InputJsonValue
      await tx.sheetColumn.update({ where: { id }, data })
      return clearedCount
    })
    done()
    return { success: true, cleared }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

/** Delete a custom column: soft, so Undo can restore it with its values (R10). */
export async function deleteColumn(id: string): Promise<{ success: true; values: number } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  try {
    const values = await prisma.$transaction(async tx => {
      const col = await tx.sheetColumn.findUnique({ where: { id } })
      if (!col || col.deleted_at) throw new Error('not_found')
      if (!isCustomKey(col.key)) throw new Error('built_in')
      await lock(tx, col.sheet as SheetId)
      const n = await tx.sheetValue.count({ where: { column_id: id } })
      await tx.sheetColumn.update({ where: { id }, data: { deleted_at: new Date(), updated_by: me.id, updated_at: new Date() } })
      // Lazy cleanup: columns deleted more than a day ago are gone for good.
      await tx.sheetColumn.deleteMany({ where: { deleted_at: { lt: new Date(Date.now() - 86_400_000) } } })
      return n
    })
    done()
    return { success: true, values }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

export async function restoreColumn(id: string): Promise<{ success: true; column: SheetColumnRecord } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  try {
    await prisma.$transaction(async tx => {
      const col = await tx.sheetColumn.findUnique({ where: { id } })
      if (!col) throw new Error('not_found')
      const sheet = col.sheet as SheetId
      await lock(tx, sheet)
      const rows = await records(tx, sheet, me.id)
      let name = col.name ?? ''
      for (let n = 2; checkName(name, otherNames(rows, sheet, col.key)); n++) name = `${normName(col.name ?? '')} (${n})`
      await tx.sheetColumn.update({ where: { id }, data: { deleted_at: null, name, updated_by: me.id, updated_at: new Date() } })
    })
    done()
    const column = await fresh(id)
    return column ? { success: true, column } : { success: false, error: 'not_found' }
  } catch (e) { return { success: false, error: (e as Error).message } }
}

// ── values ──────────────────────────────────────────────────────────────────

async function valueContext(columnId: string) {
  const col = await prisma.sheetColumn.findUnique({ where: { id: columnId } })
  if (!col || col.deleted_at || !col.kind) return null
  const members = col.kind === 'person' ? await prisma.member.findMany({ select: { id: true, name: true } }) : []
  return { col, kind: col.kind as ColumnKind, ctx: { members, options: (col.options as unknown as ChoiceOption[]) ?? [] } }
}

const canAct = (t: { task_owner_id: string; assignee_id: string | null }, m: { id: string; access: string }) =>
  t.task_owner_id === m.id || t.assignee_id === m.id || isAdmin(m)

/** One custom value (FR-022–FR-024): parsed by its kind; '' clears. */
export async function setValue(columnId: string, taskId: string, raw: string): Promise<{ success: true; value: string } | Fail> {
  const r = await setValues(columnId, [{ taskId, raw }])
  if (!r.success) return r
  if (r.refused.length) return { success: false, error: r.refused[0].code }
  return { success: true, value: r.values[taskId] ?? '' }
}

export async function setValues(columnId: string, entries: { taskId: string; raw: string }[]): Promise<
  { success: true; saved: number; values: Record<string, string>; refused: { taskId: string; code: string }[] } | Fail
> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  const vc = await valueContext(columnId)
  if (!vc) return { success: false, error: 'gone' }
  const list = entries.slice(0, 500)
  const tasks = await prisma.task.findMany({
    where: { id: { in: list.map(e => e.taskId) } },
    select: { id: true, task_owner_id: true, assignee_id: true, dropped_at: true },
  })
  const refused: { taskId: string; code: string }[] = []
  const values: Record<string, string> = {}
  let saved = 0
  for (const e of list) {
    const t = tasks.find(x => x.id === e.taskId)
    if (!t) { refused.push({ taskId: e.taskId, code: 'not_found' }); continue }
    // Spec 013 R8 (FR-060): team columns are open to any member on a live task.
    if (t.dropped_at) { refused.push({ taskId: e.taskId, code: 'archived' }); continue }
    const p = parseValue(vc.kind, e.raw, vc.ctx)
    if (!p.ok) { refused.push({ taskId: e.taskId, code: `invalid_${p.code}` }); continue }
    const where = { column_id_task_id: { column_id: columnId, task_id: e.taskId } }
    if (!p.value) await prisma.sheetValue.deleteMany({ where: { column_id: columnId, task_id: e.taskId } })
    else await prisma.sheetValue.upsert({ where, create: { column_id: columnId, task_id: e.taskId, value: p.value, updated_by: me.id }, update: { value: p.value, updated_by: me.id, updated_at: new Date() } })
    values[e.taskId] = p.value
    saved++
  }
  done()
  return { success: true, saved, values, refused }
}

/**
 * A content type added from a sheet's Type cell (admins only, as in Settings).
 * It starts with Post's deadlines, stage by stage, so its pieces are never
 * without an SLA (constitution §II).
 */
export async function addContentType(label: string): Promise<{ success: true; label: string } | Fail> {
  const me = await session()
  if (!me) return { success: false, error: 'not_authenticated' }
  if (me.access !== 'admin') return { success: false, error: 'not_authorized' }
  const name = normName(label).slice(0, 40)
  if (!name) return { success: false, error: 'name_empty' }
  const all = await prisma.contentType.findMany({ select: { label: true } })
  const existing = all.find(x => x.label.toLowerCase() === name.toLowerCase())
  if (existing) return { success: true, label: existing.label }
  const post = await prisma.slaConfig.findMany({ where: { content_type_label: 'Post' } })
  await prisma.$transaction([
    prisma.contentType.create({ data: { label: name } }),
    ...post.map(r => prisma.slaConfig.upsert({
      where: { stage_id_content_type_label: { stage_id: r.stage_id, content_type_label: name } },
      update: {},
      create: { stage_id: r.stage_id, content_type_label: name, max_business_days: r.max_business_days },
    })),
  ])
  revalidatePath('/board')
  revalidatePath('/settings')
  return { success: true, label: name }
}
