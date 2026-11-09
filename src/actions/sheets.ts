'use server'

/**
 * Sheets (spec 013, contracts/server.md): folders, pins, tabs and blank-sheet
 * content. Every action acts for the signed-in member; the rules in
 * data-model.md §3 are enforced here, whatever the screen allows.
 *
 * Blank sheets keep stable row and column ids with sortable positions (R3):
 * cells are addressed by (row id, column id), so an insert never moves
 * someone else's edit, and only filled cells are stored.
 */
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionMember } from '@/lib/authz'
import { initial, needsRenumber } from '@/lib/sheet-positions'
import { nextSheetName, validateFolderName } from '@/lib/sheet-names'
import type { FolderSummary, SheetChanges, SheetDoc, SheetKind, SheetSummary, TabColor } from '@/types/index'
import { TAB_COLORS } from '@/types/index'

type Fail = { success: false; error: string }
type Tx = Prisma.TransactionClient

const DEFAULT_ROWS = 100
const DEFAULT_COLS = 26
const MAX_ROWS = 5000
const MAX_COLS = 200
const MAX_CELL = 50_000
const MAX_CELLS_PER_CALL = 2000
const ROW_H = { min: 21, max: 400 }
const COL_W = { min: 40, max: 600 }

const fail = (error: string): Fail => ({ success: false, error })
const touched = () => { revalidatePath('/sheets') }

async function me() {
  return getSessionMember()
}
const isAdmin = (m: { access: string }) => m.access === 'admin'

/** A name pattern from the client's language ("Sheet {n}", "ورقة {n}"); anything odd falls back to English. */
function pattern(p?: string | null): string {
  return p && p.includes('{n}') && p.length <= 40 ? p : 'Sheet {n}'
}

function summary(s: {
  id: string; folder_id: string; kind: string; name: string | null; position: number; tab_color: string | null
  hidden: boolean; protected_by: string | null; row_count: number; col_count: number
}): SheetSummary {
  return {
    id: s.id, folderId: s.folder_id, kind: s.kind as SheetKind, name: s.name, position: s.position,
    color: (TAB_COLORS as readonly string[]).includes(s.tab_color ?? '') ? (s.tab_color as TabColor) : null,
    hidden: s.hidden, protectedBy: s.protected_by, rowCount: s.row_count, colCount: s.col_count,
  }
}

/** A fresh blank sheet's rows and columns (FR-052): 100 × 26 by default. */
async function seedGrid(tx: Tx, sheetId: string, rows = DEFAULT_ROWS, cols = DEFAULT_COLS) {
  await tx.sheetRow.createMany({ data: initial(rows).map(position => ({ id: randomUUID(), sheet_id: sheetId, position })) })
  await tx.sheetCol.createMany({ data: initial(cols).map(position => ({ id: randomUUID(), sheet_id: sheetId, position })) })
  await tx.sheet.update({ where: { id: sheetId }, data: { row_count: rows, col_count: cols } })
}

/** Record who changed a folder and when: the home page's "Edited … by …". */
async function bumpFolder(tx: Tx, folderId: string, memberId: string) {
  await tx.sheetFolder.update({ where: { id: folderId }, data: { updated_at: new Date(), updated_by: memberId } })
}

// ─── folders ────────────────────────────────────────────────────────────────

/** The Content and Video folders with their linked sheets (R11). Idempotent; the backfill does the same. */
async function ensureLinked() {
  for (const [folderKey, sheetKey] of [['content', 'linked_content'], ['video', 'linked_video']] as const) {
    const folder = await prisma.sheetFolder.upsert({ where: { linked_key: folderKey }, create: { kind: folderKey, linked_key: folderKey }, update: {} })
    await prisma.sheet.upsert({
      where: { linked_key: sheetKey },
      create: { folder_id: folder.id, kind: sheetKey, linked_key: sheetKey, position: 0 },
      update: {},
    })
  }
}

