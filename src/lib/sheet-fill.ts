/**
 * The fill handle and Flash Fill (spec 020 research R4, R5). Pure.
 *
 * `planSeries` continues one line of source cells (a column when filling down,
 * a row when filling right) by `count` cells, the way Excel's AutoFill does:
 * - numbers continue their trend (one number copies unless asked for a series);
 * - text ending in a number counts on ("Item 3" → "Item 4");
 * - dates step by day, weekday, month or year (weekdays skip the weekend);
 * - month and day names continue in their own language and spelling;
 * - items of a custom list continue that list;
 * - anything else repeats.
 *
 * Filling up or left is the same with the source read backwards: the caller
 * reverses the line and gets the new values nearest-first.
 *
 * `learnFlash` finds one way of building the typed examples from the cells
 * beside them, and applies it to the rest (Ctrl+E).
 */
import { parseDate, parseNumber, westernDigits } from '@/lib/sheet-format'

export type FillMode = 'copy' | 'series' | 'formats' | 'values' | 'days' | 'weekdays' | 'months' | 'years' | 'linear' | 'growth' | 'flash'

/** A workspace's custom list (Settings › Sheet lists): items in order. */
export interface FillList { id: string; name: string; items: string[] }

export interface FillCtx {
  /** Custom lists, then the built-in ones are tried. */
  lists?: string[][]
  /** Days off, 0 = Sunday … 6 = Saturday (default Friday and Saturday). */
  weekend?: number[]
}

// ── built-in lists (Excel's, plus Arabic) ────────────────────────────────────
export const BUILTIN_LISTS: string[][] = [
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
]
/** Limits for a workspace's lists (data-model.md). */
export const FILL_LIST_LIMITS = { lists: 50, minItems: 2, maxItems: 200, itemLen: 60, nameLen: 60 }

/** Lists as an admin typed them: trimmed, de-duplicated, within the limits; bad ones dropped. */
export function cleanFillLists(input: unknown): FillList[] {
  if (!Array.isArray(input)) return []
  const out: FillList[] = []
  for (const x of input.slice(0, FILL_LIST_LIMITS.lists)) {
    const l = x as Partial<FillList> | null
    if (!l || !Array.isArray(l.items)) continue
    const seen = new Set<string>()
    const items: string[] = []
    for (const it of l.items) {
      if (typeof it !== 'string') continue
      const v = it.trim().slice(0, FILL_LIST_LIMITS.itemLen)
      const k = v.toLowerCase()
      if (!v || seen.has(k)) continue
      seen.add(k); items.push(v)
      if (items.length >= FILL_LIST_LIMITS.maxItems) break
    }
    if (items.length < FILL_LIST_LIMITS.minItems) continue
    const id = typeof l.id === 'string' && /^[\w-]{1,40}$/.test(l.id) ? l.id : `l${out.length + 1}`
    const name = (typeof l.name === 'string' ? l.name.trim() : '').slice(0, FILL_LIST_LIMITS.nameLen) || items.slice(0, 3).join(', ')
    out.push({ id, name, items })
  }
  return out
}

// ── reading the source ───────────────────────────────────────────────────────
type DateShape = { kind: 'iso'; time: boolean } | { kind: 'dmy'; sep: string; pad: boolean } | { kind: 'text' }
interface DateVal { t: number; shape: DateShape }
const DAY = 86_400_000

