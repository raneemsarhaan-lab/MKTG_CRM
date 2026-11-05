// Build-time helper for the header lab: header.css holds the design tokens
// (every :root block), the sheet block (its bar and segmented controls) and
// everything from the Inbox block to the end of globals.css, which includes
// the board header block (spec 011). No Tailwind.
import fs from 'node:fs'
import path from 'node:path'

const [ROOT, OUT] = process.argv.slice(2)
const css = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8')
const roots = [...css.matchAll(/^:root\s*\{[\s\S]*?^\}/gm)].map(m => m[0])
const block = (from, to) => {
  const a = css.indexOf(from)
  const b = to ? css.indexOf(to, a) : css.length
  if (a < 0 || b < 0) throw new Error(`globals.css marker moved: ${from}`)
  return css.slice(a, b)
}
const sheet = block('/* ─── Video sheet (spec 008)', '/* ─── end video sheet')
const rest = block('/* ── The Board Inbox (spec 006', null)
if (!rest.includes('board header (spec 011')) throw new Error('board header block missing')
fs.writeFileSync(path.join(OUT, 'header.css'), `${roots.join('\n')}\n\n${sheet}\n\n${rest}`)
