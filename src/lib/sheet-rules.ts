/**
 * Excel's Styles group and Sort & Filter (spec 015 US5, FR-030–FR-032,
 * FR-045, FR-046; research R8), the parts that don't need a screen. Pure.
 *
 * - Cell styles and table styles: named looks.
 * - Conditional formatting: which cells a sheet's rules colour, in priority
 *   order; the first rule that sets a property wins, as Excel's "stop if true".
 * - Sort: a stable order for rows by one or more keys; blanks always last.
 * - Filter: which rows a column's filter keeps.
 * - Groups: the Content and Video sheets sort and filter inside each group
 *   (FR-075), and a child row (a clip) stays with its parent.
 */
import type { CellStyle, ColFilter, ConditionalRule, FilterOp, RuleArgs, SheetTableRecord, SortKey } from '@/types/index'
import { parseDate, parseNumber, tint } from '@/lib/sheet-format'

// ─── cell styles (FR-030) ────────────────────────────────────────────────────

/** Excel's built-in cell styles. They apply over a cell's look (as `merge`); Normal clears it. */
/** Accent text is dark where white on the fill wouldn't be readable (WCAG AA). */
export const CELL_STYLES: { key: string; style: CellStyle }[] = [
  { key: 'normal', style: {} },
  { key: 'good', style: { fill: '#C6EFCE', color: '#006100' } },
  { key: 'bad', style: { fill: '#FFC7CE', color: '#9C0006' } },
  { key: 'neutral', style: { fill: '#FFEB9C', color: '#9C5700' } },
  { key: 'title', style: { b: true, size: 18, color: '#44546A' } },
  { key: 'h1', style: { b: true, size: 15, color: '#44546A', bb: { w: 'thick', c: '#4472C4' } } },
  { key: 'h2', style: { b: true, size: 13, color: '#44546A', bb: { w: 'thick', c: '#A2B8E1' } } },
  { key: 'h3', style: { b: true, size: 11, color: '#44546A', bb: { w: 'medium', c: '#8EA9DB' } } },
  { key: 'h4', style: { b: true, color: '#44546A' } },
  { key: 'total', style: { b: true, bt: { w: 'thin', c: '#4472C4' }, bb: { w: 'double', c: '#4472C4' } } },
  { key: 'note', style: { fill: '#FFFFCC', bt: { w: 'thin', c: '#B2B2B2' }, bb: { w: 'thin', c: '#B2B2B2' }, bl: { w: 'thin', c: '#B2B2B2' }, br: { w: 'thin', c: '#B2B2B2' } } },
  { key: 'input', style: { fill: '#FFCC99', color: '#3F3F76', bt: { w: 'thin', c: '#7F7F7F' }, bb: { w: 'thin', c: '#7F7F7F' }, bl: { w: 'thin', c: '#7F7F7F' }, br: { w: 'thin', c: '#7F7F7F' } } },
  { key: 'output', style: { fill: '#F2F2F2', color: '#3F3F3F', b: true, bt: { w: 'thin', c: '#3F3F3F' }, bb: { w: 'thin', c: '#3F3F3F' }, bl: { w: 'thin', c: '#3F3F3F' }, br: { w: 'thin', c: '#3F3F3F' } } },
  { key: 'accent1', style: { fill: '#4472C4', color: '#FFFFFF' } },
  { key: 'accent2', style: { fill: '#ED7D31', color: '#14131A' } },
  { key: 'accent3', style: { fill: '#A5A5A5', color: '#14131A' } },
  { key: 'accent4', style: { fill: '#FFC000', color: '#000000' } },
  { key: 'accent5', style: { fill: '#5B9BD5', color: '#14131A' } },
  { key: 'accent6', style: { fill: '#70AD47', color: '#14131A' } },
]
/** The style fields a cell style sets or, for Normal, clears: every look field, never the number format. */
export const STYLE_FIELDS = ['font', 'size', 'b', 'i', 's', 'u', 'color', 'fill', 'bt', 'br', 'bb', 'bl'] as const
/** The patch a cell style applies: its fields, and null for the look fields it doesn't set. */
export function cellStylePatch(key: string): Partial<Record<keyof CellStyle, unknown>> | null {
  const s = CELL_STYLES.find(x => x.key === key)
  if (!s) return null
  const out: Partial<Record<keyof CellStyle, unknown>> = {}
  for (const f of STYLE_FIELDS) out[f] = (s.style as Record<string, unknown>)[f] ?? null
  return out
}

// ─── tables (FR-031) ─────────────────────────────────────────────────────────