function readDate(text: string): DateVal | null {
  const p = parseDate(text)
  if (!p) return null
  const t = westernDigits(text).trim()
  const shape: DateShape = /^\d{4}-/.test(t) ? { kind: 'iso', time: p.h !== undefined }
    : /^\d{1,2}[/.-]\d{1,2}[/.-]\d{4}$/.test(t) ? { kind: 'dmy', sep: (/[/.-]/.exec(t) ?? ['/'])[0], pad: /^\d{2}[/.-]\d{2}/.test(t) }
    : { kind: 'text' }
  return { t: Date.UTC(p.y, p.m - 1, p.d, p.h ?? 0, p.min ?? 0), shape }
}
const MONTHS_SHORT = BUILTIN_LISTS[2]
function writeDate(t: number, shape: DateShape): string {
  const d = new Date(t)
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate()
  const p2 = (n: number) => String(n).padStart(2, '0')
  if (shape.kind === 'iso') return `${y}-${p2(m)}-${p2(day)}${shape.time ? ` ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}` : ''}`
  if (shape.kind === 'dmy') return shape.pad ? `${p2(day)}${shape.sep}${p2(m)}${shape.sep}${y}` : `${day}${shape.sep}${m}${shape.sep}${y}`
  return `${day} ${MONTHS_SHORT[m - 1]} ${y}`
}
/** Months between two dates when they fall on the same day of the month, else null. */
function monthsBetween(a: number, b: number): number | null {
  const x = new Date(a), y = new Date(b)
  if (x.getUTCDate() !== y.getUTCDate()) return null
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth()
}
function addMonths(t: number, n: number): number {
  const d = new Date(t)
  const day = d.getUTCDate()
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, d.getUTCHours(), d.getUTCMinutes()))
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, last))
  return target.getTime()
}

/** "Item 3", "W12", "Q1": text with a last run of digits to count on. */
const TRAIL = /^(.*?)(\d+)(\D*)$/
function readTrail(text: string): { pre: string; n: number; width: number; post: string } | null {
  const x = TRAIL.exec(text)
  if (!x || (!x[1] && !x[3])) return null
  return { pre: x[1], n: Number(x[2]), width: x[2].length, post: x[3] }
}

/** Where a value sits in a list, and how it's spelled (Jan, JAN, jan). */
function inList(text: string, lists: string[][]): { list: string[]; i: number; casing: 'title' | 'upper' | 'lower' | 'as' } | null {
  const k = text.trim().toLowerCase()
  if (!k) return null
  for (const list of lists) {
    const i = list.findIndex(x => x.toLowerCase() === k)
    if (i < 0) continue
    const t = text.trim()
    const casing = t === list[i] ? 'as' : t === t.toUpperCase() && t !== t.toLowerCase() ? 'upper' : t === t.toLowerCase() && t !== t.toUpperCase() ? 'lower' : 'title'
    return { list, i, casing }
  }
  return null
}
const caseLike = (v: string, casing: 'title' | 'upper' | 'lower' | 'as') =>
  casing === 'upper' ? v.toUpperCase() : casing === 'lower' ? v.toLowerCase() : casing === 'title' ? v[0].toUpperCase() + v.slice(1).toLowerCase() : v

/** Best-fit line through (0, y0), (1, y1)…: its slope and intercept. */
function fitLine(ys: number[]): { a: number; b: number } {
  const n = ys.length
  if (n === 1) return { a: 1, b: ys[0] }
  const mx = (n - 1) / 2, my = ys.reduce((s, y) => s + y, 0) / n
  let sxy = 0, sxx = 0
  ys.forEach((y, x) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2 })
  const a = sxx ? sxy / sxx : 0
  return { a, b: my - a * mx }
}
/** A number written with as many decimals as it needs (no float noise). */
function num(n: number): string {
  const r = Math.round(n * 1e10) / 1e10
  return String(Object.is(r, -0) ? 0 : r)
}

/** What the source is, for the default mode and the menus. */
export type SourceKind = 'empty' | 'number' | 'date' | 'trail' | 'list' | 'text' | 'mixed'
export function sourceKind(src: string[], ctx: FillCtx = {}): SourceKind {
  const vals = src.filter(v => v.trim() !== '')
  if (!vals.length) return 'empty'
  const lists = [...(ctx.lists ?? []), ...BUILTIN_LISTS]
  const kinds = new Set(vals.map(v => parseNumber(v) !== null ? 'number' : readDate(v) ? 'date' : inList(v, lists) ? 'list' : readTrail(v) ? 'trail' : 'text'))
  return kinds.size === 1 ? [...kinds][0] as SourceKind : 'mixed'
}

/** Excel's default when you just drag: one number copies, everything else counts on. */
export function defaultMode(src: string[], ctx: FillCtx = {}): 'copy' | 'series' {
  const vals = src.filter(v => v.trim() !== '')
  const k = sourceKind(src, ctx)
  if (k === 'text' || k === 'mixed' || k === 'empty') return 'copy'
  if (k === 'number' && vals.length === 1) return 'copy'
  return 'series'
}

