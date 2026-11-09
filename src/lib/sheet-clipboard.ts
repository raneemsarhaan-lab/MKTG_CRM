/**
 * The sheets' clipboard (spec 013 R4, FR-020–FR-024). Pure: the HTML reader
 * takes its DOMParser as an argument, so the rest runs in Node.
 *
 * Copy writes two formats: an HTML table (Excel and Google Sheets read it, and
 * it keeps line breaks inside cells) and tab-separated text with Excel's
 * quoting (a cell holding a tab, a quote or a line break is wrapped in quotes,
 * with inner quotes doubled). Paste reads the HTML table when there is one,
 * otherwise the text with the same quoting rules. Cell text is kept exactly;
 * formulas arrive as the value Excel or Sheets put on the clipboard.
 */

export interface ClipCell {
  /** The cell's text, exactly: line breaks and inner spaces kept. */
  text: string
  /** The cell's first http(s) link, when the source had one. */
  href: string | null
}

type Parser = { parseFromString(s: string, type: 'text/html'): Document }

const NBSP = / /g
const URL_RE = /^https?:\/\/\S+$/i
const BLOCK = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

/** A cell's text as a spreadsheet shows it: <br> and blocks become line breaks. */
function cellText(node: Node): string {
  let out = ''
  const walk = (n: Node) => {
    if (n.nodeType === 3) { out += (n.nodeValue ?? '').replace(NBSP, ' '); return }
    if (n.nodeType !== 1) return
    const el = n as Element
    if (el.tagName === 'BR') { out += '\n'; return }
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT') return
    const block = BLOCK.has(el.tagName)
    if (block && out && !out.endsWith('\n')) out += '\n'
    el.childNodes.forEach(walk)
    if (block && out && !out.endsWith('\n')) out += '\n'
  }
  node.childNodes.forEach(walk)
  // HTML source whitespace (indentation, the line break after <td>) isn't content.
  return out.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/^\n+|\n+$/g, '').replace(/[ \t]{2,}/g, ' ')
}

/** Whether a clipboard HTML fragment holds a table worth reading. */
export function hasTable(html: string | null | undefined): boolean {
  return !!html && /<t[rd][\s>]/i.test(html)
}

/** text/html → rows of cells. Reads the first table; colspan leaves empty cells after a cell, as spreadsheets do. */
export function parseHtmlTable(html: string, parser: Parser): ClipCell[][] {
  const doc = parser.parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  const rows = Array.from((table ?? doc).querySelectorAll('tr'))
  return rows.map(tr => {
    const out: ClipCell[] = []
    for (const td of Array.from(tr.children)) {
      if (td.tagName !== 'TD' && td.tagName !== 'TH') continue
      const a = td.querySelector('a[href]')
      const href = a?.getAttribute('href') ?? null
      out.push({ text: cellText(td), href: href && /^https?:/i.test(href) ? href : null })
      const span = Math.min(200, Number(td.getAttribute('colspan') ?? 1) || 1)
      for (let i = 1; i < span; i++) out.push({ text: '', href: null })
    }
    return out
  })
}

/** text/plain → rows of cells, with Excel's quoting: "a""b" → a"b, and quoted cells may hold tabs and line breaks. */
export function parseTsv(text: string): ClipCell[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let i = 0
  const n = text.length
  let atStart = true
  while (i < n) {
    const ch = text[i]
    if (atStart && ch === '"') {
      // A quoted cell: read to the closing quote that ends the cell.
      let j = i + 1, val = '', closed = false
      while (j < n) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') { val += '"'; j += 2; continue }
          closed = true; j++; break
        }
        val += text[j++]
      }
      const next = text[j]
      if (closed && (j >= n || next === '\t' || next === '\n' || next === '\r')) {
        cell = val; i = j; atStart = false
        continue
      }
      // Not a well-formed quoted cell: read it as plain text.
    }
    if (ch === '\t') { row.push(cell); cell = ''; atStart = true; i++; continue }
    if (ch === '\r' || ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; atStart = true
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1
      continue
    }
    cell += ch; atStart = false; i++
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map(r => r.map(t => {
    const text = t.replace(NBSP, ' ')
    return { text, href: URL_RE.test(text.trim()) ? text.trim() : null }
  }))
}

/** A paste: the HTML table when there is one, otherwise the text. */
export function parseClipboard(input: { html?: string | null; text?: string | null }, parser?: Parser): ClipCell[][] {
  if (parser && hasTable(input.html)) {
    const cells = parseHtmlTable(input.html as string, parser)
    if (cells.length) return cells
  }
  return parseTsv(input.text ?? '')
}

/** The plain text of a paste, as a grid of strings, trailing empty rows removed. */
export function toGrid(cells: ClipCell[][]): string[][] {
  const g = cells.map(r => r.map(c => c.text))
  while (g.length && g[g.length - 1].every(t => t === '')) g.pop()
  return g
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
const quoteTsv = (s: string) => (/[\t\n\r"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** Cells → what goes on the clipboard: an HTML table and Excel-quoted tab-separated text. */
export function serialise(grid: string[][]): { html: string; text: string } {
  const text = grid.map(r => r.map(quoteTsv).join('\t')).join('\n')
  const body = grid.map(r => `<tr>${r.map(c => `<td>${escHtml(c).replace(/\r?\n/g, '<br>')}</td>`).join('')}</tr>`).join('')
  const html = `<meta charset="utf-8"><table><tbody>${body}</tbody></table>`
  return { html, text }
}

/**
 * Where a paste lands (FR-022, FR-023): a single value over a selected block
 * fills the block; anything else is placed once from the top-left.
 */
export function pastePlan(grid: string[][], target: { r0: number; c0: number; r1: number; c1: number }): { rows: number; cols: number; value: (r: number, c: number) => string } {
  const single = grid.length === 1 && grid[0].length === 1
  const h = target.r1 - target.r0 + 1, w = target.c1 - target.c0 + 1
  if (single && (h > 1 || w > 1)) return { rows: h, cols: w, value: () => grid[0][0] }
  const cols = Math.max(0, ...grid.map(r => r.length))
  return { rows: grid.length, cols, value: (r, c) => grid[r]?.[c] ?? '' }
}