export const TABLE_BASES = ['#4472C4', '#ED7D31', '#70AD47', '#7030A0', '#A5A5A5', '#FFC000'] as const
export const TABLE_LEVELS = ['light', 'medium', 'dark'] as const
export type TableLevel = typeof TABLE_LEVELS[number]
/** `medium-0` … the 18 table styles: three levels, six colours. */
export const TABLE_STYLES = TABLE_LEVELS.flatMap(level => TABLE_BASES.map((base, i) => ({ key: `${level}-${i}`, level, base })))
export function tableStyle(key: string) { return TABLE_STYLES.find(s => s.key === key) ?? TABLE_STYLES[6 + 0] }

/**
 * A table cell's look, drawn under the cell's own formatting (as Excel's table
 * styles): the header row, then banded rows. `r` and `c` count from the
 * table's top-left corner.
 */
export function tableLook(t: Pick<SheetTableRecord, 'style' | 'header' | 'banded'>, r: number, c: number, rows: number): CellStyle | null {
  const s = tableStyle(t.style)
  const line = { w: 'thin' as const, c: s.base }
  if (t.header && r === 0) {
    if (s.level === 'light') return { b: true, bb: line }
    return { b: true, fill: s.level === 'dark' ? tint(s.base, -0.25) : s.base, color: '#FFFFFF' }
  }
  const body = t.header ? r - 1 : r
  const last = r === rows - 1
  const band = t.banded && body % 2 === 0
  if (s.level === 'dark') return { fill: tint(s.base, band ? 0.2 : 0.45), color: '#FFFFFF', ...(last ? { bb: { w: 'medium', c: tint(s.base, -0.25) } } : {}) }
  const fill = band ? tint(s.base, 0.8) : undefined
  const look: CellStyle = {}
  if (fill) look.fill = fill
  if (s.level === 'light' && last) look.bb = line
  if (s.level === 'medium') look.bb = { w: 'thin', c: tint(s.base, 0.4) }
  return Object.keys(look).length ? look : null
}

// ─── values ──────────────────────────────────────────────────────────────────

const DAY = 86_400_000
/** A typed date as a day number (UTC days since 1970), or null. */
export function dayOf(text: string): number | null {
  const d = parseDate(text)
  return d ? Date.UTC(d.y, d.m - 1, d.d) / DAY : null
}
export const todayDay = (now: Date) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY
const lower = (s: string) => s.trim().toLocaleLowerCase()

/** A value to compare: a number, then a date, then text. */
type Key = { n: number } | { d: number } | { t: string }
function keyOf(text: string): Key {
  const n = parseNumber(text)
  if (n !== null) return { n }
  const d = dayOf(text)
  if (d !== null) return { d }
  return { t: text.trim() }
}
/** Excel's order: numbers, then dates, then text (A to Z, numbers in text read as numbers). */
function compareKeys(a: Key, b: Key): number {
  const rank = (k: Key) => ('n' in k ? 0 : 'd' in k ? 1 : 2)
  const ra = rank(a), rb = rank(b)
  if (ra !== rb) return ra - rb
  if ('n' in a && 'n' in b) return a.n - b.n
  if ('d' in a && 'd' in b) return a.d - b.d
  return (a as { t: string }).t.localeCompare((b as { t: string }).t, undefined, { numeric: true, sensitivity: 'base' })
}

// ─── conditional formatting (FR-032) ─────────────────────────────────────────

/** What rules give one cell: a look, a data bar (0–1 of the cell's width), a colour-scale fill. */
export interface RuleLook { style?: CellStyle; bar?: { pct: number; color: string }; scale?: string }
export interface RuleCell { row: string; col: string; text: string }

/** Whether a highlight rule matches a value. */
export function matchValue(kind: ConditionalRule['kind'], a: RuleArgs, text: string, today: number): boolean {
  if (!text.trim()) return false
  switch (kind) {
    case 'gt': case 'lt': case 'eq': case 'between': {
      const v = keyOf(text), x = keyOf(a.a ?? '')
      if (kind === 'eq') return 't' in v || 't' in x ? lower(text) === lower(a.a ?? '') : compareKeys(v, x) === 0
      if ('t' in v || 't' in x || ('n' in v) !== ('n' in x)) return false
      if (kind === 'gt') return compareKeys(v, x) > 0
      if (kind === 'lt') return compareKeys(v, x) < 0
      const y = keyOf(a.b ?? '')
      if ('t' in y || ('n' in y) !== ('n' in v)) return false
      const [lo, hi] = compareKeys(x, y) <= 0 ? [x, y] : [y, x]
      return compareKeys(v, lo) >= 0 && compareKeys(v, hi) <= 0
    }
    case 'contains': return !!a.a && lower(text).includes(lower(a.a))
    case 'date': {
      const d = dayOf(text)
      if (d === null) return false
      switch (a.when ?? 'past') {
        case 'past': return d < today
        case 'today': return d === today
        case 'future': return d > today
        case 'yesterday': return d === today - 1
        case 'tomorrow': return d === today + 1
        case 'last7': return d <= today && d > today - 7
        case 'next7': return d >= today && d < today + 7
      }
      return false
    }
    default: return false
  }
}

