/**
 * Cell formatting for every sheet (spec 015 research R1–R3). Pure: no React,
 * no database, so the lab checks it in Node and the server validates with it.
 *
 * - A style is a small flat object (`CellStyle`). Every field is optional.
 * - A cell's look is layered like Excel's: the sheet's style, then its
 *   column's, then its row's, then its own. Each layer overrides only the
 *   fields it sets.
 * - Values stay the text people typed (R2). `display` only changes what is
 *   shown; editing and copying use the text.
 */
import type { BorderSide, CellStyle, Currency, NumberFormat, SheetFormatRecord } from '@/types/index'
import { CURRENCIES } from '@/types/index'

// ─── fonts and colours ──────────────────────────────────────────────────────

/** The set list of faces (FR-010): loaded web fonts first, then web-safe ones. */
export const FONTS: { name: string; stack: string }[] = [
  { name: 'Inter', stack: 'Inter, "Segoe UI", Arial, sans-serif' },
  { name: 'Montserrat', stack: 'Montserrat, "Segoe UI", Arial, sans-serif' },
  { name: 'IBM Plex Sans Arabic', stack: '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif' },
  { name: 'Caveat', stack: 'Caveat, "Comic Sans MS", cursive' },
  { name: 'Calibri', stack: 'Calibri, Carlito, Arial, sans-serif' },
  { name: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { name: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { name: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { name: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { name: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { name: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { name: 'Trebuchet MS', stack: '"Trebuchet MS", Arial, sans-serif' },
]
export const DEFAULT_FONT = 'Inter'
export const DEFAULT_SIZE = 10
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]
const FONT_BY_LOWER = new Map(FONTS.map(f => [f.name.toLowerCase(), f.name]))
/** A font name from anywhere (a paste from Excel), or null when it isn't in the list. */
export const knownFont = (name: string | null | undefined) => (name ? FONT_BY_LOWER.get(name.trim().replace(/^["']|["']$/g, '').toLowerCase()) ?? null : null)

/** Excel's theme colours (Office): background/text pairs, then six accents. */
export const THEME_COLORS = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'] as const
/** Excel's standard colours. */
export const STANDARD_COLORS = ['#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0'] as const

/** A colour lightened (f > 0) towards white or darkened (f < 0) towards black, as Excel's tints. */
export function tint(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const rgb = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)))
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
}
/** The five shades under a theme colour, as in Excel's picker. */
export function themeShades(index: number): number[] {
  if (index === 0) return [-0.05, -0.15, -0.25, -0.35, -0.5]
  if (index === 1) return [0.5, 0.35, 0.25, 0.15, 0.05]
  return [0.8, 0.6, 0.4, -0.25, -0.5]
}
/** Relative brightness 0–1, for picking readable text on a fill. */
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

// ─── validation (the server's guard, research R3) ───────────────────────────

const HEX = /^#[0-9A-Fa-f]{6}$/
const LINE_W = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'] as const
const HA = ['general', 'left', 'center', 'right', 'justify'] as const
const VA = ['top', 'middle', 'bottom'] as const
const NUM_KINDS = ['general', 'number', 'currency', 'accounting', 'percent', 'scientific', 'date', 'time', 'text'] as const
const NEG = ['minus', 'paren', 'red', 'paren-red'] as const
const PATTERN = /^[dmyhs\s/\-.,:'’]{1,40}$/i
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const oneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] => typeof v === 'string' && (list as readonly string[]).includes(v)
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : undefined)

function border(v: unknown): BorderSide | undefined {
  if (!isObj(v) || !oneOf(LINE_W, v.w) || typeof v.c !== 'string' || !HEX.test(v.c)) return undefined
  return { w: v.w, c: v.c.toUpperCase() }
}

export function validateNum(v: unknown): NumberFormat | undefined {
  if (!isObj(v) || !oneOf(NUM_KINDS, v.kind)) return undefined
  const out: NumberFormat = { kind: v.kind }
  const dp = int(v.dp, 0, 10); if (dp !== undefined) out.dp = dp
  if (typeof v.sep === 'boolean') out.sep = v.sep
  if (oneOf(CURRENCIES, v.cur)) out.cur = v.cur as Currency
  if (oneOf(NEG, v.neg)) out.neg = v.neg
  if (v.long === true) out.long = true
  if (typeof v.pattern === 'string' && PATTERN.test(v.pattern)) out.pattern = v.pattern
  return out
}

/** Keep only known fields, in range. Null when nothing is left (the record is then deleted). */
export function validateStyle(input: unknown): CellStyle | null {
  if (!isObj(input)) return null
  const s: CellStyle = {}
  const font = knownFont(typeof input.font === 'string' ? input.font : null); if (font) s.font = font
  const size = int(input.size, 6, 72); if (size !== undefined) s.size = size
  for (const k of ['b', 'i', 's', 'wrap'] as const) if (input[k] === true) s[k] = true
  if (input.u === 'single' || input.u === 'double') s.u = input.u
  for (const k of ['color', 'fill'] as const) { const c = input[k]; if (typeof c === 'string' && HEX.test(c)) s[k] = c.toUpperCase() }
  for (const k of ['bt', 'br', 'bb', 'bl'] as const) { const b = border(input[k]); if (b) s[k] = b }
  if (oneOf(HA, input.ha) && input.ha !== 'general') s.ha = input.ha
  if (oneOf(VA, input.va)) s.va = input.va
  const indent = int(input.indent, 0, 15); if (indent) s.indent = indent
  if (input.rot === 'vertical') s.rot = 'vertical'
  else { const rot = int(input.rot, -90, 90); if (rot) s.rot = rot }
  const num = validateNum(input.num); if (num && num.kind !== 'general') s.num = num
  return Object.keys(s).length ? s : null
}

// ─── layers ─────────────────────────────────────────────────────────────────

/**
 * Lay `patch` over `base`. A field set to null in the patch is removed (the
 * toolbar's "turn Bold off", "No fill", "No border"); undefined leaves it.
 */
export function mergeStyle(base: CellStyle | null | undefined, patch: Partial<Record<keyof CellStyle, unknown>> | null | undefined): CellStyle {
  const out: Record<string, unknown> = { ...(base ?? {}) }
  for (const [k, v] of Object.entries(patch ?? {})) {
    if (v === undefined) continue
    if (v === null || v === false) delete out[k]
    else out[k] = v
  }
  return out as CellStyle
}

/** The fields that differ, as a patch that turns `a` into `b` (nulls for removed fields). */
export function diffStyle(a: CellStyle | null | undefined, b: CellStyle | null | undefined): Partial<Record<keyof CellStyle, unknown>> {
  const out: Record<string, unknown> = {}
  const A = (a ?? {}) as Record<string, unknown>, B = (b ?? {}) as Record<string, unknown>
  for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
    if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) out[k] = k in B ? B[k] : null
  }
  return out as Partial<Record<keyof CellStyle, unknown>>
}

const SEP = '\u0001'
export const formatKey = (rowKey: string, colKey: string) => `${rowKey}${SEP}${colKey}`
export type FormatIndex = Map<string, CellStyle>
export function indexFormats(records: SheetFormatRecord[]): FormatIndex {
  return new Map(records.map(r => [formatKey(r.rowKey, r.colKey), r.style]))
}

/** A cell's look: sheet, then column, then row, then the cell (FR edge case: layers). */
export function resolveStyle(index: FormatIndex, rowKey: string, colKey: string): CellStyle | null {
  const layers = [index.get(formatKey('', '')), index.get(formatKey('', colKey)), index.get(formatKey(rowKey, '')), index.get(formatKey(rowKey, colKey))]
  let out: CellStyle | null = null
  for (const l of layers) if (l) out = { ...(out ?? {}), ...l }
  return out
}

/** A stable key for a style: equal looks share one key, and one CSS object. */
export function styleKey(s: CellStyle | null | undefined): string {
  if (!s) return ''
  const o = s as Record<string, unknown>
  return Object.keys(o).sort().map(k => `${k}:${JSON.stringify(o[k])}`).join('|')
}

// ─── on screen ──────────────────────────────────────────────────────────────

type Css = Record<string, string | number>
export interface CellCss {
  /** On the cell: font, colours, alignment. */
  cell: Css
  /** On the text inside, when it is rotated. */
  text: Css | null
  /** On an overlay inside the cell: the borders, with their real line styles. */
  border: Css | null
}
const LINE_PX = { thin: 1, medium: 2, thick: 3, dashed: 1, dotted: 1, double: 3 } as const
const LINE_STYLE = { thin: 'solid', medium: 'solid', thick: 'solid', dashed: 'dashed', dotted: 'dotted', double: 'double' } as const
const CSS_CACHE = new Map<string, CellCss>()
let cacheHits = 0
export const cssCacheStats = () => ({ size: CSS_CACHE.size, hits: cacheHits })

/**
 * The CSS for a style, cached by its key. Left and right are logical
 * (inline-start and -end), so they mirror in Arabic as in Excel's
 * right-to-left sheets. With a fill and no text colour, the text turns white
 * on dark fills (research R3, "Automatic").
 */
export function toCss(s: CellStyle | null | undefined): CellCss {
  const key = styleKey(s)
  const hit = CSS_CACHE.get(key)
  if (hit) { cacheHits++; return hit }
  const cell: Css = {}, text: Css = {}, border: Css = {}
  if (s) {
    if (s.font) cell.fontFamily = (FONTS.find(f => f.name === s.font) ?? FONTS[0]).stack
    if (s.size) cell.fontSize = `${s.size}pt`
    if (s.b) cell.fontWeight = 700
    if (s.i) cell.fontStyle = 'italic'
    const deco = [s.u ? 'underline' : '', s.s ? 'line-through' : ''].filter(Boolean).join(' ')
    if (deco) cell.textDecorationLine = deco
    if (s.u === 'double') cell.textDecorationStyle = 'double'
    if (s.fill) cell.backgroundColor = s.fill
    if (s.color) cell.color = s.color
    else if (s.fill) cell.color = luminance(s.fill) < 0.5 ? '#FFFFFF' : '#14131A'
    if (s.ha) {
      cell.textAlign = { left: 'start', center: 'center', right: 'end', justify: 'justify', general: 'start' }[s.ha]
      cell.justifyContent = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'flex-start', general: 'flex-start' }[s.ha]
    }
    if (s.va) cell.alignItems = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[s.va]
    if (s.wrap) { cell.whiteSpace = 'pre-wrap'; cell.overflowWrap = 'anywhere' }
    if (s.indent) cell.paddingInlineStart = `${8 + s.indent * 12}px`
    if (s.rot === 'vertical') { text.writingMode = 'vertical-rl'; text.textOrientation = 'upright' }
    else if (typeof s.rot === 'number' && s.rot) { text.display = 'inline-block'; text.transform = `rotate(${-s.rot}deg)` }
    const sides = [['bt', 'borderTop'], ['bb', 'borderBottom'], ['bl', 'borderInlineStart'], ['br', 'borderInlineEnd']] as const
    for (const [k, prop] of sides) { const b = s[k]; if (b) border[prop] = `${LINE_PX[b.w]}px ${LINE_STYLE[b.w]} ${b.c}` }
  }
  const out: CellCss = { cell, text: Object.keys(text).length ? text : null, border: Object.keys(border).length ? border : null }
  if (CSS_CACHE.size > 5000) CSS_CACHE.clear()
  CSS_CACHE.set(key, out)
  return out
}

// ─── number and date display (research R2) ──────────────────────────────────

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
/** Arabic and Persian digits, and the Arabic decimal and thousands marks, as plain ASCII. */
export function westernDigits(t: string): string {
  return t.replace(/[٠-٩]/g, d => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, d => String(FA_DIGITS.indexOf(d))).replace(/٫/g, '.').replace(/٬/g, ',')
}

/** A number read from typed text (12500, 1,250.5, -3, 12.5%, (1,234), Arabic digits); null when it isn't one. */
export function parseNumber(text: string): number | null {
  let t = westernDigits(text).trim().replace(/ /g, ' ')
  if (!t) return null
  let neg = false
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim() }
  if (t.startsWith('-') || t.startsWith('−')) { neg = !neg; t = t.slice(1).trim() }
  const pct = t.endsWith('%')
  if (pct) t = t.slice(0, -1).trim()
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$|^\.\d+$/.test(t)) return null
  const n = parseFloat(t.replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return (neg ? -n : n) / (pct ? 100 : 1)
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** A date read from typed text: 2026-11-16, 16/11/2026 (day first), 16 Nov 2026, Nov 16, 2026. */
export function parseDate(text: string): { y: number; m: number; d: number; h?: number; min?: number } | null {
  const t = westernDigits(text).trim()
  let y: number, m: number, d: number, h: number | undefined, min: number | undefined
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(t)
  if (x) { y = +x[1]; m = +x[2]; d = +x[3]; if (x[4]) { h = +x[4]; min = +x[5] } }
  else if ((x = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) { d = +x[1]; m = +x[2]; y = +x[3] }
  else if ((x = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(t))) { d = +x[1]; m = MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()) + 1; y = +x[3] }
  else if ((x = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t))) { m = MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1; d = +x[2]; y = +x[3] }
  else return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const probe = new Date(Date.UTC(y, m - 1, d))
  if (probe.getUTCMonth() !== m - 1) return null
  return { y, m, d, h, min }
}
/** A time read from typed text: 14:30, 2:30 pm. */
export function parseTime(text: string): { h: number; min: number } | null {
  const x = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|ص|م)?$/i.exec(westernDigits(text).trim())
  if (!x) return null
  let h = +x[1]
  const pm = x[3] && /pm|م/i.test(x[3]), am = x[3] && /am|ص/i.test(x[3])
  if (pm && h < 12) h += 12
  if (am && h === 12) h = 0
  return h < 24 && +x[2] < 60 ? { h, min: +x[2] } : null
}

