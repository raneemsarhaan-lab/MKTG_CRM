/**
 * Data › Clean up (spec 020 tips 52, 54, 55, 61–63, 66, 67; research R10)
 * and Data › Advanced Filter's criteria range (tip 78, research R11). Pure:
 * each tool returns a plan; the sheet turns it into one undo step.
 */
import { parseNumber } from '@/lib/sheet-format'
import { wildRegex } from '@/lib/sheet-tools'

// ─── Remove Duplicates ──────────────────────────────────────────────────────

/** How Excel compares rows for Remove Duplicates: the chosen cells' text, ignoring case. */
export const dupKey = (cells: string[]) => cells.map(c => c.toLocaleLowerCase()).join('\u0001')

/** Which rows go (indexes into `rows`): every row after the first of its kind. */
export function dedupePlan(rows: string[][]): number[] {
  const seen = new Set<string>(), out: number[] = []
  rows.forEach((r, i) => { const k = dupKey(r); if (seen.has(k)) out.push(i); else seen.add(k) })
  return out
}

// ─── Text to Columns ────────────────────────────────────────────────────────

export interface SplitDelims { tab?: boolean; semicolon?: boolean; comma?: boolean; space?: boolean; other?: string }
export type SplitOpts =
  | { mode: 'delim'; delims: SplitDelims; consecutive?: boolean; qualifier?: '"' | "'" | '' }
  | { mode: 'fixed'; breaks: number[] }
export const MAX_SPLIT_COLS = 50

/** One value split into its parts (Excel's step 2). */
export function splitOne(text: string, o: SplitOpts): string[] {
  if (o.mode === 'fixed') {
    const cuts = [...new Set(o.breaks.filter(b => b > 0))].sort((a, b) => a - b)
    const chars = [...text]
    const out: string[] = []
    let from = 0
    for (const b of cuts) { if (b >= chars.length) break; out.push(chars.slice(from, b).join('').trim()); from = b }
    out.push(chars.slice(from).join('').trim())
    return out.slice(0, MAX_SPLIT_COLS)
  }
  const set = new Set<string>()
  if (o.delims.tab) set.add('\t')
  if (o.delims.semicolon) { set.add(';'); set.add('؛') }
  if (o.delims.comma) { set.add(','); set.add('،') }
  if (o.delims.space) set.add(' ')
  if (o.delims.other) set.add(o.delims.other[0])
  if (!set.size) return [text]
  const q = o.qualifier ?? '"'
  const out: string[] = []
  let cur = '', inQ = false, lastWasDelim = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q && ch === q) {
      if (inQ && text[i + 1] === q) { cur += q; i++; continue }
      inQ = !inQ; lastWasDelim = false; continue
    }
    if (!inQ && set.has(ch)) {
      if (o.consecutive && lastWasDelim) continue
      out.push(cur); cur = ''; lastWasDelim = true
      continue
    }
    cur += ch; lastWasDelim = false
  }
  out.push(cur)
  return out.map(s => s.trim()).slice(0, MAX_SPLIT_COLS)
}

/** Every value split, and how many columns the widest takes. */
export function splitPlan(values: string[], o: SplitOpts): { parts: string[][]; width: number } {
  const parts = values.map(v => (v === '' ? [''] : splitOne(v, o)))
  return { parts, width: Math.max(1, ...parts.map(p => p.length)) }
}

// ─── cell rewrites ──────────────────────────────────────────────────────────

/** Trim Spaces and Clean: no leading, trailing or doubled spaces (non-breaking ones included), no line breaks or control marks. */
export function trimClean(text: string): string {
  return text
    .replace(/[\r\n\t\u000B\u000C\u0085\u2028\u2029]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u200B\uFEFF]/g, '')
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

