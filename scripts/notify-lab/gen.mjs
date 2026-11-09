// Build-time helper for the notifications lab: notify.css holds the design
// tokens (every :root block), the sheet block (avatars, .fx-sheet-sr) and the
// notifications block of globals.css. No Tailwind.
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
const notify = block('/* ─── notifications (spec 012', null)
fs.writeFileSync(path.join(OUT, 'notify.css'), `${roots.join('\n')}\n\n${sheet}\n\n${notify}`)
