/**
 * Data › Group (spec 020 tip 80, research R12). Pure.
 *
 * Excel keeps an outline level on each row (or column), 0–8: grouping adds
 * one to the selected rows, ungrouping takes one off, and a group at level k
 * is a run of rows whose level is at least k. The sheet stores the groups by
 * row ids (`view.outline`), so rows can move and be inserted; the levels are
 * worked out from them.
 */
export type OutlineKind = 'rows' | 'cols'
export interface OutlineGroup { kind: OutlineKind; from: string; to: string; level: number; collapsed: boolean }
export const MAX_LEVEL = 8
export const MAX_GROUPS = 200

/** A group placed on the sheet's current order (indexes), with ids that still exist. */
export interface OutlineSpan extends OutlineGroup { i0: number; i1: number }

export function spans(outline: OutlineGroup[] | undefined, kind: OutlineKind, order: string[]): OutlineSpan[] {
  if (!outline?.length) return []
  const at = new Map(order.map((id, i) => [id, i]))
  const out: OutlineSpan[] = []
  for (const g of outline) {
    if (g.kind !== kind) continue
    const a = at.get(g.from), b = at.get(g.to)
    if (a === undefined || b === undefined) continue
    out.push({ ...g, i0: Math.min(a, b), i1: Math.max(a, b) })
  }
  return out.sort((x, y) => x.level - y.level || x.i0 - y.i0)
}

/** Each index's level. */
export function levels(outline: OutlineGroup[] | undefined, kind: OutlineKind, order: string[]): number[] {
  const lv = new Array<number>(order.length).fill(0)
  for (const s of spans(outline, kind, order)) for (let i = s.i0; i <= s.i1; i++) lv[i] = Math.max(lv[i], s.level)
  return lv
}

/** Groups rebuilt from levels, keeping the collapsed state of a group that keeps its level and start. */
function rebuild(lv: number[], kind: OutlineKind, order: string[], old: OutlineSpan[]): OutlineGroup[] {
  const out: OutlineGroup[] = []
  for (let k = 1; k <= MAX_LEVEL; k++) {
    let i = 0
    while (i < lv.length) {
      if (lv[i] < k) { i++; continue }
      let j = i
      while (j + 1 < lv.length && lv[j + 1] >= k) j++
      const was = old.find(s => s.level === k && s.i0 === i)
      out.push({ kind, from: order[i], to: order[j], level: k, collapsed: !!was?.collapsed && was.i1 === j })
      i = j + 1
    }
  }
  return out
}

/**
 * Shift+Alt+→ (and Data › Group): the indexes `i0..i1` go one level deeper.
 * Null when they're already at the deepest level.
 */
export function group(outline: OutlineGroup[] | undefined, kind: OutlineKind, order: string[], i0: number, i1: number): OutlineGroup[] | null {
  const lv = levels(outline, kind, order)
  if (lv.slice(i0, i1 + 1).every(l => l >= MAX_LEVEL)) return null
  for (let i = i0; i <= i1; i++) lv[i] = Math.min(MAX_LEVEL, lv[i] + 1)
  const next = [...(outline ?? []).filter(g => g.kind !== kind), ...rebuild(lv, kind, order, spans(outline, kind, order))]
  return next.length > MAX_GROUPS ? null : next
}

/** Shift+Alt+← (and Data › Ungroup): one level off. Null when nothing there is grouped. */
export function ungroup(outline: OutlineGroup[] | undefined, kind: OutlineKind, order: string[], i0: number, i1: number): OutlineGroup[] | null {
  const lv = levels(outline, kind, order)
  if (lv.slice(i0, i1 + 1).every(l => l === 0)) return null
  for (let i = i0; i <= i1; i++) lv[i] = Math.max(0, lv[i] - 1)
  return [...(outline ?? []).filter(g => g.kind !== kind), ...rebuild(lv, kind, order, spans(outline, kind, order))]
}

/** The − or + under a group: collapse it, or expand it. */
export function toggle(outline: OutlineGroup[], g: Pick<OutlineGroup, 'kind' | 'from' | 'level'>, collapsed?: boolean): OutlineGroup[] {
  return outline.map(x => (x.kind === g.kind && x.from === g.from && x.level === g.level ? { ...x, collapsed: collapsed ?? !x.collapsed } : x))
}

/** The level buttons 1 2 …: button n shows levels below n, so groups at level n and deeper collapse. */
export function showLevel(outline: OutlineGroup[], kind: OutlineKind, n: number): OutlineGroup[] {
  return outline.map(x => (x.kind === kind ? { ...x, collapsed: x.level >= n } : x))
}

/** The deepest level in use (the buttons run 1 … deepest + 1). */
export const depth = (outline: OutlineGroup[] | undefined, kind: OutlineKind) =>
  Math.max(0, ...(outline ?? []).filter(g => g.kind === kind).map(g => g.level))

/** The ids that collapsed groups hide (separate from Hide, so Unhide doesn't fight the outline). */
export function hiddenIds(outline: OutlineGroup[] | undefined, kind: OutlineKind, order: string[]): Set<string> {
  const out = new Set<string>()
  for (const s of spans(outline, kind, order)) if (s.collapsed) for (let i = s.i0; i <= s.i1; i++) out.add(order[i])
  return out
}

/** The server's guard: known fields, levels 1–8, at most 200 groups. */
export function cleanOutline(v: unknown): OutlineGroup[] | null {
  if (!Array.isArray(v)) return null
  const out: OutlineGroup[] = []
  for (const x of v.slice(0, MAX_GROUPS)) {
    const g = x as Partial<OutlineGroup>
    if (!g || (g.kind !== 'rows' && g.kind !== 'cols')) continue
    if (typeof g.from !== 'string' || typeof g.to !== 'string' || g.from.length > 64 || g.to.length > 64) continue
    const level = typeof g.level === 'number' ? Math.round(g.level) : 0
    if (level < 1 || level > MAX_LEVEL) continue
    out.push({ kind: g.kind, from: g.from, to: g.to, level, collapsed: g.collapsed === true })
  }
  return out
}