/** The Intl locale for the member's language: day-first English, Egyptian Arabic. */
export const intlLocale = (lang: string) => (lang.startsWith('ar') ? 'ar-EG' : 'en-GB')

/** A custom date pattern (FR-022): d, dd, ddd, dddd, m, mm, mmm, mmmm, yy, yyyy. */
export function formatPattern(date: Date, pattern: string, lang: string): string {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(intlLocale(lang), { timeZone: 'UTC', ...o }).format(date)
  const parts: Record<string, () => string> = {
    dddd: () => f({ weekday: 'long' }), ddd: () => f({ weekday: 'short' }), dd: () => f({ day: '2-digit' }), d: () => f({ day: 'numeric' }),
    mmmm: () => f({ month: 'long' }), mmm: () => f({ month: 'short' }), mm: () => f({ month: '2-digit' }), m: () => f({ month: 'numeric' }),
    yyyy: () => f({ year: 'numeric' }), yy: () => f({ year: '2-digit' }),
  }
  return pattern.replace(/dddd|ddd|dd|d|mmmm|mmm|mm|m|yyyy|yy/gi, t => parts[t.toLowerCase()]())
}

/**
 * What a cell shows (FR-020–FR-023). Text that the format can't read is
 * shown as typed, with no error. The stored value never changes.
 */