/** The modes that make sense for this source (Auto Fill Options and the right-drag menu). */
export function fillModesFor(src: string[], ctx: FillCtx = {}): FillMode[] {
  const k = sourceKind(src, ctx)
  const base: FillMode[] = ['copy', 'series', 'formats', 'values']
  if (k === 'date') return [...base, 'days', 'weekdays', 'months', 'years']
  return base
}

function weekdayStep(t: number, dir: 1 | -1, weekend: Set<number>): number {
  let x = t
  for (let guard = 0; guard < 8; guard++) { x += dir * DAY; if (!weekend.has(new Date(x).getUTCDay())) return x }
  return x
}

/**
 * The next `count` values after the source line. `mode` 'copy' repeats it;
 * 'series' (and the date modes, 'linear', 'growth') continue it. 'formats'
 * leaves values alone (null); 'values' is like the default without formats.
 */
export function planSeries(src: string[], count: number, mode: FillMode, ctx: FillCtx = {}): (string | null)[] {
  if (count <= 0) return []
  if (mode === 'formats') return Array(count).fill(null)
  const vals = src.length ? src : ['']
  const cycle = () => Array.from({ length: count }, (_, i) => vals[i % vals.length])
  let m = mode
  if (m === 'values' || m === 'flash') m = defaultMode(vals, ctx)
  if (m === 'copy') return cycle()
  const lists = [...(ctx.lists ?? []), ...BUILTIN_LISTS]
  const filled = vals.filter(v => v.trim() !== '')
  if (!filled.length) return cycle()

  // Numbers: a trend, or a growth by a ratio.
  const nums = filled.map(v => parseNumber(v))
  if (nums.every((n): n is number => n !== null)) {
    if (m === 'growth') {
      if (nums.some(n => n <= 0)) return cycle()
      const f = fitLine(nums.length === 1 ? [Math.log(nums[0]), Math.log(nums[0])] : nums.map(Math.log))
      const ratio = nums.length === 1 ? 1 : Math.exp(f.a)
      return Array.from({ length: count }, (_, i) => num(Math.exp(f.b + f.a * (nums.length - 1)) * ratio ** (i + 1)))
    }
    if (nums.length === 1) return Array.from({ length: count }, (_, i) => num(nums[0] + i + 1))
    const f = fitLine(nums)
    return Array.from({ length: count }, (_, i) => num(f.b + f.a * (nums.length + i)))
  }

  // Dates: by day, weekday, month or year; a plain series keeps the source's step.
  const dates = filled.map(readDate)
  if (dates.every((d): d is DateVal => !!d)) {
    const shape = dates[dates.length - 1].shape
    const last = dates[dates.length - 1].t
    const weekend = new Set(ctx.weekend ?? [5, 6])
    if (m === 'weekdays') {
      const out: string[] = []
      let t = last
      for (let i = 0; i < count; i++) { t = weekdayStep(t, 1, weekend); out.push(writeDate(t, shape)) }
      return out
    }
    let unit: 'day' | 'month' | 'year' = m === 'months' ? 'month' : m === 'years' ? 'year' : 'day'
    let step = 1
    if (dates.length > 1 && (m === 'series' || m === 'linear')) {
      const mo = monthsBetween(dates[0].t, dates[1].t)
      if (mo !== null && mo !== 0) { unit = mo % 12 === 0 ? 'year' : 'month'; step = unit === 'year' ? mo / 12 : mo }
      else step = Math.round((dates[1].t - dates[0].t) / DAY) || 1
    } else if (dates.length > 1) {
      // A unit chosen from the menu: the source's step in that unit, when it has one.
      const mo = monthsBetween(dates[0].t, dates[1].t)
      if (unit === 'day') step = Math.round((dates[1].t - dates[0].t) / DAY) || 1
      else if (mo) step = unit === 'year' ? Math.max(1, Math.round(mo / 12)) : mo
    }
    return Array.from({ length: count }, (_, i) => {
      const n = step * (i + 1)
      const t = unit === 'day' ? last + n * DAY : addMonths(last, unit === 'year' ? n * 12 : n)
      return writeDate(t, shape)
    })
  }

  // A list (month or day names, a custom list): on through the list, wrapping.
  const inL = filled.map(v => inList(v, lists))
  if (inL.every(x => !!x) && inL.every(x => x!.list === inL[0]!.list)) {
    const list = inL[0]!.list, L = list.length
    const step = inL.length > 1 ? ((inL[1]!.i - inL[0]!.i) % L + L) % L || 1 : 1
    const lastI = inL[inL.length - 1]!.i, casing = inL[inL.length - 1]!.casing
    return Array.from({ length: count }, (_, i) => caseLike(list[(lastI + step * (i + 1)) % L], casing))
  }

  // Text ending in a number: count on, keeping the zeros ("W01" → "W02").
  const tr = filled.map(readTrail)
  if (tr.every(x => !!x) && tr.every(x => x!.pre === tr[0]!.pre && x!.post === tr[0]!.post)) {
    const ns = tr.map(x => x!.n)
    const step = ns.length > 1 ? ns[1] - ns[0] || 1 : 1
    const last = tr[tr.length - 1]!
    return Array.from({ length: count }, (_, i) => {
      const n = Math.max(0, last.n + step * (i + 1))
      return `${last.pre}${String(n).padStart(last.width, '0')}${last.post}`
    })
  }
  return cycle()
}