/** The home page and the sidebar: folders with counts, and the member's pins (FR-071, FR-072). */
export async function listFolders(): Promise<{ success: true; folders: FolderSummary[]; pins: string[] } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  await ensureLinked()
  const [rows, member] = await Promise.all([
    prisma.sheetFolder.findMany({
      include: { updater: { select: { name: true } }, _count: { select: { sheets: { where: { hidden: false } } } } },
    }),
    prisma.member.findUnique({ where: { id: m.id }, select: { sheet_pins: true, sheet_pins_set: true } }),
  ])
  const order = (k: string) => (k === 'content' ? 0 : k === 'video' ? 1 : 2)
  rows.sort((a, b) => order(a.kind) - order(b.kind) || (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' }))
  const folders: FolderSummary[] = rows.map(f => ({
    id: f.id, kind: f.kind as FolderSummary['kind'], name: f.name, sheetCount: f._count.sheets,
    updatedAt: f.updated_at.toISOString(), updatedBy: f.updater?.name ?? null,
  }))
  const ids = new Set(folders.map(f => f.id))
  const pins = member?.sheet_pins_set
    ? member.sheet_pins.filter(id => ids.has(id))
    : folders.filter(f => f.kind === 'content' || f.kind === 'video').map(f => f.id)
  return { success: true, folders, pins }
}

/** New folder (FR-073): a team folder with one blank sheet, "Sheet 1". */
export async function createFolder(name: string, opts: { sheetPattern?: string } = {}): Promise<{ success: true; folderId: string; sheetId: string } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const others = await prisma.sheetFolder.findMany({ where: { kind: 'team' }, select: { name: true } })
  const v = validateFolderName(name, others.map(o => o.name ?? ''))
  if (!v.ok) return fail(v.error)
  const out = await prisma.$transaction(async tx => {
    const folder = await tx.sheetFolder.create({ data: { kind: 'team', name: v.name, created_by: m.id, updated_by: m.id } })
    const sheet = await tx.sheet.create({
      data: { folder_id: folder.id, kind: 'blank', name: nextSheetName([], pattern(opts.sheetPattern)), position: 0, created_by: m.id, updated_by: m.id },
    })
    await seedGrid(tx, sheet.id)
    return { folderId: folder.id, sheetId: sheet.id }
  })
  touched()
  return { success: true, ...out }
}

export async function renameFolder(id: string, name: string): Promise<{ success: true; name: string } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const f = await prisma.sheetFolder.findUnique({ where: { id } })
  if (!f) return fail('gone')
  if (f.kind !== 'team') return fail('linked')
  const others = await prisma.sheetFolder.findMany({ where: { kind: 'team', NOT: { id } }, select: { name: true } })
  const v = validateFolderName(name, others.map(o => o.name ?? ''))
  if (!v.ok) return fail(v.error)
  await prisma.sheetFolder.update({ where: { id }, data: { name: v.name, updated_by: m.id, updated_at: new Date() } })
  touched()
  return { success: true, name: v.name }
}

/** Called by the client once its 10-second Undo has passed (R12). Team folders only. */
export async function deleteFolder(id: string): Promise<{ success: true } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const f = await prisma.sheetFolder.findUnique({ where: { id } })
  if (!f) return { success: true }
  if (f.kind !== 'team') return fail('linked')
  await prisma.sheetFolder.delete({ where: { id } })
  touched()
  return { success: true }
}

/** The member's pinned folders, in order (FR-072). Unknown ids are dropped. */
export async function setPins(folderIds: string[]): Promise<{ success: true; pins: string[] } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const wanted = [...new Set(folderIds)].slice(0, 50)
  const found = await prisma.sheetFolder.findMany({ where: { id: { in: wanted } }, select: { id: true } })
  const ok = new Set(found.map(f => f.id))
  const pins = wanted.filter(id => ok.has(id))
  await prisma.member.update({ where: { id: m.id }, data: { sheet_pins: pins, sheet_pins_set: true } })
  return { success: true, pins }
}

// ─── sheets (tabs) ──────────────────────────────────────────────────────────

/** A folder's tabs, hidden ones included (for Unhide). */
export async function listSheets(folderId: string): Promise<{ success: true; sheets: SheetSummary[] } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const rows = await prisma.sheet.findMany({ where: { folder_id: folderId }, orderBy: { position: 'asc' } })
  return { success: true, sheets: rows.map(summary) }
}

/**
 * A new blank sheet (FR-051, FR-055): "+" and Shift+F11 place it after the
 * open sheet, Insert places it before a tab. Named "Sheet N", the lowest N free
 * in the folder.
 */
export async function createSheet(folderId: string, opts: { before?: string | null; after?: string | null; pattern?: string } = {}): Promise<{ success: true; sheet: SheetSummary } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const folder = await prisma.sheetFolder.findUnique({ where: { id: folderId }, select: { id: true } })
  if (!folder) return fail('gone')
  const sheet = await prisma.$transaction(async tx => {
    const tabs = await tx.sheet.findMany({ where: { folder_id: folderId }, orderBy: { position: 'asc' }, select: { id: true, name: true } })
    let at = tabs.length
    if (opts.before) { const i = tabs.findIndex(t => t.id === opts.before); if (i >= 0) at = i }
    else if (opts.after) { const i = tabs.findIndex(t => t.id === opts.after); if (i >= 0) at = i + 1 }
    const name = nextSheetName(tabs.map(t => t.name ?? ''), pattern(opts.pattern))
    const created = await tx.sheet.create({
      data: { folder_id: folderId, kind: 'blank', name, position: at, created_by: m.id, updated_by: m.id },
    })
    // Renumber the folder's tabs 0…n in their new order.
    const order = [...tabs.slice(0, at).map(t => t.id), created.id, ...tabs.slice(at).map(t => t.id)]
    for (let i = 0; i < order.length; i++) await tx.sheet.update({ where: { id: order[i] }, data: { position: i } })
    await seedGrid(tx, created.id)
    await bumpFolder(tx, folderId, m.id)
    return tx.sheet.findUniqueOrThrow({ where: { id: created.id } })
  })
  touched()
  return { success: true, sheet: summary(sheet) }
}

