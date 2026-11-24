/**
 * Content sheet rows (sheet 2b). Pure. A row is its own line of the plan; it
 * may stand for one task (a linked row). Rows sit in a theme, optionally in a
 * pillar, optionally under one parent row (one level). Order is a position
 * number, so inserting between two rows never renumbers the others.
 */

export interface ContentRowRec {
  id: string
  project_id: string
  pillar_id: string | null
  parent_id: string | null
  position: number
  title: string
  date: string | null
  values: Record<string, string>
  task_id: string | null
  created_by: string | null
  /** Spec 026: the Space whose sheet the row is on. */
  space_id?: string | null
}

/** A position between two neighbours (either may be missing). */
export function between(before: number | null | undefined, after: number | null | undefined): number {
  if (before == null && after == null) return 1
  if (before == null) return (after as number) - 1
  if (after == null) return before + 1
  return (before + after) / 2
}

/** Rows of one group (theme + pillar, top level), in order. */
export function groupRows(rows: ContentRowRec[], projectId: string, pillarId: string | null): ContentRowRec[] {
  return rows.filter(r => r.project_id === projectId && !r.parent_id && (r.pillar_id ?? null) === pillarId)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
}

export const childrenOf = (rows: ContentRowRec[], parentId: string) =>
  rows.filter(r => r.parent_id === parentId).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))

/**
 * Where a new row goes: above or below an anchor row among its siblings, or at
 * the end of the group. Returns the position.
 */
export function positionFor(siblings: ContentRowRec[], anchor?: { id: string; where: 'above' | 'below' } | null): number {
  const list = [...siblings].sort((a, b) => a.position - b.position)
  const i = anchor ? list.findIndex(r => r.id === anchor.id) : -1
  if (i < 0) return between(list[list.length - 1]?.position ?? null, null)
  return anchor!.where === 'above' ? between(list[i - 1]?.position ?? null, list[i].position) : between(list[i].position, list[i + 1]?.position ?? null)
}

/** Tab: the row becomes a child of the row above it (its previous top-level sibling). Null when it can't. */
export function indentTarget(rows: ContentRowRec[], row: ContentRowRec): ContentRowRec | null {
  if (row.parent_id) return null
  if (rows.some(r => r.parent_id === row.id)) return null // a parent can't become a child: one level only
  const sibs = groupRows(rows, row.project_id, row.pillar_id)
  const i = sibs.findIndex(r => r.id === row.id)
  return i > 0 ? sibs[i - 1] : null
}

/** Whether `row` may be dropped onto `target` as its child. */
export function mayNest(rows: ContentRowRec[], row: ContentRowRec, target: ContentRowRec): boolean {
  if (row.id === target.id || target.parent_id) return false
  return !rows.some(r => r.parent_id === row.id)
}

/** An ordered list of ids, with `id` moved before or after `target` (sheet-only orders: themes, pillars). */
export function reorder(ids: string[], id: string, target: string, where: 'before' | 'after'): string[] {
  if (id === target) return ids
  const rest = ids.filter(x => x !== id)
  const i = rest.indexOf(target)
  if (i < 0) return ids
  rest.splice(where === 'before' ? i : i + 1, 0, id)
  return rest
}

/** Pillars in the sheet's order: the theme's list first, then any others by their own order. */
export function orderPillars<P extends { id: string; sort_order: number }>(pillars: P[], order: string[]): P[] {
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...pillars].sort((a, b) => (rank.get(a.id) ?? 1e6 + a.sort_order) - (rank.get(b.id) ?? 1e6 + b.sort_order))
}
