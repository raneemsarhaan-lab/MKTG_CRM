/**
 * Custom number formats (spec 020 tips 23–25, research R7). Pure.
 *
 * Excel's grammar, the part that needs no formulas or dates:
 * - up to four sections, `positive;negative;zero;text` (`;;;` hides a value);
 * - `0` (a digit, always shown) and `#` (a digit, shown when it matters);
 * - `,` between digits for the thousands separator, and trailing `,` to scale
 *   by a thousand each (`#,##0,"K"`, `0.0,,"M"`);
 * - `.` and the decimals after it, `%` (×100);
 * - text in quotes, `\x`, and the characters Excel shows as they are
 *   (`$ - + / ( ) : ! ^ & ' ~ { } < > =` and space);
 * - `@` in the text section, for the cell's text.
 *
 * Anything else (colours, conditions, dates, `_` and `*` padding, E+) is
 * refused with a reason, never half-read.
 */

export const MAX_PATTERN = 60
export type PatternError = 'empty' | 'long' | 'sections' | 'color' | 'date' | 'pad' | 'sci' | 'quote' | 'char'

type Tok = { t: 'd'; ch: '0' | '#' } | { t: 'dot' } | { t: 'comma' } | { t: 'pct' } | { t: 'lit'; s: string } | { t: 'at' }
interface Section { toks: Tok[] }
export interface CustomFormat { sections: Section[] }

const PLAIN = new Set([...'$-+/():!^&\'~{}<>= '])

/** Splits on `;` outside quotes and escapes. */
function splitSections(p: string): string[] | null {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]
    if (q) { cur += ch; if (ch === '"') q = false; continue }
    if (ch === '\\') { cur += ch + (p[i + 1] ?? ''); i++; continue }
    if (ch === '"') { q = true; cur += ch; continue }
    if (ch === ';') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (q) return null
  out.push(cur)
  return out
}

function tokenize(s: string, textSection: boolean): Tok[] | PatternError {
  const toks: Tok[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '"') {
      const end = s.indexOf('"', i + 1)
      if (end < 0) return 'quote'
      toks.push({ t: 'lit', s: s.slice(i + 1, end) }); i = end; continue
    }
    if (ch === '\\') { if (i + 1 >= s.length) return 'char'; toks.push({ t: 'lit', s: s[i + 1] }); i++; continue }
    if (ch === '[') return 'color'
    if (ch === '_' || ch === '*') return 'pad'
    if (ch === '@') { if (!textSection) return 'char'; toks.push({ t: 'at' }); continue }
    if (textSection) { if (PLAIN.has(ch)) { toks.push({ t: 'lit', s: ch }); continue } return /[dmyhs]/i.test(ch) ? 'date' : 'char' }
    if (ch === '0' || ch === '#') { toks.push({ t: 'd', ch }); continue }
    if (ch === '.') { toks.push({ t: 'dot' }); continue }
    if (ch === ',') { toks.push({ t: 'comma' }); continue }
    if (ch === '%') { toks.push({ t: 'pct' }); continue }
    if (ch === 'E' || ch === 'e') { if (s[i + 1] === '+' || s[i + 1] === '-') return 'sci'; return 'date' }
    if (ch === '?') return 'char'
    if (/[dmyhs]/i.test(ch)) return 'date'
    if (PLAIN.has(ch)) { toks.push({ t: 'lit', s: ch }); continue }
    return 'char'
  }
  return toks
}

/** The format read from a pattern, or why it can't be. */
export function parsePattern(pattern: string): CustomFormat | { error: PatternError } {
  if (!pattern.trim() && pattern !== ';;;') return { error: 'empty' }
  if (pattern.length > MAX_PATTERN) return { error: 'long' }
  const parts = splitSections(pattern)
  if (!parts) return { error: 'quote' }
  if (parts.length > 4) return { error: 'sections' }
  const sections: Section[] = []
  for (let i = 0; i < parts.length; i++) {
    const toks = tokenize(parts[i], i === 3)
    if (typeof toks === 'string') return { error: toks }
    sections.push({ toks })
  }
  return { sections }
}
export const patternError = (p: string): PatternError | null => { const f = parsePattern(p); return 'error' in f ? f.error : null }

const AR = '٠١٢٣٤٥٦٧٨٩'
const localDigits = (s: string, ar: boolean) => (ar ? s.replace(/\d/g, d => AR[+d]).replace(/,/g, '٬').replace(/\./g, '٫') : s)

