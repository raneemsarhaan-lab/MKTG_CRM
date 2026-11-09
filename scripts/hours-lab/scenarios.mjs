// Runs the hours lab: the pure checks, then the browser scenarios once the UI
// exists (scenarios/index.mjs). Run all: npm run lab:hours   Some: npm run lab:hours -- parse csv
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runPure } from './pure.mjs'

const LAB = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(LAB, '../..')
const filters = process.argv.slice(2)
const results = (await runPure(LAB, ROOT)).filter(r => !filters.length || filters.some(f => r.id.includes(f)))
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id}${r.ok ? '' : ': ' + r.error}`)
let failed = results.filter(r => !r.ok).length
let total = results.length
const ui = path.join(LAB, 'scenarios/index.mjs')
if (fs.existsSync(ui) && fs.existsSync(path.join(LAB, 'out/bundle.js'))) {
  const { runUi } = await import('./ui-runner.mjs')
  const r = await runUi(filters)
  failed += r.failed; total += r.total
}
console.log(`\n${total - failed}/${total} passed`)
process.exit(failed ? 1 : 0)
