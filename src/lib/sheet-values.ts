/**
 * Writing pasted custom values inside a paste's transaction (spec 010
 * FR-050–FR-052, contracts/server.md: addPlan and addClips rows may carry
 * `custom`). Server-only: it takes a transaction client. Kept out of the
 * 'use server' action files so it is never callable from the browser.
 *
 * Every value is parsed again here with parseValue: a value that doesn't fit
 * its column is never stored (FR-051).
 */
import type { Prisma } from '@prisma/client'
import { parseValue } from '@/lib/sheet-columns'
import type { ChoiceOption, ColumnKind, SheetId } from '@/types/index'

type Tx = Prisma.TransactionClient
export interface PasteColumnCtx { id: string; kind: ColumnKind; ctx: { members: { id: string; name: string }[]; options: ChoiceOption[] } }

/** The sheet's live custom columns, read once per paste. */
export async function pasteColumns(db: Tx, sheet: SheetId, members: { id: string; name: string }[]): Promise<Map<string, PasteColumnCtx>> {
  const cols = await db.sheetColumn.findMany({ where: { sheet, deleted_at: null, kind: { not: null } } })
  return new Map(cols.map(c => [c.id, {
    id: c.id, kind: c.kind as ColumnKind,
    ctx: { members, options: (c.options as unknown as ChoiceOption[]) ?? [] },
  }]))
}

/**
 * Writes one row's values. `onlyEmpty` leaves cells that already hold a value
 * alone (a piece already in the sheet). Returns how many values were written.
 */
export async function writePastedValues(
  db: Tx, columns: Map<string, PasteColumnCtx>, taskId: string, custom: Record<string, string> | undefined,
  by: string, opts: { onlyEmpty: boolean },
): Promise<number> {
  if (!custom || typeof custom !== 'object') return 0
  let n = 0
  const have = opts.onlyEmpty
    ? new Set((await db.sheetValue.findMany({ where: { task_id: taskId }, select: { column_id: true } })).map(v => v.column_id))
    : new Set<string>()
  for (const [columnId, raw] of Object.entries(custom).slice(0, 50)) {
    const col = columns.get(columnId)
    if (!col || typeof raw !== 'string' || have.has(columnId)) continue
    const p = parseValue(col.kind, raw, col.ctx)
    if (!p.ok || !p.value) continue
    await db.sheetValue.upsert({
      where: { column_id_task_id: { column_id: columnId, task_id: taskId } },
      create: { column_id: columnId, task_id: taskId, value: p.value, updated_by: by },
      update: { value: p.value, updated_by: by, updated_at: new Date() },
    })
    n++
  }
  return n
}
