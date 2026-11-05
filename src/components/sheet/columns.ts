/**
 * The sheet's columns and column sets (spec 008 FR-050, FR-051,
 * contracts/sheet-ui.md §3). Pure.
 */
import type { SheetColumn, SheetColumnSet } from '@/types/index'

/** Every column, in display order. */
export const ALL_COLUMNS: SheetColumn[] = [
  'title', 'clipNo', 'type', 'status', 'editor', 'source', 'fileName',
  'in', 'out', 'length', 'files', 'published', 'drop',
]

export const COLUMN_SETS: Record<SheetColumnSet, SheetColumn[]> = {
  editing: ['title', 'clipNo', 'status', 'editor', 'source', 'fileName', 'in', 'out', 'length', 'files'],
  copy:    ['title', 'clipNo', 'type', 'status', 'editor', 'published'],
  full:    ALL_COLUMNS,
}

/** Width of each column, in px. The row-number gutter is ROW_NO_WIDTH. */
export const COLUMN_WIDTHS: Record<SheetColumn, number> = {
  title: 320, clipNo: 40, type: 70, status: 156, editor: 112, source: 92, fileName: 250,
  in: 64, out: 64, length: 64, files: 150, published: 130, drop: 72,
}
export const ROW_NO_WIDTH = 40

/** Roles whose work is the cut itself. Also orders the Editor menu (FR-025). */
export const EDITING_ROLE_RE = /video|editor|motion|design/i
/** Roles whose work is the words. */
export const WRITING_ROLE_RE = /content|copy|writer/i

export function isEditingRole(role: string | null | undefined): boolean {
  return EDITING_ROLE_RE.test(role ?? '')
}

/** A member's first column set (FR-051): Editing, then Copy, else Full. */
export function defaultColumnSet(role: string | null | undefined): SheetColumnSet {
  if (EDITING_ROLE_RE.test(role ?? '')) return 'editing'
  if (WRITING_ROLE_RE.test(role ?? '')) return 'copy'
  return 'full'
}

export function isColumnSet(v: unknown): v is SheetColumnSet {
  return v === 'editing' || v === 'copy' || v === 'full'
}
