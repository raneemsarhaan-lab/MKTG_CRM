// Build-time helper for the Inbox lab: inbox.css holds the design tokens
// (every :root block), the sheet block (stage pills and avatars, which the
// Inbox reuses) and the Inbox block of globals.css, without Tailwind.
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
const inbox = block('/* ── The Board Inbox (spec 006', null)
fs.writeFileSync(path.join(OUT, 'inbox.css'), `${roots.join('\n')}\n\n${sheet}\n\n${inbox}`)