const hexRgb = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
/** A colour between two, `t` 0–1. */
export function mix(a: string, b: string, t: number): string {
  const x = hexRgb(a), y = hexRgb(b)
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, t))).toString(16).padStart(2, '0')).join('').toUpperCase()
}
export const DEFAULT_BAR = '#5B9BD5'
/** The ready-made looks a highlight rule can take. */
export const RULE_LOOKS: { key: string; style: CellStyle }[] = [
  { key: 'red', style: { fill: '#FFC7CE', color: '#9C0006' } },
  { key: 'yellow', style: { fill: '#FFEB9C', color: '#9C5700' } },
  { key: 'green', style: { fill: '#C6EFCE', color: '#006100' } },
  { key: 'redFill', style: { fill: '#FFC7CE' } },
  { key: 'redText', style: { color: '#9C0006' } },
  { key: 'bold', style: { b: true } },
]
export const BAR_COLORS = [DEFAULT_BAR, '#63BE7B', '#FF555A', '#FFB628', '#008AEF', '#D6007B']
export const SCALES: { key: string; colors: string[] }[] = [
  { key: 'gyr', colors: ['#F8696B', '#FFEB84', '#63BE7B'] },
  { key: 'ryg', colors: ['#63BE7B', '#FFEB84', '#F8696B'] },
  { key: 'wg', colors: ['#FFFFFF', '', '#63BE7B'] },
  { key: 'wr', colors: ['#FFFFFF', '', '#F8696B'] },
  { key: 'bwr', colors: ['#5A8AC6', '#FCFCFF', '#F8696B'] },
]
/** The colour Sort by colour starts with. */
export const SORT_COLOR = '#FFC7CE'