/** A blank sheet's rows, columns and filled cells (data-model §4). */
export async function loadSheet(id: string): Promise<{ success: true; doc: SheetDoc; sheet: SheetSummary } | Fail> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const sheet = await prisma.sheet.findUnique({ where: { id } })
  if (!sheet) return fail('gone')
  if (sheet.kind !== 'blank') return fail('linked')
  const [rows, cols, cells] = await Promise.all([
    prisma.sheetRow.findMany({ where: { sheet_id: id }, orderBy: { position: 'asc' }, select: { id: true, position: true, height: true } }),
    prisma.sheetCol.findMany({ where: { sheet_id: id }, orderBy: { position: 'asc' }, select: { id: true, position: true, width: true } }),
    prisma.sheetCell.findMany({ where: { sheet_id: id }, select: { row_id: true, col_id: true, value: true } }),
  ])
  const map: SheetDoc['cells'] = {}
  for (const c of cells) (map[c.row_id] ??= {})[c.col_id] = c.value
  return { success: true, sheet: summary(sheet), doc: { id, updatedAt: sheet.updated_at.toISOString(), rows, cols, cells: map } }
}

// ─── blank-sheet content ────────────────────────────────────────────────────

/** Whether this member may change this sheet's content (FR-059b). */
function mayEdit(sheet: { protected_by: string | null }, m: { id: string; access: string }) {
  return !sheet.protected_by || sheet.protected_by === m.id || isAdmin(m)
}

const clampOrNull = (v: number | null | undefined, b: { min: number; max: number }) =>
  v === null || v === undefined ? null : Math.max(b.min, Math.min(b.max, Math.round(v)))

/**
 * One saved batch of a blank sheet's changes (R6, contracts/server.md), in
 * one transaction. Limits, protection and the size caps refuse the whole call;
 * a row or column that no longer exists is skipped as `gone`. When positions
 * run out of room, the sheet's rows or columns are renumbered and the new
 * positions come back so the client can adopt them.
 */
export async function applySheetChanges(sheetId: string, changes: SheetChanges): Promise<
  | { success: true; updatedAt: string; skipped: { rowId?: string; colId?: string; reason: 'gone' }[]; positions?: { rows?: { id: string; position: number }[]; cols?: { id: string; position: number }[] } }
  | Fail