export function display(text: string, num: NumberFormat | null | undefined, lang = 'en'): string {
  if (!num || num.kind === 'general' || num.kind === 'text' || text === '') return text
  const loc = intlLocale(lang)
  if (num.kind === 'date' || num.kind === 'time') {
    const d = parseDate(text)
    if (num.kind === 'time') {
      const t = d && d.h !== undefined ? { h: d.h, min: d.min ?? 0 } : parseTime(text)
      if (!t) return text
      return new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, t.h, t.min)))
    }
    if (!d) return text
    const date = new Date(Date.UTC(d.y, d.m - 1, d.d))
    if (num.pattern) return formatPattern(date, num.pattern, lang)
    return new Intl.DateTimeFormat(loc, num.long
      ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }
      : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
  }
  const n = parseNumber(text)
  if (n === null) return text
  const dp = num.dp ?? (num.kind === 'percent' ? 0 : 2)
  const o: Intl.NumberFormatOptions = { minimumFractionDigits: dp, maximumFractionDigits: dp, useGrouping: num.kind === 'number' ? num.sep !== false : true }
  const abs = Math.abs(n)
  let s: string
  if (num.kind === 'currency' || num.kind === 'accounting') s = new Intl.NumberFormat(loc, { ...o, style: 'currency', currency: num.cur ?? 'EGP', currencyDisplay: 'code' }).format(abs)
  else if (num.kind === 'percent') s = new Intl.NumberFormat(loc, { ...o, style: 'percent' }).format(abs)
  else if (num.kind === 'scientific') {
    const [m, e] = abs.toExponential(dp).split('e')
    const exp = Number(e)
    s = `${m}E${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`
  } else s = new Intl.NumberFormat(loc, o).format(abs)
  if (n < 0 && abs > 0) s = num.neg === 'paren' || num.neg === 'paren-red' ? `(${s})` : `-${s}`
  return s
}