export type CaseKind = 'upper' | 'lower' | 'proper'
/** Change Case: Excel's UPPER, LOWER and PROPER (a capital after anything that isn't a letter). */
export function changeCase(text: string, kind: CaseKind): string {
  if (kind === 'upper') return text.toLocaleUpperCase()
  if (kind === 'lower') return text.toLocaleLowerCase()
  let out = '', after = true
  for (const ch of text) {
    const letter = /\p{L}/u.test(ch)
    out += letter ? (after ? ch.toLocaleUpperCase() : ch.toLocaleLowerCase()) : ch
    after = !letter && !/['’]/.test(ch)
  }
  return out
}

/**
 * Convert Text to Numbers: the number in a value typed or pasted as text
 * (stray or non-breaking spaces, "1 200", a trailing minus, Arabic digits), as
 * the sheet reads numbers; null when there's none.
 */
export function toNumber(text: string): string | null {
  const t = trimClean(text)
  if (!t) return null
  if (parseNumber(t) !== null) return t
  let x = t.replace(/(\d)[ \u00A0\u202F'](?=\d{3}\b)/g, '$1')
  if (/^[^-]*\d-$/.test(x)) x = '-' + x.slice(0, -1)
  return parseNumber(x) !== null ? x : null
}

/** A number kept as text (Excel's green corner): Text format over a value that reads as a number. */
export function storedAsText(text: string, numKind: string | undefined): boolean {
  return numKind === 'text' && text.trim() !== '' && toNumber(text) !== null
}

/** Fill Blanks from Above, one column: each empty cell takes the nearest value above it in the selection. */
export function blanksFromAbove(values: string[]): (string | null)[] {
  let last: string | null = null
  return values.map(v => { if (v.trim()) { last = v; return null } return last })
}

// ─── Paste Special › Operation ──────────────────────────────────────────────

export type PasteOp = 'add' | 'sub' | 'mul' | 'div'
/** A cell's value after the operation, or null when it isn't a number (skipped and counted). Division by zero is refused before this. */
export function applyOp(text: string, by: number, op: PasteOp): string | null {
  if (!text.trim()) return null
  const n = parseNumber(text)
  if (n === null) return null
  const r = op === 'add' ? n + by : op === 'sub' ? n - by : op === 'mul' ? n * by : n / by
  return String(Number(r.toPrecision(15)))
}

// ─── Advanced Filter: the criteria range ────────────────────────────────────

export type CritOp = 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le' | 'begins'
export interface Criterion { col: string; op: CritOp; value: string }

/**
 * One criteria cell, as Excel reads it: `>1000`, `<=5`, `<>Draft`, `=Meta`
 * (exactly Meta), `=` (blank), `<>` (not blank), and plain text, which finds
 * values that begin with it (`Meta` finds Meta and Meta Ads). `*` and `?` are
 * wildcards in text.
 */
export function readCriterion(cell: string): { op: CritOp; value: string } | null {
  const t = cell.trim()
  if (!t) return null
  const m = /^(<>|>=|<=|=|>|<)(.*)$/.exec(t)
  if (!m) return parseNumber(t) !== null ? { op: 'eq', value: t } : { op: 'begins', value: t }
  const ops: Record<string, CritOp> = { '<>': 'ne', '>=': 'ge', '<=': 'le', '=': 'eq', '>': 'gt', '<': 'lt' }
  return { op: ops[m[1]], value: m[2].trim() }
}

/** Whether a value meets one criterion. */
export function meets(text: string, c: { op: CritOp; value: string }): boolean {
  const v = text.trim()
  const n = parseNumber(v), x = parseNumber(c.value)
  const o = { matchCase: false, whole: true }
  switch (c.op) {
    case 'begins': return wildRegex(c.value + '*', o).test(v)
    case 'eq': case 'ne': {
      const same = c.value === '' ? v === '' : n !== null && x !== null ? n === x : wildRegex(c.value, o).test(v)
      return c.op === 'eq' ? same : !same
    }
    default: {
      if (!v) return false
      if (n !== null && x !== null) return c.op === 'gt' ? n > x : c.op === 'lt' ? n < x : c.op === 'ge' ? n >= x : n <= x
      if (n !== null || x !== null) return false
      const d = v.localeCompare(c.value, undefined, { sensitivity: 'base', numeric: true })
      return c.op === 'gt' ? d > 0 : c.op === 'lt' ? d < 0 : c.op === 'ge' ? d >= 0 : d <= 0
    }
  }
}

/**
 * The criteria range read into groups: its first row names columns of the
 * list (by heading, ignoring case); each row below is one group whose
 * conditions must all match (AND); a row matches if any group does (OR).
 * Errors: a heading that isn't in the list, or no conditions at all.
 */
export function readCriteria(range: string[][], headings: { col: string; name: string }[]): { groups: Criterion[][] } | { error: 'heading' | 'empty'; name?: string } {
  if (range.length < 2) return { error: 'empty' }
  const cols: (string | null)[] = range[0].map(h => {
    const name = h.trim().toLocaleLowerCase()
    if (!name) return null
    return headings.find(x => x.name.trim().toLocaleLowerCase() === name)?.col ?? `?${h.trim()}`
  })
  const bad = cols.find(c => c?.startsWith('?'))
  if (bad) return { error: 'heading', name: bad.slice(1) }
  const groups: Criterion[][] = []
  for (const row of range.slice(1)) {
    const g: Criterion[] = []
    row.forEach((cell, i) => { const col = cols[i]; const c = col ? readCriterion(cell) : null; if (col && c) g.push({ col, ...c }) })
    if (g.length) groups.push(g)
  }
  return groups.length ? { groups } : { error: 'empty' }
}

/** Whether a row passes the criteria: any group whose conditions all hold. */
export const passesCriteria = (groups: Criterion[][], cell: (col: string) => string) =>
  !groups.length || groups.some(g => g.every(c => meets(cell(c.col), c)))

/** The rows that pass, keeping only the first of identical rows when `unique` (indexes into `rows`). */
export function advancedPlan(rows: string[][], cols: string[], groups: Criterion[][], unique: boolean): number[] {
  const seen = new Set<string>(), out: number[] = []
  rows.forEach((r, i) => {
    if (!passesCriteria(groups, col => r[cols.indexOf(col)] ?? '')) return
    if (unique) { const k = dupKey(r); if (seen.has(k)) return; seen.add(k) }
    out.push(i)
  })
  return out
}