/** The value the drag tooltip shows: the last cell the fill would write. */
export function previewValue(src: string[], count: number, mode: FillMode, ctx: FillCtx = {}): string {
  if (count <= 0) return src[src.length - 1] ?? ''
  const out = planSeries(src, count, mode, ctx)
  return out[out.length - 1] ?? ''
}

// ── Series… dialog (Home › Fill › Series) ────────────────────────────────────
export interface SeriesSpec { type: 'linear' | 'growth' | 'date' | 'autofill'; unit: 'day' | 'weekday' | 'month' | 'year'; step: number; stop: number | null; trend: boolean }
/** Values after the first cell, for `count` cells (stopping at the stop value when set). */
export function planSeriesDialog(first: string, count: number, spec: SeriesSpec, ctx: FillCtx = {}): string[] {
  const out: string[] = []
  if (spec.type === 'autofill') return planSeries([first], count, 'series', ctx).map(v => v ?? '')
  if (spec.type === 'date') {
    const d = readDate(first)
    if (!d) return out
    const weekend = new Set(ctx.weekend ?? [5, 6])
    let t = d.t
    for (let i = 0; i < count; i++) {
      // Months and years count from the first date, so 31 Jan → 28 Feb → 31 Mar (not 28 Mar).
      if (spec.unit === 'weekday') { for (let k = 0; k < Math.max(1, Math.abs(spec.step)); k++) t = weekdayStep(t, spec.step < 0 ? -1 : 1, weekend) }
      else t = spec.unit === 'day' ? t + spec.step * DAY : addMonths(d.t, (spec.unit === 'year' ? spec.step * 12 : spec.step) * (i + 1))
      out.push(writeDate(t, d.shape))
    }
    return out
  }
  const n0 = parseNumber(first)
  if (n0 === null) return out
  let v = n0
  for (let i = 0; i < count; i++) {
    v = spec.type === 'growth' ? v * spec.step : v + spec.step
    if (spec.stop !== null && ((spec.step >= 0 || spec.type === 'growth') ? v > spec.stop : v < spec.stop)) break
    out.push(num(v))
  }
  return out
}

// ── Flash Fill (R5) ──────────────────────────────────────────────────────────
/** A piece of an output: a token of a source cell (by index from the start or the end), a case change, or fixed text. */
type Piece = { kind: 'tok'; col: number; i: number; fromEnd: boolean; cas: 'as' | 'upper' | 'lower' | 'title' | 'initial' } | { kind: 'lit'; text: string }
type Program = Piece[]