> {
  const m = await me()
  if (!m) return fail('not_authenticated')
  const cells = changes.cells ?? []
  if (cells.length > MAX_CELLS_PER_CALL) return fail('too_many_cells')
  if (cells.some(c => c.value.length > MAX_CELL)) return fail('too_long')

  try {
    return await prisma.$transaction(async tx => {
      const sheet = await tx.sheet.findUnique({ where: { id: sheetId } })
      if (!sheet) throw new Refuse('gone')
      if (sheet.kind !== 'blank') throw new Refuse('linked')
      if (!mayEdit(sheet, m)) throw new Refuse('protected')

      // Structure first: deletes, then inserts, then sizes.
      if (changes.deleteRows?.length) await tx.sheetRow.deleteMany({ where: { sheet_id: sheetId, id: { in: changes.deleteRows } } })
      if (changes.deleteCols?.length) await tx.sheetCol.deleteMany({ where: { sheet_id: sheetId, id: { in: changes.deleteCols } } })
      if (changes.insertRows?.length) {
        await tx.sheetRow.createMany({
          data: changes.insertRows.map(r => ({ id: r.id, sheet_id: sheetId, position: r.position, height: clampOrNull(r.height, ROW_H) })),
          skipDuplicates: true,
        })
      }
      if (changes.insertCols?.length) {
        await tx.sheetCol.createMany({
          data: changes.insertCols.map(c => ({ id: c.id, sheet_id: sheetId, position: c.position, width: clampOrNull(c.width, COL_W) })),
          skipDuplicates: true,
        })
      }
      const [rowCount, colCount] = await Promise.all([
        tx.sheetRow.count({ where: { sheet_id: sheetId } }),
        tx.sheetCol.count({ where: { sheet_id: sheetId } }),
      ])
      if (rowCount > MAX_ROWS) throw new Refuse('too_many_rows')
      if (colCount > MAX_COLS) throw new Refuse('too_many_cols')
      for (const r of changes.rowHeights ?? []) await tx.sheetRow.updateMany({ where: { id: r.id, sheet_id: sheetId }, data: { height: clampOrNull(r.height, ROW_H) } })
      for (const c of changes.colWidths ?? []) await tx.sheetCol.updateMany({ where: { id: c.id, sheet_id: sheetId }, data: { width: clampOrNull(c.width, COL_W) } })

      // Cells: only where the row and column still exist.
      const skipped: { rowId?: string; colId?: string; reason: 'gone' }[] = []
      if (cells.length) {
        const rowIds = [...new Set(cells.map(c => c.rowId))], colIds = [...new Set(cells.map(c => c.colId))]
        const [liveRows, liveCols] = await Promise.all([
          tx.sheetRow.findMany({ where: { sheet_id: sheetId, id: { in: rowIds } }, select: { id: true } }),
          tx.sheetCol.findMany({ where: { sheet_id: sheetId, id: { in: colIds } }, select: { id: true } }),
        ])
        const rOk = new Set(liveRows.map(r => r.id)), cOk = new Set(liveCols.map(c => c.id))
        // The last write in this batch wins for a cell.
        const byCell = new Map<string, { rowId: string; colId: string; value: string }>()
        for (const c of cells) {
          if (!rOk.has(c.rowId) || !cOk.has(c.colId)) { skipped.push({ rowId: c.rowId, colId: c.colId, reason: 'gone' }); continue }
          byCell.set(`${c.rowId}|${c.colId}`, c)
        }
        const put = [...byCell.values()].filter(c => c.value !== '')
        const clear = [...byCell.values()].filter(c => c.value === '')
        if (clear.length) {
          await tx.$executeRaw`DELETE FROM sheet_cells WHERE sheet_id = ${sheetId}::uuid AND (row_id, col_id) IN (
            SELECT * FROM unnest(${clear.map(c => c.rowId)}::uuid[], ${clear.map(c => c.colId)}::uuid[]))`
        }
        if (put.length) {
          await tx.$executeRaw`INSERT INTO sheet_cells (sheet_id, row_id, col_id, value, updated_by, updated_at)
            SELECT ${sheetId}::uuid, r, c, v, ${m.id}::uuid, now()
            FROM unnest(${put.map(c => c.rowId)}::uuid[], ${put.map(c => c.colId)}::uuid[], ${put.map(c => c.value)}::text[]) AS t(r, c, v)
            ON CONFLICT (row_id, col_id) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`
        }
      }

      // Room for the next insert: renumber when two neighbours got too close.
      const positions: { rows?: { id: string; position: number }[]; cols?: { id: string; position: number }[] } = {}
      if (changes.insertRows?.length) {
        const all = await tx.sheetRow.findMany({ where: { sheet_id: sheetId }, orderBy: { position: 'asc' }, select: { id: true, position: true } })
        if (needsRenumber(all.map(r => r.position))) {
          await tx.$executeRaw`UPDATE sheet_rows s SET position = n.rn FROM (
            SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM sheet_rows WHERE sheet_id = ${sheetId}::uuid) n WHERE s.id = n.id`
          positions.rows = all.map((r, i) => ({ id: r.id, position: i + 1 }))
        }
      }
      if (changes.insertCols?.length) {
        const all = await tx.sheetCol.findMany({ where: { sheet_id: sheetId }, orderBy: { position: 'asc' }, select: { id: true, position: true } })
        if (needsRenumber(all.map(c => c.position))) {
          await tx.$executeRaw`UPDATE sheet_cols s SET position = n.rn FROM (
            SELECT id, row_number() OVER (ORDER BY position, id) AS rn FROM sheet_cols WHERE sheet_id = ${sheetId}::uuid) n WHERE s.id = n.id`
          positions.cols = all.map((c, i) => ({ id: c.id, position: i + 1 }))
        }
      }

      const now = new Date()
      await tx.sheet.update({ where: { id: sheetId }, data: { row_count: rowCount, col_count: colCount, updated_at: now, updated_by: m.id } })
      await bumpFolder(tx, sheet.folder_id, m.id)
      return { success: true as const, updatedAt: now.toISOString(), skipped, ...(positions.rows || positions.cols ? { positions } : {}) }
    }, { timeout: 30_000 })
  } catch (e) {
    if (e instanceof Refuse) return fail(e.code)
    throw e
  }
}

/** A refusal raised inside a transaction, so nothing in it is kept. */
class Refuse extends Error {
  constructor(public code: string) { super(code) }
}
