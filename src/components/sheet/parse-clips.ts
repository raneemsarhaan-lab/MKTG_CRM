/**
 * Reading rows pasted from a spreadsheet (spec 008 FR-032–FR-034,
 * contracts/paste-format.md). Pure: the HTML reader takes its DOMParser as an
 * argument, so the rest runs in Node.
 */
import { parseClipFileName, fileNameKey, FILE_RE } from '@/lib/clip-file-name'

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
}
export interface UnmatchedRow {
  /** What was pasted, for the person to recognise the row. */
  cells: string[]
  title: string
  file_name: string
  link: string | null
}
export interface PastePreview {
  fresh: ParsedClip[]
  existing: ParsedClip[]
  unmatched: UnmatchedRow[]
  /** Non-empty rows past MAX_PASTE_ROWS, left out. */
  overflow: number
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

/**
 * Sorts pasted rows into new clips, clips already in the sheet (same file name
 * under this video, ignoring letter case) and rows without a clip file name.
 * A file name repeated within the paste counts as already there.
 */
export function parseClipRows(cells: PastedCell[][], existingFileNames: Iterable<string>): PastePreview {
  const have = new Set(Array.from(existingFileNames, fileNameKey))
  const out: PastePreview = { fresh: [], existing: [], unmatched: [], overflow: 0 }
  let taken = 0
  for (const row of cells) {
    const r = readRow(row)
    if (!r) continue
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