/** A data bar as cell CSS: a lighter bar from the cell's start edge, `pct` of its width (mirrored in Arabic). */
export function barCss(bar: { pct: number; color: string }, rtl: boolean) {
  const pct = Math.round(bar.pct * 100)
  return { backgroundImage: `linear-gradient(${rtl ? 'to left' : 'to right'}, ${mix(bar.color, '#FFFFFF', 0.35)} ${pct}%, transparent ${pct}%)`, backgroundSize: '100% 70%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
}
export const DEFAULT_SCALE = ['#F8696B', '#FFEB84', '#63BE7B']

/**
 * The looks a sheet's rules give its cells (research R8), keyed `row|col`.
 * `rows` are the rows on screen (filtered rows don't count, as in Excel);
 * `value(row, col)` is a cell's text.
 */
export function evalRules(rules: ConditionalRule[], rows: string[], cols: string[], value: (row: string, col: string) => string, now = new Date()): Map<string, RuleLook> {
  const out = new Map<string, RuleLook>()
  if (!rules.length || !rows.length) return out
  const today = todayDay(now)
  const onScreen = new Set(rows), colSet = new Set(cols)
  const ordered = [...rules].sort((a, b) => a.priority - b.priority)
  for (const rule of ordered) {
    const rs = rule.range.rows === 'all' ? rows : rule.range.rows.filter(r => onScreen.has(r))
    const cs = rule.range.cols.filter(c => colSet.has(c))
    const cells: RuleCell[] = []
    for (const r of rs) for (const c of cs) cells.push({ row: r, col: c, text: value(r, c) })
    const hit = cellsFor(rule, cells, today)
    for (const [cell, look] of hit) {
      const k = `${cell.row}|${cell.col}`
      const have = out.get(k) ?? {}
      if (look.style) {
        const merged: CellStyle = { ...(have.style ?? {}) }
        for (const [f, v] of Object.entries(look.style)) if ((merged as Record<string, unknown>)[f] === undefined) (merged as Record<string, unknown>)[f] = v
        have.style = merged
      }
      if (look.bar && !have.bar) have.bar = look.bar
      if (look.scale && !have.scale) have.scale = look.scale
      out.set(k, have)
    }
  }
  return out
}

/** The cells one rule colours, and how. */
function cellsFor(rule: ConditionalRule, cells: RuleCell[], today: number): [RuleCell, RuleLook][] {
  const style = rule.style ?? {}
  const a = rule.args ?? {}
  switch (rule.kind) {
    case 'dup': case 'unique': {
      const count = new Map<string, number>()
      for (const c of cells) if (c.text.trim()) count.set(lower(c.text), (count.get(lower(c.text)) ?? 0) + 1)
      return cells.filter(c => c.text.trim() && (rule.kind === 'dup' ? count.get(lower(c.text))! > 1 : count.get(lower(c.text)) === 1)).map(c => [c, { style }])
    }
    case 'top': case 'bottom': {
      const nums = cells.map(c => ({ c, n: parseNumber(c.text) })).filter((x): x is { c: RuleCell; n: number } => x.n !== null)
      if (!nums.length) return []
      const want = Math.max(1, a.percent ? Math.ceil(nums.length * (a.n ?? 10) / 100) : Math.round(a.n ?? 10))
      const sorted = nums.map(x => x.n).sort((x, y) => (rule.kind === 'top' ? y - x : x - y))
      const edge = sorted[Math.min(want, sorted.length) - 1]
      return nums.filter(x => (rule.kind === 'top' ? x.n >= edge : x.n <= edge)).map(x => [x.c, { style }])
    }
    case 'bar': case 'scale': {
      const nums = cells.map(c => ({ c, n: parseNumber(c.text) })).filter((x): x is { c: RuleCell; n: number } => x.n !== null)
      if (!nums.length) return []
      let lo = Math.min(...nums.map(x => x.n)), hi = Math.max(...nums.map(x => x.n))
      if (rule.kind === 'bar') {
        lo = Math.min(0, lo)
        const color = a.colors?.[0] || DEFAULT_BAR
        return nums.map(x => [x.c, { bar: { pct: hi > lo ? Math.max(0.02, (x.n - lo) / (hi - lo)) : 1, color } }])
      }
      const [low, mid, high] = a.colors?.length ? a.colors : DEFAULT_SCALE
      return nums.map(x => {
        const t = hi > lo ? (x.n - lo) / (hi - lo) : 0.5
        const fill = mid ? (t < 0.5 ? mix(low, mid, t * 2) : mix(mid, high, (t - 0.5) * 2)) : mix(low, high, t)
        return [x.c, { scale: fill }]
      })
    }
    default:
      return cells.filter(c => matchValue(rule.kind, a, c.text, today)).map(c => [c, { style }])
  }
}

// ─── sort (FR-045) ───────────────────────────────────────────────────────────

/** A cell as sort and filter see it: its text and its look. */
export interface CellView { text: string; style: CellStyle | null }

/**
 * Rows in their new order (stable). Blanks go last whichever way. Sorting on
 * a colour puts the cells with that colour first (A to Z) or last (Z to A).
 */
export function sortRows<R>(rows: R[], keys: SortKey[], cell: (row: R, col: string) => CellView): R[] {
  if (!keys.length) return rows.slice()
  const idx = rows.map((r, i) => ({ r, i }))
  idx.sort((x, y) => {
    for (const k of keys) {
      const a = cell(x.r, k.col), b = cell(y.r, k.col)
      let d = 0
      if (k.on === 'fill' || k.on === 'color') {
        const has = (v: CellView) => ((k.on === 'fill' ? v.style?.fill : v.style?.color) ?? '').toUpperCase() === (k.color ?? '').toUpperCase()
        d = (has(a) ? 0 : 1) - (has(b) ? 0 : 1)
        if (k.dir === 'desc') d = -d
      } else {
        const ea = !a.text.trim(), eb = !b.text.trim()
        if (ea || eb) { if (ea !== eb) return ea ? 1 : -1; continue }
        d = compareKeys(keyOf(a.text), keyOf(b.text))
        if (k.dir === 'desc') d = -d
      }
      if (d) return d
    }
    return x.i - y.i
  })
  return idx.map(x => x.r)
}

/** Whether the first row looks like headings: text over a column that has numbers or dates under it, or bold over plain. */
export function looksLikeHeader(first: CellView[], second: CellView[] | undefined): boolean {
  if (!second || !first.some(c => c.text.trim())) return false
  const kindOf = (t: string) => { const k = keyOf(t); return 'n' in k ? 'n' : 'd' in k ? 'd' : 't' }
  if (first.some((c, i) => c.text.trim() && kindOf(c.text) === 't' && second[i] && second[i].text.trim() && kindOf(second[i].text) !== 't')) return true
  return first.some((c, i) => c.style?.b && !(second[i]?.style?.b))
}

// ─── filter (FR-046) ─────────────────────────────────────────────────────────

export const FILTER_OPS: FilterOp[] = ['contains', 'notContains', 'begins', 'ends', 'eq', 'neq', 'gt', 'lt', 'between', 'before', 'after', 'blank', 'notBlank']

/** Whether a cell passes a column's filter (every part that is set must match). */
export function passes(v: CellView, f: ColFilter | undefined): boolean {
  if (!f) return true
  const text = v.text.trim()
  if (f.values && !f.values.includes(text)) return false
  if (f.color !== undefined) {
    const have = ((f.on === 'color' ? v.style?.color : v.style?.fill) ?? '').toUpperCase()
    if (have !== f.color.toUpperCase()) return false
  }
  if (f.cond) {
    const { op, a = '', b = '' } = f.cond
    const t = lower(text), x = lower(a)
    switch (op) {
      case 'contains': if (!t.includes(x)) return false; break
      case 'notContains': if (t.includes(x)) return false; break
      case 'begins': if (!t.startsWith(x)) return false; break
      case 'ends': if (!t.endsWith(x)) return false; break
      case 'eq': if (t !== x) return false; break
      case 'neq': if (t === x) return false; break
      case 'blank': if (text) return false; break
      case 'notBlank': if (!text) return false; break
      case 'gt': case 'lt': case 'between': case 'before': case 'after': {
        if (!text) return false
        const kind = op === 'before' ? 'lt' : op === 'after' ? 'gt' : op
        if (!matchValue(kind, { a, b }, text, 0)) return false
        break
      }
    }
  }
  return true
}
export const filterOn = (f: ColFilter | undefined) => !!f && (f.values !== undefined || f.color !== undefined || !!f.cond)

/** The rows a sheet's filters keep. */
export function filterRows<R>(rows: R[], filter: Record<string, ColFilter> | undefined, cell: (row: R, col: string) => CellView): R[] {
  const cols = Object.entries(filter ?? {}).filter(([, f]) => filterOn(f))
  if (!cols.length) return rows
  return rows.filter(r => cols.every(([col, f]) => passes(cell(r, col), f)))
}

/** A column's values for the filter list (blanks as ''), A to Z, with how many rows have each; and its fills and text colours. */
export function columnValues<R>(rows: R[], col: string, cell: (row: R, col: string) => CellView) {
  const count = new Map<string, number>()
  const fills = new Set<string>(), colors = new Set<string>()
  for (const r of rows) {
    const v = cell(r, col)
    const t = v.text.trim()
    count.set(t, (count.get(t) ?? 0) + 1)
    if (v.style?.fill) fills.add(v.style.fill.toUpperCase())
    if (v.style?.color) colors.add(v.style.color.toUpperCase())
  }
  const values = [...count.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : compareKeys(keyOf(a), keyOf(b))))
  return { values: values.map(v => ({ value: v, n: count.get(v)! })), fills: [...fills], colors: [...colors] }
}

