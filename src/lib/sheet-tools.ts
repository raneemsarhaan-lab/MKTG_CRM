/**
 * Excel's editing tools (spec 015 US4, FR-040–FR-044), the parts that don't
 * need a screen: find and replace, transpose, Format Painter's patch, Clear
 * Formats' patch. Pure.
 */
import type { CellStyle } from '@/types/index'
import type { StylePatch } from '@/lib/sheet-format'

export interface FindOpts { matchCase: boolean; whole: boolean }

const norm = (s: string, o: FindOpts) => (o.matchCase ? s : s.toLocaleLowerCase())

/** Whether a cell's value matches (FR-044): anywhere in the text, or the whole cell. */
export function matches(text: string, query: string, o: FindOpts): boolean {
  if (!query) return false
  const t = norm(text, o), q = norm(query, o)
  return o.whole ? t.trim() === q.trim() : t.includes(q)
}

/** The value after Replace: every match in the text, or the whole cell when "match entire cell". */
export function replaceIn(text: string, query: string, by: string, o: FindOpts): string {
  if (!matches(text, query, o)) return text
  if (o.whole) return by
  if (o.matchCase) return text.split(query).join(by)
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return text.replace(new RegExp(esc, 'gi'), () => by)
}

/**
 * The next match after a cell, in reading order (row by row), wrapping round;
 * `dir` -1 goes backwards. Returns the match's index in `cells`, or -1.
 */
export function nextMatch(cells: { r: number; c: number; text: string }[], from: { r: number; c: number } | null, query: string, o: FindOpts, dir: 1 | -1 = 1): number {
  const hits = cells.map((x, i) => ({ ...x, i })).filter(x => matches(x.text, query, o))
  if (!hits.length) return -1
  hits.sort((a, b) => a.r - b.r || a.c - b.c)
  if (!from) return (dir > 0 ? hits[0] : hits[hits.length - 1]).i
  const after = (x: { r: number; c: number }) => x.r > from.r || (x.r === from.r && x.c > from.c)
  const before = (x: { r: number; c: number }) => x.r < from.r || (x.r === from.r && x.c < from.c)
  if (dir > 0) return (hits.find(after) ?? hits[0]).i
  const back = hits.filter(before)
  return (back[back.length - 1] ?? hits[hits.length - 1]).i
}

/** Rows become columns (Paste Special › Transpose). */
export function transpose<T>(grid: T[][], fill: T): T[][] {
  const w = Math.max(0, ...grid.map(r => r.length))
  return Array.from({ length: w }, (_, c) => grid.map(r => (c < r.length ? r[c] : fill)))
}

const STYLE_KEYS: (keyof CellStyle)[] = ['font', 'size', 'b', 'i', 's', 'u', 'color', 'fill', 'bt', 'br', 'bb', 'bl', 'ha', 'va', 'wrap', 'indent', 'rot', 'num']

/** A patch that makes a cell look exactly like `style` (Format Painter): its fields, and nulls for the rest. */
export function paintPatch(style: CellStyle | null | undefined): StylePatch {
  const out: StylePatch = {}
  for (const k of STYLE_KEYS) out[k] = style && style[k] !== undefined ? style[k] : null
  return out
}

/** Clear › Formats: every field removed. */
export const clearPatch = (): StylePatch => paintPatch(null)