/** Negative numbers shown in red (FR-021). */
export const showsRed = (text: string, num: NumberFormat | null | undefined) =>
  !!num && (num.neg === 'red' || num.neg === 'paren-red') && (parseNumber(text) ?? 0) < 0

/** Increase or Decrease decimal (US2 scenario 5): General becomes Number first. */
export function bumpDecimals(num: NumberFormat | null | undefined, delta: 1 | -1, text = ''): NumberFormat {
  const base: NumberFormat = !num || num.kind === 'general' || num.kind === 'text'
    ? { kind: 'number', dp: decimalsIn(text), sep: false }
    : { ...num }
  const dp = base.dp ?? (base.kind === 'percent' ? 0 : 2)
  return { ...base, dp: Math.max(0, Math.min(10, dp + delta)) }
}
const decimalsIn = (text: string) => { const n = westernDigits(text).match(/\.(\d+)/); return n ? Math.min(10, n[1].length) : 0 }

/** Excel's `mso-number-format` and Google Sheets' number formats, roughly, for pasting (SC-003). */
export function numFromExcel(code: string | null | undefined): NumberFormat | undefined {
  if (!code) return undefined
  const c = code.replace(/\\/g, '').replace(/"/g, '').trim()
  const dp = (c.match(/0\.(0+)/)?.[1].length) ?? 0
  if (/^@$/.test(c)) return { kind: 'text' }
  if (/%/.test(c)) return { kind: 'percent', dp }
  if (/E\+/i.test(c)) return { kind: 'scientific', dp }
  const cur = CURRENCIES.find(x => c.includes(x)) ?? (c.includes('$') ? 'USD' : c.includes('€') ? 'EUR' : c.includes('£') ? 'GBP' : undefined)
  if (cur) return { kind: 'currency', cur, dp }
  if (/[dy]/i.test(c) && /m/i.test(c)) return { kind: 'date', pattern: PATTERN.test(c) ? c.toLowerCase() : undefined }
  if (/h{1,2}:mm/i.test(c)) return { kind: 'time' }
  if (/#,##0|0/.test(c)) return { kind: 'number', dp, sep: c.includes(',') }
  return undefined
}