// ─── groups: the Content and Video sheets (FR-075) ───────────────────────────

/**
 * Sort and filter inside groups. `item` rows (a piece, a video) are sorted and
 * filtered; `child` rows (its clips) stay under their item; anything else (a
 * theme, a pillar, "+ Piece") stays where it is and bounds a group.
 */
export function arrangeGroups<R>(rows: R[], kind: (row: R) => 'item' | 'child' | 'fixed', sort: SortKey[] | undefined, filter: Record<string, ColFilter> | undefined, cell: (row: R, col: string) => CellView): R[] {
  const active = Object.values(filter ?? {}).some(filterOn)
  if (!sort?.length && !active) return rows
  const out: R[] = []
  let run: { item: R; kids: R[] }[] = []
  const flush = () => {
    let units = run
    if (active) { const keep = new Set(filterRows(units.map(u => u.item), filter, cell)); units = units.filter(u => keep.has(u.item)) }
    if (sort?.length) { const order = sortRows(units.map(u => u.item), sort, cell); const by = new Map(units.map(u => [u.item, u])); units = order.map(i => by.get(i)!) }
    for (const u of units) out.push(u.item, ...u.kids)
    run = []
  }
  for (const r of rows) {
    const k = kind(r)
    if (k === 'item') run.push({ item: r, kids: [] })
    else if (k === 'child' && run.length) run[run.length - 1].kids.push(r)
    else { flush(); out.push(r) }
  }
  flush()
  return out
}
