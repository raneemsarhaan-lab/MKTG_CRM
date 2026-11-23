/**
 * Spec 015 (T057, research): a daily clear-out of cell formats and comment
 * threads whose row, column or task is gone. Orphans are harmless and small,
 * so only those untouched for 30 days go. Server-only; called from the
 * scheduler's 03:00 clean-up.
 *
 * A key is a blank sheet's row or column id, a task id, a column key
 * (`title`, `c:<id>`), or '' for "every row / column" (never an orphan).
 */
import { prisma } from '@/lib/prisma'

const UUID = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'

export async function clearSheetOrphans(now = new Date()): Promise<{ formats: number; comments: number }> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 3600_000)
  const formats = await prisma.$executeRaw`
    delete from sheet_formats f
    where f.updated_at < ${cutoff} and (
      (f.row_key ~ ${UUID} and not exists (select 1 from sheet_rows r where r.id::text = f.row_key)
                           and not exists (select 1 from tasks t where t.id::text = f.row_key))
      or (f.col_key ~ ${UUID} and not exists (select 1 from sheet_cols c where c.id::text = f.col_key))
      or (f.col_key like 'c:%' and not exists (select 1 from sheet_columns sc where sc.key = f.col_key))
    )`
  // A whole thread goes with its root (replies cascade); only threads quiet for 30 days.
  const comments = await prisma.$executeRaw`
    delete from sheet_comments m
    where m.root_id is null
      and coalesce((select max(coalesce(x.edited_at, x.created_at)) from sheet_comments x where x.root_id = m.id), m.created_at) < ${cutoff}
      and m.created_at < ${cutoff}
      and (
        (m.row_key ~ ${UUID} and not exists (select 1 from sheet_rows r where r.id::text = m.row_key)
                             and not exists (select 1 from tasks t where t.id::text = m.row_key))
        or (m.col_key ~ ${UUID} and not exists (select 1 from sheet_cols c where c.id::text = m.col_key))
        or (m.col_key like 'c:%' and not exists (select 1 from sheet_columns sc where sc.key = m.col_key))
      )`
  return { formats, comments }
}