const tokensOf = (s: string) => s.split(/[\s,;@._/\\|()\-]+/).filter(Boolean)
const castTo = (v: string, c: Extract<Piece, { kind: 'tok' }>['cas']) =>
  c === 'upper' ? v.toUpperCase() : c === 'lower' ? v.toLowerCase() : c === 'title' ? (v[0]?.toUpperCase() ?? '') + v.slice(1).toLowerCase() : c === 'initial' ? (v[0] ?? '') : v

function run(p: Program, row: string[]): string | null {
  let out = ''
  for (const x of p) {
    if (x.kind === 'lit') { out += x.text; continue }
    const toks = tokensOf(row[x.col] ?? '')
    const tok = x.fromEnd ? toks[toks.length - 1 - x.i] : toks[x.i]
    if (tok === undefined) return null
    out += castTo(tok, x.cas)
  }
  return out
}

/** The ways one output can be built from one source row: up to three tokens with literal joins. */
function programsFor(row: string[], target: string): Program[] {
  const found: Program[] = []
  const options: Extract<Piece, { kind: 'tok' }>[] = []
  row.forEach((cell, col) => {
    const toks = tokensOf(cell)
    toks.forEach((_, i) => {
      for (const cas of ['as', 'upper', 'lower', 'title', 'initial'] as const) {
        options.push({ kind: 'tok', col, i, fromEnd: false, cas })
        options.push({ kind: 'tok', col, i: toks.length - 1 - i, fromEnd: true, cas })
      }
    })
  })
  // Depth-first: at each point, a token whose text starts the rest of the target, then optional literal glue.
  const walk = (pos: number, acc: Program, toks: number) => {
    if (found.length > 400) return
    if (pos === target.length) { if (toks > 0) found.push(acc); return }
    if (toks >= 3) {
      // Only fixed text may finish it.
      found.push([...acc, { kind: 'lit', text: target.slice(pos) }])
      return
    }
    for (const o of options) {
      const v = run([o], row)
      if (!v || !target.startsWith(v, pos)) continue
      walk(pos + v.length, [...acc, o], toks + 1)
    }
    // Literal glue: up to the next character that some token could start with (spaces, punctuation, short affixes).
    for (let end = pos + 1; end <= Math.min(target.length, pos + 3); end++) {
      const lit = target.slice(pos, end)
      // Glue is punctuation and spaces; letters and digits must come from the cells.
      if (/[\p{L}\p{N}]/u.test(lit)) break
      const prev = acc[acc.length - 1]
      if (prev?.kind === 'lit') continue
      walk(end, [...acc, { kind: 'lit', text: lit }], toks)
    }
  }
  walk(0, [], 0)
  return found
}
const progKey = (p: Program) => JSON.stringify(p)

/**
 * Flash Fill: `examples` are the typed outputs (with their source rows);
 * `rows` are the source rows to fill. Returns the outputs, or null when the
 * examples don't agree on one way (Excel: "give one more example").
 */
export function learnFlash(examples: { row: string[]; out: string }[], rows: string[][]): string[] | null {
  const ex = examples.filter(e => e.out.trim() !== '')
  if (!ex.length) return null
  let keep: Program[] | null = null
  for (const e of ex) {
    const progs = programsFor(e.row, e.out)
    if (!keep) keep = progs
    else { const ks = new Set(progs.map(progKey)); keep = keep.filter(p => ks.has(progKey(p))) }
    if (!keep.length) return null
  }
  // Prefer the simplest: fewest pieces, tokens counted from the start, no case change.
  const score = (p: Program) => p.length * 10 + p.filter(x => x.kind === 'tok' && x.fromEnd).length + p.filter(x => x.kind === 'tok' && x.cas !== 'as').length * 2
  const ranked = [...(keep ?? [])].sort((a, b) => score(a) - score(b))
  const outs = rows.map(r => ranked.length ? run(ranked[0], r) : null)
  // Every candidate must agree, or the best one must clearly win (the rest are the same up to case or token counting).
  const disagree = ranked.slice(1, 12).some(p => rows.some((r, i) => run(p, r) !== outs[i]) && score(p) === score(ranked[0]))
  if (disagree) return null
  return outs.map(o => o ?? '')
}
