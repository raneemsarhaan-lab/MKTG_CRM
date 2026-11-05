/**
 * Reading rows pasted from a spreadsheet (spec 008 FR-032–FR-034,
 * contracts/paste-format.md). Pure: the HTML reader takes its DOMParser as an
 * argument, so the rest runs in Node.
 *
 * Spec 010 (FR-050, FR-052): when the paste starts with a heading row, a
 * column whose heading matches a custom column's current name fills that
 * column, and is kept out of the title guess. Headings nothing answers to are
 * listed as not imported.
 */
import { parseClipFileName, fileNameKey, FILE_RE } from '@/lib/clip-file-name'
import { headingKey, isCustomKey, type PasteTarget } from '@/lib/sheet-columns'

export interface PastedCell { text: string; href: string | null }

/** At most this many rows are read from one paste. */
export const MAX_PASTE_ROWS = 200

export interface ParsedClip {
  file_name: string
  clip_no: number
  source: string
  in_ms: number
  out_ms: number
  title: string
  link: string | null
  /** Cells under custom columns' headings, by column key (spec 010). */
  custom?: Record<string, PastedCell>
}
export interface UnmatchedRow {
  /** What was pasted, for the person to recognise the row. */
  cells: string[]
  title: string
  file_name: string
  link: string | null
  custom?: Record<string, PastedCell>
}
export interface PastePreview {
  fresh: ParsedClip[]
  existing: ParsedClip[]
  unmatched: UnmatchedRow[]
  /** Non-empty rows past MAX_PASTE_ROWS, left out. */
  overflow: number
  /** Pasted headings no column answers to (spec 010 FR-052). */
  unknown: string[]
  /** Custom column keys the paste fills. */
  matched: string[]
}

const URL_RE = /^https?:\/\/\S+$/i
const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** text/html from Google Sheets (or any table): rows of cells, each with its first link. */
export function cellsFromHtml(html: string, parser: { parseFromString(s: string, type: 'text/html'): Document }): PastedCell[][] {
  const doc = parser.parseFromString(html, 'text/html')
  doc.querySelectorAll('style, script').forEach(n => n.remove())
  return Array.from(doc.querySelectorAll('tr')).map(tr =>
    Array.from(tr.querySelectorAll('td, th')).map(td => {
      const a = td.querySelector('a[href]') as HTMLAnchorElement | null
      const href = a?.getAttribute('href') ?? null
      return { text: clean(td.textContent ?? ''), href: href && /^https?:/i.test(href) ? href : null }
    }))
}

/** text/plain: rows on new lines, cells on tabs. A cell that is a bare link is that row's link. */
export function cellsFromText(text: string): PastedCell[][] {
  return text.split(/\r?\n/).map(line => line.split('\t').map(c => {
    const t = clean(c)
    return { text: t, href: URL_RE.test(t) ? t : null }
  }))
}

/** Whether a paste looks like rows (more than one cell, or a clip file name), not a single value. */
export function looksLikeRows(cells: PastedCell[][]): boolean {
  const rows = cells.filter(r => r.some(c => c.text))
  if (rows.length > 1) return true
  return rows.length === 1 && (rows[0].filter(c => c.text).length > 1 || rows[0].some(c => FILE_RE.test(c.text)))
}

/** One row → a clip, or an unmatched row, or null when it is empty. */
export function readRow(row: PastedCell[]): { clip: ParsedClip } | { unmatched: UnmatchedRow } | null {
  const cells = row.filter(c => c.text || c.href)
  if (!cells.some(c => c.text)) return null
  const fileCell = cells.find(c => parseClipFileName(c.text))
  const link = cells.find(c => c.href)?.href ?? null
  const title = cells
    .filter(c => c !== fileCell && c.text && !URL_RE.test(c.text) && !(c.href && c.text === c.href) && !FILE_RE.test(c.text))
    .map(c => c.text)
    .sort((a, b) => b.length - a.length)[0] ?? ''
  if (!fileCell) {
    return { unmatched: { cells: cells.map(c => c.text).filter(Boolean), title: title.slice(0, 200), file_name: '', link } }
  }
  const p = parseClipFileName(fileCell.text)!
  return { clip: { file_name: fileCell.text, ...p, title: (title || fileCell.text).slice(0, 200), link } }
}

/** Headings the clip reader understands without a column of the same name. */
const CLIP_HEADINGS = new Set([
  'title', 'name', 'clip', 'cliptitle', 'suggestedtitle', 'filename', 'file', 'link', 'drivelink', 'drive', 'url', 'cliplink', 'files',
])
const hnorm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '')

interface Heading { at: number; keys: (string | null)[]; unknown: string[] }

/**
 * The paste's heading row, if it has one: the first non-empty row, holding no
 * clip file name, with a custom column's name or two names the sheet knows.
 */
export function findHeading(cells: PastedCell[][], targets: PasteTarget[]): Heading | null {
  if (!targets.length) return null
  const at = cells.findIndex(r => r.some(c => c.text))
  if (at < 0) return null
  const row = cells[at]
  if (row.some(c => parseClipFileName(c.text))) return null
  const keys = row.map(c => headingKey(c.text, targets))
  const known = row.filter((c, i) => c.text && (keys[i] || CLIP_HEADINGS.has(hnorm(c.text)))).length
  if (!keys.some(k => k && isCustomKey(k)) && known < 2) return null
  const unknown: string[] = []
  row.forEach((c, i) => {
    const h = c.text.replace(/\s+/g, ' ').trim()
    if (h && !keys[i] && !CLIP_HEADINGS.has(hnorm(h)) && !unknown.some(u => hnorm(u) === hnorm(h))) unknown.push(h)
  })
  return { at, keys: keys.map(k => (k && isCustomKey(k) ? k : null)), unknown }
}

/**
 * Sorts pasted rows into new clips, clips already in the sheet (same file name
 * under this video, ignoring letter case) and rows without a clip file name.
 * A file name repeated within the paste counts as already there.
 */
export function parseClipRows(cells: PastedCell[][], existingFileNames: Iterable<string>, targets: PasteTarget[] = []): PastePreview {
  const have = new Set(Array.from(existingFileNames, fileNameKey))
  const head = findHeading(cells, targets)
  const out: PastePreview = {
    fresh: [], existing: [], unmatched: [], overflow: 0,
    unknown: head?.unknown ?? [], matched: [...new Set((head?.keys ?? []).filter((k): k is string => !!k))],
  }
  let taken = 0
  for (const [i, full] of cells.entries()) {
    if (head && i <= head.at) continue
    // Custom columns' cells are values, not title candidates.
    const custom: Record<string, PastedCell> = {}
    const row = head
      ? full.map((c, j) => {
          const k = head.keys[j]
          if (!k) return c
          if (c.text || c.href) custom[k] = c
          return { text: '', href: null }
        })
      : full
    const read = readRow(row)
    if (!read) continue
    const r = Object.keys(custom).length
      ? ('clip' in read ? { clip: { ...read.clip, custom } } : { unmatched: { ...read.unmatched, custom } })
      : read
    if (taken >= MAX_PASTE_ROWS) { out.overflow++; continue }
    taken++
    if ('unmatched' in r) { out.unmatched.push(r.unmatched); continue }
    const key = fileNameKey(r.clip.file_name)
    if (have.has(key)) { out.existing.push(r.clip); continue }
    have.add(key)
    out.fresh.push(r.clip)
  }
  return out
}
