// Build-time helper for the sheet lab: sheet.css holds the design tokens
// (every :root block) and the "Video sheet (spec 008)" block of globals.css,
// without Tailwind (the lab has no PostCSS step).
import fs from 'node:fs'
import path from 'node:path'

const [ROOT, OUT] = process.argv.slice(2)
const css = fs.readFileSync(path.join(ROOT, 'src/app/globals.css'), 'utf8')
const roots = [...css.matchAll(/^:root\s*\{[\s\S]*?^\}/gm)].map(m => m[0])
const start = css.indexOf('/* ─── Video sheet (spec 008)')
const end   = css.indexOf('/* ─── end video sheet')
if (start < 0 || end < 0) throw new Error('globals.css markers moved: update gen.mjs')
fs.writeFileSync(path.join(OUT, 'sheet.css'), `${roots.join('\n')}\n\n${css.slice(start, end)}`)