/** One section applied to a non-negative number. */
function applySection(sec: Section, v: number, ar: boolean): string {
  const toks = sec.toks
  const digitIdx = toks.map((t, i) => (t.t === 'd' ? i : -1)).filter(i => i >= 0)
  if (!digitIdx.length) {
    // Only literals (and %): Excel shows them as they are.
    return toks.map(t => (t.t === 'lit' ? t.s : t.t === 'pct' ? '%' : '')).join('')
  }
  const lastDigit = digitIdx[digitIdx.length - 1]
  const dotAt = toks.findIndex(t => t.t === 'dot')
  const pct = toks.filter(t => t.t === 'pct').length
  // A comma with no digit after it scales; one between integer digits groups.
  let scale = 0, group = false
  toks.forEach((t, i) => {
    if (t.t !== 'comma') return
    if (i > lastDigit) scale++
    else if ((dotAt < 0 || i < dotAt) && digitIdx.some(d => d < i)) group = true
  })
  const intToks = dotAt < 0 ? toks : toks.slice(0, dotAt)
  const fracDigits = dotAt < 0 ? [] : toks.slice(dotAt + 1).filter((t): t is Tok & { t: 'd' } => t.t === 'd').map(t => t.ch)
  let x = v * Math.pow(100, pct) / Math.pow(1000, scale)
  const dp = fracDigits.length
  x = Math.round(x * Math.pow(10, dp)) / Math.pow(10, dp)
  const fixed = x.toFixed(dp)
  let [intPart, fracPart = ''] = fixed.split('.')
  // Decimals: drop trailing zeros where the placeholder is #.
  let keep = fracPart.length
  while (keep > 0 && fracDigits[keep - 1] === '#' && fracPart[keep - 1] === '0') keep--
  fracPart = fracPart.slice(0, keep)
  // Integer digits.
  const intDigitToks = intToks.filter((t): t is Tok & { t: 'd' } => t.t === 'd')
  const zeros = intDigitToks.filter(t => t.ch === '0').length
  if (intPart === '0' && !zeros) intPart = ''
  intPart = intPart.padStart(zeros, '0')
  let intOut: string
  if (group || !intDigitToks.length) {
    const grouped = group ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart
    // The grouped number sits where the first integer digit is; literals keep their places.
    let placed = false
    intOut = intToks.map(t => {
      if (t.t === 'd') { if (placed) return ''; placed = true; return localDigits(grouped, ar) }
      if (t.t === 'lit') return t.s
      if (t.t === 'pct') return '%'
      return ''
    }).join('')
    if (!intDigitToks.length) intOut += localDigits(grouped, ar)
  } else {
    // Fill the placeholders right to left; the first takes whatever is left (`000-0000`).
    const out: string[] = []
    let rest = intPart
    const firstDigit = intToks.findIndex(t => t.t === 'd')
    for (let i = intToks.length - 1; i >= 0; i--) {
      const t = intToks[i]
      if (t.t === 'd') {
        if (i === firstDigit) { out.unshift(localDigits(rest, ar)); rest = '' }
        else if (rest) { out.unshift(localDigits(rest.slice(-1), ar)); rest = rest.slice(0, -1) }
        else out.unshift(t.ch === '0' ? localDigits('0', ar) : '')
      } else if (t.t === 'lit') out.unshift(t.s)
      else if (t.t === 'pct') out.unshift('%')
    }
    intOut = out.join('')
  }
  if (dotAt < 0) return intOut
  // The decimals, with the literals and % after the point in their places.
  let fi = 0
  const after = toks.slice(dotAt + 1).map(t => {
    if (t.t === 'd') { const d = fracPart[fi++]; return d === undefined ? '' : localDigits(d, ar) }
    if (t.t === 'lit') return t.s
    if (t.t === 'pct') return '%'
    return ''
  }).join('')
  return intOut + (ar ? '٫' : '.') + after
}

/**
 * What a cell shows under a custom format. Numbers go through the sections;
 * text uses the fourth section (or shows as typed when there isn't one). A
 * pattern that can't be read shows the value as typed.
 */
export function formatCustom(text: string, pattern: string, n: number | null, lang = 'en'): string {
  const f = parsePattern(pattern)
  if ('error' in f) return text
  const ar = lang.startsWith('ar')
  const s = f.sections
  if (n === null) {
    if (s.length < 4) return text
    return s[3].toks.map(t => (t.t === 'at' ? text : t.t === 'lit' ? t.s : '')).join('')
  }
  if (n > 0 || (n === 0 && s.length < 3)) {
    // One section: negatives use it too, with a minus.
    return applySection(s[0], n, ar)
  }
  if (n < 0) {
    if (s.length === 1) { const out = applySection(s[0], -n, ar); return /[1-9١-٩]/.test(out) ? `-${out}` : out }
    return applySection(s[1], -n, ar)
  }
  return applySection(s[2], 0, ar)
}
